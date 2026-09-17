import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPresadkaFiles, buildPresadkaNc } from '../nc-export';
import { createDrillOperation, getFaceAxis } from '../drill';
import { createPanelPart, type PartFace } from '../part';

// Эталон — выгрузка «Базис Мебельщик» по заказу 26163 (158 деталей, папка «Присадка»).
// Это единственный источник истины по формату станка, поэтому файлы лежат рядом с тестом.
const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'presadka');

// Условная деталь лежит пластью к зрителю (как фасад): u — сверху вниз, v — справа налево.
// Отсюда торцы: M601 — правый (X сверху), M603 — левый (X снизу), M604 — верхний (X справа),
// M602 — нижний (X слева).
const MCODE_TO_FACE: Record<string, PartFace> = {
  M601: 'right',
  M603: 'left',
  M604: 'top',
  M602: 'bottom',
};

const TOOL_DIAMETER: Record<string, number> = { T1: 5, T2: 8 };

type ReferenceHole = { mCode: string; tool: string; x: number; depth: number };

/** Разбирает эталонный файл обратно в отверстия: грань, инструмент, позиция вдоль торца, глубина. */
function parseReference(text: string): ReferenceHole[] {
  const holes: ReferenceHole[] = [];
  let mCode = 'M601';
  let tool = 'T1';
  let pendingX = 0;

  for (const line of text.split('\r\n')) {
    if (/^M6\d\d$/.test(line)) mCode = line;
    else if (/^T\d$/.test(line)) tool = line;
    else if (line.startsWith('G00 X')) pendingX = Number.parseFloat(line.slice('G00 X'.length));
    else if (line.startsWith('G01 Y')) {
      // Завершающий «G00 X0.000» не сопровождается врезанием и отверстием не считается.
      holes.push({ mCode, tool, x: pendingX, depth: Number.parseFloat(line.slice('G01 Y'.length)) });
    }
  }

  return holes;
}

// Сторона условной детали: торцы любой эталонной детали на ней помещаются.
const EDGE_LENGTH = 2000;

function partFromHoles(holes: ReferenceHole[]) {
  return createPanelPart({
    width: EDGE_LENGTH,
    height: EDGE_LENGTH,
    thickness: 16,
    operations: holes.map((hole) => {
      const face = MCODE_TO_FACE[hole.mCode];
      // На правом и левом торце позицию задаёт y (вниз от верха), на верхнем и нижнем — x (от левого края).
      const alongHeight = face === 'left' || face === 'right';
      const position = hole.mCode === 'M603' || hole.mCode === 'M604' ? EDGE_LENGTH - hole.x : hole.x;
      return createDrillOperation({
        face,
        axis: getFaceAxis(face),
        x: alongHeight ? 0 : position,
        y: alongHeight ? position : 0,
        diameter: TOOL_DIAMETER[hole.tool],
        depth: hole.depth,
        through: false,
      });
    }),
  });
}

const fixtureNames = readdirSync(FIXTURES_DIR).filter((name) => name.endsWith('.nc'));

describe('присадка: совпадение с эталоном Базиса', () => {
  it('эталон на месте', () => {
    expect(fixtureNames).toHaveLength(158);
  });

  // Отверстия подаём в обратном порядке: генератор обязан сам разложить грани
  // (M601→M602→M603→M604) и отсортировать отверстия по направлению обхода.
  for (const name of fixtureNames) {
    it(`${name} воспроизводится побайтово`, () => {
      const reference = readFileSync(join(FIXTURES_DIR, name), 'utf8');
      const holes = parseReference(reference);
      const part = partFromHoles([...holes].reverse());

      expect(buildPresadkaNc(part)).toBe(reference);
    });
  }

  it('деталь без отверстий — только M30', () => {
    expect(buildPresadkaNc(createPanelPart())).toBe('M30\r\n');
  });

  it('формат одной детали зафиксирован', () => {
    const part = partFromHoles([
      { mCode: 'M601', tool: 'T1', x: 101, depth: 22 },
      { mCode: 'M604', tool: 'T2', x: 250, depth: 34 },
    ]);

    expect(buildPresadkaNc(part)).toBe(
      [
        'M601',
        'T1',
        'G00 Z8.000',
        'G00 X101.000',
        'G01 Y22.000',
        'G00 Y-5.00',
        'M00',
        'M604',
        'T2',
        'G00 Z8.000',
        'G00 X250.000',
        'G01 Y34.000',
        'G00 Y-5.00',
        'G00 X0.000',
        'M30',
        '',
      ].join('\r\n'),
    );
  });

  it('вся выдача укладывается в грамматику станка', () => {
    const allowed = /^(M30|M00|M60[1-4]|T\d|G00 Z\d+\.\d{3}|G00 X\d+\.\d{3}|G00 Y-5\.00|G01 Y\d+\.\d{3})$/;

    for (const name of fixtureNames) {
      const holes = parseReference(readFileSync(join(FIXTURES_DIR, name), 'utf8'));
      const output = buildPresadkaNc(partFromHoles(holes));
      const lines = output.split('\r\n').slice(0, -1);

      for (const line of lines) {
        expect(line, `${name}: строка «${line}»`).toMatch(allowed);
      }
    }
  });
});

describe('присадка: имена файлов', () => {
  it('нумерует как Базис — заказ-изделие-модуль-деталь', () => {
    const files = buildPresadkaFiles(
      [
        createPanelPart({ meta: { groupId: 'шкаф-а' } }),
        createPanelPart({ meta: { groupId: 'шкаф-а' } }),
        createPanelPart({ meta: { groupId: 'шкаф-б' } }),
        createPanelPart(),
      ],
      '26163',
    );

    expect(files.map((file) => file.filename)).toEqual([
      '26163-1-01-01.nc',
      '26163-1-01-02.nc',
      '26163-1-02-01.nc',
      '26163-1-00-01.nc',
    ]);
  });

  it('скрытые детали в выгрузку не попадают', () => {
    const files = buildPresadkaFiles(
      [
        createPanelPart({ meta: { groupId: 'шкаф-а' } }),
        createPanelPart({ meta: { groupId: 'шкаф-а', hidden: true } }),
      ],
      '26163',
    );

    expect(files).toHaveLength(1);
  });
});
