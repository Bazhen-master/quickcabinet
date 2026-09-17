import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDefaultAutoJointRules } from '../auto-drilling';
import {
  buildSimpleCabinet,
  getCabinetModuleState,
  getCabinetOpenings,
  rebuildCabinetGroup,
  setFrontOnOpening,
  toOpeningRef,
  type CabinetBuildInput,
} from '../cabinet-builder';
import type { CabinetFrontHinge, CabinetFrontKind } from '../cabinet-layout';
import { createEmptySideJoinery, type SideJoinery } from '../joinery';
import { buildPresadkaNc } from '../nc-export';
import type { Part } from '../part';
import { buildPeredelkaNc, buildPeredelkaPrograms } from '../peredelka-nc';

// Отчёт «26163: совпало N из 158» — насколько редактор воспроизводит заказ целиком.
//
// Каждый модуль эталона описан входом строителя (или не описан — тогда все его детали
// считаются несовпавшими). Деталь совпала, если её присадка, переделка и обратная сторона
// побайтово равны файлам какой-то нашей детали того же модуля. Номера деталей у нас и у
// Базиса разные, поэтому сопоставляем по содержимому, а при расхождении — по габариту,
// чтобы отчёт показал, в каком именно файле разница.
//
// Верхний ряд (изделие 1) — корпуса ВМ высотой 420 и глубиной 319 разной ширины (размеры с бирок;
// контур в «Переделке» на 6 больше — это траектория фрезы):
// боковины 325x426, крыша и дно вставные между ними, ХДФ в пазу с вырезами под навесы.
const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const TOTAL_PARTS = 158;

/** Не опускаться ниже достигнутого: поднимать, когда модуль начинает совпадать. */
const BASELINE_MATCHED = 36;

type ModuleSpec = {
  input: CabinetBuildInput;
  /** Крепёж крыши, дна и перегородок. */
  joinery?: SideJoinery;
  /** Фасады по проёмам слева направо (по одному на проём). */
  fronts?: Array<{ kind: CabinetFrontKind; hinge: CabinetFrontHinge }>;
};

const UPPER = {
  height: 420, depth: 319, thickness: 16, shelfCount: 0, partitionCount: 0,
  topMode: 'inset', withBackPanel: true, backPanelKind: 'hdf', withHangers: true,
} as const;
// Антресоли 2_06–2_08: 836x400x544, перегородка посередине, по двери на секцию с петлями у боковин,
// ХДФ накладная. Пенал 2_02: 836x2230x544 на цоколе 80, двустворчатая дверь, ХДФ накладная
// на ножках, с двумя задними царгами (низ на 500 и 1548 от пола).
const ANTRESOL: ModuleSpec = {
  input: {
    width: 836, height: 400, depth: 544, thickness: 16, shelfCount: 0, partitionCount: 1,
    topMode: 'inset', withBackPanel: true, backPanelKind: 'hdf-overlay',
  },
  fronts: [{ kind: 'door', hinge: 'left' }, { kind: 'door', hinge: 'right' }],
};
const PENCIL_2_02: ModuleSpec = {
  input: {
    width: 836, height: 2230, depth: 544, thickness: 16, shelfCount: 0, partitionCount: 0,
    topMode: 'inset', withBackPanel: true, backPanelKind: 'hdf-overlay', withPlinth: true, plinthHeight: 80, plinthKind: 'kitchen',
    backRailElevations: [500, 1548],
  },
  fronts: [{ kind: 'double', hinge: 'left' }],
};
const CONFIRMAT_DOWEL: SideJoinery = { ...createEmptySideJoinery(), left: 'confirmat-dowel', right: 'confirmat-dowel', top: 'confirmat-dowel', bottom: 'confirmat-dowel' };

