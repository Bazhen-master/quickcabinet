import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPeredelkaNc, PEREDELKA_ORIGIN, type PeredelkaProgram, type PlyTool } from '../peredelka-nc';

// Эталон — «Переделка» и «Обратная сторона» из выгрузки Базиса по заказу 26163.
// Папка задаёт толщину материала: ЛДСП 16 мм и ХДФ 3 мм.
const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

const SETS = [
  { dir: 'peredelka/ldsp16', thickness: 16, origin: PEREDELKA_ORIGIN, count: 142 },
  { dir: 'peredelka/hdf3', thickness: 3, origin: PEREDELKA_ORIGIN, count: 16 },
  { dir: 'obratnaya/ldsp16', thickness: 16, origin: 0, count: 11 },
];

/** Разбирает эталонный файл обратно в программу: пазы, отверстия по инструментам, контур. */
function parseReference(text: string, thickness: number, origin: number): PeredelkaProgram {
  const program: PeredelkaProgram = { thickness, origin, grooves: [], holes: [], contour: null };
  let tool = '';
  let at = { x: 0, y: 0 };
  const local = (x: string, y: string) => ({ x: Number(x) - origin, y: Number(y) - origin });

  for (const raw of text.split('\r\n')) {
    const line = raw.replace(/^N\d+ /, '');
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^M06 (T\d)$/))) tool = m[1];
    else if ((m = line.match(/^G0 X(\S+) Y(\S+)$/))) at = local(m[1], m[2]);
    else if (tool === 'T1' && (m = line.match(/^G1 X(\S+) Y(\S+) F4000$/))) {
      const groove = program.grooves[program.grooves.length - 1];
      groove.to = local(m[1], m[2]);
    } else if (tool === 'T1' && (m = line.match(/^G1 Z(\S+) F2500$/))) {
      program.grooves.push({ from: at, to: at, depth: thickness - Number(m[1]) });
    } else if (tool === 'T2' && (m = line.match(/^G1 X(\S+) Y(\S+)(?: Z-0\.1| F6000)?$/))) {
      program.contour ??= [];
      program.contour.push(local(m[1], m[2]));
    } else if ((m = line.match(/^G1 Z(\S+)  F\d+$/))) {
      const z = Number(m[1]);
      program.holes.push({ tool: tool as PlyTool, ...at, through: z < 0, depth: z < 0 ? thickness : thickness - z });
    }
  }

  // Контур в файле замкнут повтором первой точки, программа хранит его без повтора.
  program.contour?.pop();
  return program;
}

describe('переделка: совпадение с эталоном Базиса', () => {
  for (const set of SETS) {
    const dir = join(FIXTURES_DIR, set.dir);
    const names = readdirSync(dir).filter((name) => name.endsWith('.NC'));

    it(`${set.dir}: эталон на месте`, () => {
      expect(names).toHaveLength(set.count);
    });

    // Отверстия подаём в обратном порядке: обход генератор обязан выстроить сам.
    for (const name of names) {
      it(`${set.dir}/${name} воспроизводится побайтово`, () => {
        const reference = readFileSync(join(dir, name), 'utf8');
        const program = parseReference(reference, set.thickness, set.origin);
        program.holes.reverse();
        expect(buildPeredelkaNc(program)).toBe(reference);
      });
    }
  }
});
