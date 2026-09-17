import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyGeneratedJoinery, getDefaultAutoJointRules } from '../auto-drilling';
import { buildSimpleCabinet } from '../cabinet-builder';
import { createDrillOperation, getFaceAxis } from '../drill';
import { createEmptySideJoinery, type SideJoinery } from '../joinery';
import { buildPresadkaFiles } from '../nc-export';
import { buildPeredelkaFiles, buildPeredelkaNc, buildPeredelkaPrograms, CONTOUR_CUTTER_RADIUS } from '../peredelka-nc';
import { createPanelPart, type Part, type PartFace } from '../part';

// Перевод детали в программу «Переделки» на тумбе 26163-1-01: по биркам 420 x 800 x 319, в контуре
// «Переделки» на 6 больше (траектория фрезы Ø6), координаты отверстий в программе — на 3.
// Крепёж у нас и у Базиса разный (в эталоне крыша садится со свесом 3 мм и без
// эксцентриков), поэтому отверстия один в один не сравниваются. Сверяется то, что от
// крепежа не зависит: габарит в поле, направление осей и какая пласть смотрит вверх.
const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'peredelka', 'ldsp16');

function buildTumba(withHdf = false): Part[] {
  const carcass = buildSimpleCabinet({
    name: 'Тумба 26163-1-01',
    width: 420,
    height: 800,
    depth: 319,
    thickness: 16,
    shelfCount: 0,
    partitionCount: 0,
    withBackPanel: withHdf,
    backPanelKind: 'hdf',
    topMode: 'overlay',
  });
  const joinery: SideJoinery = { ...createEmptySideJoinery(), left: 'minifix-dowel', right: 'minifix-dowel' };
  return applyGeneratedJoinery(
    carcass.map((part) =>
      part.meta?.role === 'top' || part.meta?.role === 'bottom' ? { ...part, meta: { ...part.meta, joinery } } : part,
    ),
    getDefaultAutoJointRules(),
  );
}

/** Строки программы начиная со смены инструмента, без номеров кадров. */
function blockFrom(nc: string, marker: string): string[] {
  const lines = nc.split('\r\n').map((line) => line.replace(/^N\d+ /, ''));
  return lines.slice(lines.indexOf(marker));
}

/** Блок одного инструмента: от его смены до следующей смены. */
function toolBlock(nc: string, tool: string): string[] {
  const rest = blockFrom(nc, `M06 ${tool}`);
  const next = rest.findIndex((line, index) => index > 0 && line.startsWith('M06 '));
  return next < 0 ? rest : rest.slice(0, next);
}

function panel(size: { width: number; height: number; thickness: number }, ops: Array<{ face: PartFace; x: number; y: number; diameter?: number; depth: number; through?: boolean }>) {
  return createPanelPart({
    ...size,
    operations: ops.map((op) =>
      createDrillOperation({ ...op, axis: getFaceAxis(op.face), diameter: op.diameter ?? 5, through: op.through ?? false }),
    ),
  });
}