const MODULES: Record<string, ModuleSpec | null> = {
  '1_01': { input: { ...UPPER, width: 800 }, joinery: CONFIRMAT_DOWEL, fronts: [{ kind: 'flap', hinge: 'top' }] },
  '1_02': { input: { ...UPPER, width: 300 }, joinery: CONFIRMAT_DOWEL, fronts: [{ kind: 'flap', hinge: 'top' }] },
  '1_03': null,
  '1_04': null,
  '1_05': { input: { ...UPPER, width: 600 }, joinery: CONFIRMAT_DOWEL, fronts: [{ kind: 'flap', hinge: 'top' }] },
  '1_06': null,
  '2_01': null,
  '2_02': { ...PENCIL_2_02, joinery: CONFIRMAT_DOWEL },
  '2_03': null,
  '2_04': null,
  '2_05': null,
  '2_06': { ...ANTRESOL, joinery: CONFIRMAT_DOWEL },
  '2_07': { ...ANTRESOL, joinery: CONFIRMAT_DOWEL },
  '2_08': { ...ANTRESOL, joinery: CONFIRMAT_DOWEL },
};

type PartFiles = { size: string; presadka: string; peredelka: string; obratnaya: string | null };
type ReferencePart = PartFiles & { id: string };

/** Габарит по контуру переделки (деталь + фреза): «16:325x426», меньшая сторона первой. */
function contourSize(nc: string, thickness: number): string {
  const xs: number[] = [];
  const ys: number[] = [];
  let tool = '';
  for (const raw of nc.split('\r\n')) {
    const line = raw.replace(/^N\d+ /, '');
    const toolMatch = line.match(/^M06 (T\d)$/);
    if (toolMatch) tool = toolMatch[1];
    const move = tool === 'T2' ? line.match(/^G1 X(\S+) Y(\S+)/) : null;
    if (move) {
      xs.push(Number(move[1]));
      ys.push(Number(move[2]));
    }
  }
  const [a, b] = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)].sort((p, q) => p - q);
  return `${thickness}:${a}x${b}`;
}

function loadReference(): Map<string, ReferencePart[]> {
  const byModule = new Map<string, ReferencePart[]>();
  for (const [dir, thickness] of [['ldsp16', 16], ['hdf3', 3]] as const) {
    for (const name of readdirSync(join(FIXTURES_DIR, 'peredelka', dir))) {
      const [, module, index] = name.match(/^Detal-(\d_\d\d)-(\d\d)\.NC$/)!;
      const peredelka = readFileSync(join(FIXTURES_DIR, 'peredelka', dir, name), 'utf8');
      const backPath = join(FIXTURES_DIR, 'obratnaya', dir, name);
      const part: ReferencePart = {
        id: `${module}-${index}`,
        size: contourSize(peredelka, thickness),
        presadka: readFileSync(join(FIXTURES_DIR, 'presadka', `26163-${module.replace('_', '-')}-${index}.nc`), 'utf8'),
        peredelka,
        obratnaya: existsSync(backPath) ? readFileSync(backPath, 'utf8') : null,
      };
      byModule.set(module, [...(byModule.get(module) ?? []), part]);
    }
  }
  return byModule;
}

function buildModule(spec: ModuleSpec): Part[] {
  const rules = getDefaultAutoJointRules();
  let parts = buildSimpleCabinet(spec.input);
  const groupId = parts[0]!.meta!.groupId!;
  const { groupId: _, ...draft } = getCabinetModuleState(parts, groupId)!;
  let layout = draft.layout;
  if (spec.fronts) {
    const openings = [...getCabinetOpenings(parts, groupId)].sort((a, b) => a.startX - b.startX);
    spec.fronts.forEach((front, index) => {
      const opening = openings[index]!;
      const next = setFrontOnOpening(parts, groupId, toOpeningRef(opening, opening), front);
      if (next) {
        layout = next;
        parts = buildSimpleCabinet({ ...spec.input, groupId, layout });
      }
    });
  }
  if (spec.joinery) {
    const joinery = spec.joinery;
    parts = parts.map((part) =>
      part.meta?.role === 'top' || part.meta?.role === 'bottom' || part.meta?.role === 'partition' ? { ...part, meta: { ...part.meta, joinery } } : part,
    );
  }
  return rebuildCabinetGroup(parts, groupId, { ...draft, layout }, rules);
}

function toFiles(part: Part): PartFiles {
  const { front, back } = buildPeredelkaPrograms(part);
  const peredelka = buildPeredelkaNc(front);
  return {
    size: contourSize(peredelka, front.thickness),
    presadka: buildPresadkaNc(part),
    peredelka,
    obratnaya: back ? buildPeredelkaNc(back) : null,
  };
}

