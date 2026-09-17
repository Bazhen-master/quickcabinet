import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyGeneratedJoinery, getDefaultAutoJointRules } from '../auto-drilling';
import { buildSimpleCabinet } from '../cabinet-builder';
import { createEmptySideJoinery, type SideJoinery } from '../joinery';
import { buildPresadkaNc } from '../nc-export';
import type { Part } from '../part';

// Сверка геометрии автоприсадки с эталоном Базиса.
//
// Модуль 26163-1-01 — тумба 420 x 800 x 319 (размеры с бирок; контур «Переделки» на 6 больше), разобранная из выгрузки:
//   01, 02 — крыша и дно 319x420, накладные (торцевых отверстий у них нет,
//            крепёж идёт сквозь пласть вниз, в торец боковины)
//   03, 04 — боковины 319x768, зеркальные
//   05     — фасад 424x802 на двух петлях
//   06     — задняя стенка ХДФ 400x780 в пазу 5 мм
//
// Заднюю стенку не строим: ни ХДФ, ни паза в модели пока нет, а на присадку
// боковин она всё равно не влияет — в эталоне у боковин ровно 8 отверстий,
// и все они про стык с крышей и дном.
const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'presadka');

const TUMBA = { width: 420, height: 800, depth: 319, thickness: 16 };

function buildTumba(overrides: Partial<typeof TUMBA> = {}): Part[] {
  const carcass = buildSimpleCabinet({
    name: 'Тумба 26163-1-01',
    ...TUMBA,
    ...overrides,
    shelfCount: 0,
    partitionCount: 0,
    withBackPanel: false,
    topMode: 'overlay',
  });

  // Крыша и дно крепятся к боковинам минификсом со шкантом.
  const joinery: SideJoinery = { ...createEmptySideJoinery(), left: 'minifix-dowel', right: 'minifix-dowel' };
  const withJoinery = carcass.map((part) =>
    part.meta?.role === 'top' || part.meta?.role === 'bottom'
      ? { ...part, meta: { ...part.meta, joinery } }
      : part,
  );

  return applyGeneratedJoinery(withJoinery, getDefaultAutoJointRules());
}

/** Разбирает программу присадки в список отверстий вида «M601 T2 x=69.000 гл=34.000». */
function toHoles(nc: string): string[] {
  const holes: string[] = [];
  let face = '?';
  let tool = '?';
  let x = '?';
  for (const line of nc.split('\r\n')) {
    if (/^M6\d\d$/.test(line)) face = line;
    else if (/^T\d$/.test(line)) tool = line;
    else if (line.startsWith('G00 X')) x = line.slice('G00 X'.length);
    else if (line.startsWith('G01 Y')) holes.push(`${face} ${tool} x=${x} гл=${line.slice('G01 Y'.length)}`);
  }
  return holes;
}

function describeParts(parts: Part[]) {
  return parts
    .filter((part) => !part.meta?.hidden)
    .map((part) => {
      const drills = part.operations.filter((op) => op.type === 'drill').length;
      // Уходящие в присадку считаем тем же кодом, что идёт на станок: пласть он отсекает сам.
      const edge = (buildPresadkaNc(part).match(/G01 Y/g) ?? []).length;
      return `${String(part.meta?.role ?? 'panel').padEnd(12)} ${part.width}x${part.height}x${part.thickness}  отверстий: ${drills} (в присадку ${edge})`;
    })
    .join('\n  ');
}

const REFERENCE_SIDE = readFileSync(join(FIXTURES_DIR, '26163-1-01-03.nc'), 'utf8');

/** Отверстия одного торца без кода грани: «T2 x=69.000 гл=34.000». */
function edgePattern(nc: string, face?: string): string[] {
  return toHoles(nc)
    .filter((hole) => (face ? hole.startsWith(`${face} `) : true))
    .map((hole) => hole.replace(/^M6\d\d /, ''));
}

describe('присадка: геометрия против эталона', () => {
  const parts = buildTumba();
  const side = parts.find((part) => part.meta?.role === 'left-side');

  it('тумба собирается и даёт боковину ожидаемого размера', () => {
    console.log('\nсобранная тумба:\n  ' + describeParts(parts));
    expect(side).toBeDefined();
    // Накладная у нас только крыша: 800 - 16 = 784. Накладного дна в редакторе нет,
    // поэтому нижний торец боковины остаётся чистым, а в эталоне он просверлен.
    expect([side!.width, side!.height, side!.thickness]).toEqual([TUMBA.thickness, 784, TUMBA.depth]);
  });

  it('боковина: узор верхнего торца совпадает с эталоном 26163-1-01-03', () => {
    const ours = edgePattern(buildPresadkaNc(side!));
    // Верхний торец боковины — M603: X на нём идёт от противоположного конца, как у эталона.
    const reference = edgePattern(REFERENCE_SIDE, 'M603');
    console.log('\nнаш торец:\n  ' + (ours.join('\n  ') || '(пусто)'));
    console.log('\nэталонный торец M603:\n  ' + reference.join('\n  '));
    // Направление обхода у разных граней разное, поэтому сравниваем набор отверстий,
    // а не их последовательность: порядок внутри грани стережёт побайтовый тест.
    expect([...ours].sort()).toEqual([...reference].sort());
  });

  // Единственная величина, устойчивая по всему эталону: наружное отверстие стоит
  // на 69 от переднего края независимо от глубины — торец 319 даёт 69/58,
  // торец 544 даёт 69/59 и 69/91, торец 804 даёт 69/69. Второй конец общего правила не имеет.
  it('наружное отверстие стоит на 69 от переднего края при любой глубине', () => {
    for (const depth of [319, 544, 804]) {
      const deepSide = buildTumba({ depth }).find((part) => part.meta?.role === 'left-side');
      // Торец M603 отсчитывается от заднего края — переводим обратно от переднего.
      const positions = edgePattern(buildPresadkaNc(deepSide!)).map((hole) =>
        depth - Number.parseFloat(hole.match(/x=([\d.]+)/)![1]),
      );
      expect(Math.min(...positions), `глубина ${depth}`).toBe(69);
    }
  });

  // Число крепёжных точек растёт с длиной торца: эталон держит промежуток между
  // центрами в пределах 190–225 мм, поэтому 319 несёт две пары, 544 — три, 804 — четыре.
  it('число крепёжных пар растёт с глубиной корпуса', () => {
    const pairsAt = (depth: number) => {
      const side = buildTumba({ depth }).find((part) => part.meta?.role === 'left-side');
      return edgePattern(buildPresadkaNc(side!)).length / 2;
    };

    expect(pairsAt(319), 'торец 319').toBe(2);
    expect(pairsAt(544), 'торец 544').toBe(3);
    expect(pairsAt(804), 'торец 804').toBe(4);
  });

  // Средняя пара на торце 544 должна встать туда же, куда её ставит эталон 26163-2-05-03.
  it('средняя пара на торце 544 совпадает с эталоном', () => {
    const side = buildTumba({ depth: 544 }).find((part) => part.meta?.role === 'left-side');
    const positions = edgePattern(buildPresadkaNc(side!))
      .map((hole) => 544 - Number.parseFloat(hole.match(/x=([\d.]+)/)![1]))
      .sort((a, b) => a - b);

    expect(positions.slice(2, 4)).toEqual([261.5, 293.5]);
  });
});