describe('переделка: деталь в программу', () => {
  const parts = buildTumba();
  const byRole = (role: string) => parts.find((part) => part.meta?.role === role)!;

  it('крыша режется тем же контуром, что и в эталоне 26163-1-01-01', () => {
    const reference = readFileSync(join(FIXTURES_DIR, 'Detal-1_01-01.NC'), 'utf8');
    const ours = buildPeredelkaNc(buildPeredelkaPrograms(byRole('top')).front);
    expect(blockFrom(ours, 'M06 T2')).toEqual(blockFrom(reference, 'M06 T2'));
  });

  // Толщина плиты — наименьший размер: у стоящей боковины поле `thickness` хранит глубину 319.
  it('Z считается от толщины плиты, а не от поля thickness', () => {
    const program = buildPeredelkaPrograms(byRole('left-side')).front;
    expect(program.thickness).toBe(16);
    expect(buildPeredelkaNc(program)).toContain('G0 Z36.0');
  });

  // В эталоне паз под ХДФ у левой боковины 03 стоит на X308 (задняя кромка на X322 с фрезой),
  // у правой 04 — на X17 (задняя кромка на X3). Значит внутренние пласти двух боковин
  // лежат на столе зеркально: у левой X растёт от переднего края к заднему, у правой — наоборот.
  it('боковины лежат зеркально: X от переднего края у левой и от заднего у правой', () => {
    const cams = (role: string) =>
      buildPeredelkaPrograms(byRole(role)).front.holes
        .filter((hole) => hole.tool === 'T7')
        .map((hole) => hole.x - CONTOUR_CUTTER_RADIUS)
        .sort((a, b) => a - b);
    // Эксцентрики стоят на 69 и 261 от переднего края боковины глубиной 319, как отверстия в присадке эталона.
    expect(cams('left-side')).toEqual([69, 261]);
    expect(cams('right-side')).toEqual([319 - 261, 319 - 69]);
  });

  // Паз под ХДФ (14 от задней кромки),
  // боковины — как 03 (X308, у задней кромки на максимуме X) и 04 (X17).
  describe('паз под ХДФ', () => {
    const withHdf = buildTumba(true);
    const hdfRole = (role: string) => withHdf.find((part) => part.meta?.role === role)!;

    // 1_02-01 — боковина ВМ5 (бирка 420x319): модуль 300x420x319, крыша и дно между боковинами.
    it('боковина ВМ5: блок паза совпадает с эталоном 26163-1-02-01', () => {
      const reference = readFileSync(join(FIXTURES_DIR, 'Detal-1_02-01.NC'), 'utf8');
      const module = buildSimpleCabinet({
        width: 300, height: 420, depth: 319, thickness: 16, shelfCount: 0, partitionCount: 0,
        topMode: 'inset', withBackPanel: true, backPanelKind: 'hdf',
      });
      const blocks = ['left-side', 'right-side'].map((role) =>
        toolBlock(buildPeredelkaNc(buildPeredelkaPrograms(module.find((part) => part.meta?.role === role)!).front), 'T1'));
      expect(blocks).toContainEqual(toolBlock(reference, 'T1'));
    });

    it('боковины: паз у задней кромки, как в 26163-1-01-03 и 04', () => {
      const grooveX = (role: string) => buildPeredelkaPrograms(hdfRole(role)).front.grooves.map((groove) => groove.from.x);
      expect(grooveX('left-side')).toEqual([308]);
      expect(grooveX('right-side')).toEqual([17]);
    });

    it('ХДФ 394x774, как 26163-1-01-06 без вырезов, режется с подходом на толщину 3 мм', () => {
      const nc = buildPeredelkaNc(buildPeredelkaPrograms(hdfRole('back-panel')).front);
      expect(nc).toContain('G1 X407.0 Y787.0');
      expect(nc).toContain('G0 Z23.0');
      expect(buildPeredelkaFiles(withHdf).some((file) => file.path.startsWith('Переделка/3mm/'))).toBe(true);
    });
  });

  // Верхние модули эталона — корпуса высотой 420 разной ширины с ХДФ в пазу и вырезами под
  // регулируемые навесы в обоих верхних углах. Стенка без отверстий, поэтому файл сверяется целиком.
  for (const [file, width] of [['Detal-1_01-06.NC', 800], ['Detal-1_02-06.NC', 300]] as const) {
    it(`ХДФ с вырезами под навесы совпадает с эталоном ${file}`, () => {
      const cabinet = buildSimpleCabinet({
        width, height: 420, depth: 319, thickness: 16, shelfCount: 0, partitionCount: 0,
        withBackPanel: true, backPanelKind: 'hdf', withHangers: true, topMode: 'overlay',
      });
      const hdf = cabinet.find((part) => part.meta?.role === 'back-panel')!;
      const reference = readFileSync(join(FIXTURES_DIR, '..', 'hdf3', file), 'utf8');
      expect(buildPeredelkaNc(buildPeredelkaPrograms(hdf).front)).toBe(reference);
    });
  }

  it('инструмент выбирается по диаметру и глубине', () => {
    const part = panel({ width: 400, height: 700, thickness: 16 }, [
      { face: 'back', x: 21.5, y: 100, diameter: 35, depth: 12.5 },
      { face: 'back', x: 50, y: 100, diameter: 15, depth: 13 },
      { face: 'back', x: 100, y: 100, diameter: 3, depth: 2 },
      { face: 'back', x: 150, y: 100, diameter: 8, depth: 12 },
      { face: 'back', x: 200, y: 100, diameter: 5, depth: 11 },
    ]);
    expect(buildPeredelkaPrograms(part).front.holes.map((hole) => hole.tool)).toEqual(['T8', 'T7', 'T3', 'T6', 'T6']);
  });

  // Как в эталоне 26163-1-01-02: лицевая — пласть, где больше глухих операций; сквозные
  // сверлятся с неё же; обратная сторона без контура, без смещения поля и зеркальна по X.
  it('обратная сторона: меньшая пласть, без контура, зеркальна по X', () => {
    const part = panel({ width: 400, height: 700, thickness: 16 }, [
      { face: 'front', x: 30, y: 50, depth: 11 },
      { face: 'front', x: 60, y: 50, depth: 11 },
      { face: 'back', x: 30, y: 50, depth: 11 },
      { face: 'back', x: 100, y: 50, depth: 16 },
    ]);
    const { front, back } = buildPeredelkaPrograms(part);

    expect(front.holes).toHaveLength(3);
    expect(front.holes.filter((hole) => hole.through)).toHaveLength(1);
    expect(front.contour).not.toBeNull();

    expect(back).not.toBeNull();
    expect(back!.origin).toBe(0);
    expect(back!.contour).toBeNull();
    const [backHole] = back!.holes;
    const frontTwin = front.holes.find((hole) => !hole.through && hole.y - CONTOUR_CUTTER_RADIUS === backHole.y && hole.x - CONTOUR_CUTTER_RADIUS + backHole.x === 400);
    expect(frontTwin, 'отверстие на обратной пласти зеркально лицевому по X').toBeDefined();
  });

  it('файлы названы той же нумерацией, что и присадка', () => {
    const presadka = buildPresadkaFiles(parts, '26163').map((file) => file.filename.match(/-(\d+-\d+)\.nc$/)![1]);
    const peredelka = buildPeredelkaFiles(parts)
      .filter((file) => file.path.startsWith('Переделка/'))
      .map((file) => file.path.match(/_(\d+-\d+)\.NC$/)![1]);
    expect(peredelka).toEqual(presadka);
    expect(buildPeredelkaFiles(parts)[0].path).toBe('Переделка/16mm/Detal-1_01-01.NC');
  });
});