type ModuleReport = { module: string; matched: string[]; differs: string[]; missing: string[]; extra: string[] };

function compareModule(module: string, reference: ReferencePart[], built: PartFiles[] | null): ModuleReport {
  const report: ModuleReport = { module, matched: [], differs: [], missing: [], extra: [] };
  if (!built) {
    report.missing = reference.map((part) => part.id);
    return report;
  }
  const left = [...built];
  const take = (index: number) => left.splice(index, 1)[0]!;
  const unmatched: ReferencePart[] = [];

  for (const ref of reference) {
    const index = left.findIndex((ours) =>
      ours.size === ref.size && ours.presadka === ref.presadka && ours.peredelka === ref.peredelka && ours.obratnaya === ref.obratnaya,
    );
    if (index >= 0) {
      take(index);
      report.matched.push(ref.id);
    } else {
      unmatched.push(ref);
    }
  }

  for (const ref of unmatched) {
    const index = left.findIndex((ours) => ours.size === ref.size);
    if (index < 0) {
      report.missing.push(`${ref.id} (${ref.size})`);
      continue;
    }
    const ours = take(index);
    const files = [
      ours.presadka !== ref.presadka && 'присадка',
      ours.peredelka !== ref.peredelka && 'переделка',
      ours.obratnaya !== ref.obratnaya && 'обратная',
    ].filter(Boolean);
    report.differs.push(`${ref.id} (${ref.size}): ${files.join(', ')}`);
  }

  report.extra = left.map((ours) => ours.size);
  return report;
}

describe('заказ 26163: сверка всего комплекта', () => {
  const reference = loadReference();

  it('эталон на месте и все модули описаны', () => {
    expect([...reference.values()].flat()).toHaveLength(TOTAL_PARTS);
    expect(Object.keys(MODULES).sort()).toEqual([...reference.keys()].sort());
  });

  it(`совпало не меньше ${BASELINE_MATCHED} из ${TOTAL_PARTS}`, () => {
    const reports = [...reference.keys()].sort().map((module) => {
      const spec = MODULES[module];
      return compareModule(module, reference.get(module)!, spec ? buildModule(spec).filter((p) => !p.meta?.hidden).map(toFiles) : null);
    });

    const matched = reports.reduce((sum, report) => sum + report.matched.length, 0);
    const lines = reports.map((report) => {
      const total = report.matched.length + report.differs.length + report.missing.length;
      if (!MODULES[report.module]) return `${report.module}: не описан (${total} дет.)`;
      return [
        `${report.module}: совпало ${report.matched.length} из ${total}`,
        ...report.differs.map((line) => `    отличается ${line}`),
        ...report.missing.map((line) => `    нет детали ${line}`),
        ...report.extra.map((line) => `    лишняя ${line}`),
      ].join('\n');
    });
    console.log(`\n26163: совпало ${matched} из ${TOTAL_PARTS}\n${lines.join('\n')}`);
    // Для разбора расхождений: REPORT_DUMP=<папка> выгружает наши файлы по модулям.
    const dumpDir = process.env.REPORT_DUMP;
    if (dumpDir) {
      mkdirSync(dumpDir, { recursive: true });
      for (const [module, spec] of Object.entries(MODULES)) {
        if (!spec) continue;
        buildModule(spec).filter((part) => !part.meta?.hidden).forEach((part, index) => {
          const files = toFiles(part);
          const name = `${module}-${String(index + 1).padStart(2, '0')}-${part.meta?.role ?? 'part'}-${files.size.replace(':', '_')}`;
          writeFileSync(join(dumpDir, `${name}.presadka.nc`), files.presadka);
          writeFileSync(join(dumpDir, `${name}.peredelka.NC`), files.peredelka);
          if (files.obratnaya) writeFileSync(join(dumpDir, `${name}.obratnaya.NC`), files.obratnaya);
        });
      }
    }

    expect(matched).toBeGreaterThanOrEqual(BASELINE_MATCHED);
  });
});
