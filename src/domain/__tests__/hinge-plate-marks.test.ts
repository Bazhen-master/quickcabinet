import { describe, expect, it } from 'vitest';
import { applyGeneratedJoinery, getDefaultAutoJointRules } from '../auto-drilling';
import {
  buildSimpleCabinet,
  getCabinetModuleState,
  getCabinetOpenings,
  rebuildCabinetGroup,
  setFrontOnOpening,
  toOpeningRef,
  type CabinetBuildInput,
} from '../cabinet-builder';
import { isDrillOperation, type DrillOperation } from '../drill';
import { getDrillConflictIds } from '../drill-spacing';
import { getFacePointWorld } from '../face-coords';
import { buildPeredelkaPrograms } from '../peredelka-nc';
import type { Part } from '../part';

// Метки под ответную планку петли — по эталону Базиса 26163: пара глубиной 2 на 37 от
// передней кромки корпуса, через 32, центр пары на высоте чашки.
const rules = getDefaultAutoJointRules();
const FRONT_ROLES = new Set(['front-left', 'front-right', 'front-flap']);

function build(input: Partial<CabinetBuildInput>) {
  return applyGeneratedJoinery(
    buildSimpleCabinet({ width: 1200, height: 900, depth: 560, thickness: 16, shelfCount: 0, partitionCount: 2, withFronts: true, ...input }),
    rules,
  );
}

const drills = (part: Part, feature: DrillOperation['feature']) =>
  part.operations.filter(isDrillOperation).filter((op) => op.feature === feature);

type Mark = { part: Part; op: DrillOperation; world: ReturnType<typeof getFacePointWorld> };

function allMarks(parts: Part[]): Mark[] {
  return parts.flatMap((part) => drills(part, 'hinge-plate').map((op) => ({ part, op, world: getFacePointWorld(part, op.face, op) })));
}

/** Каждая чашка получает ровно одну пару меток на своей высоте (или по своей оси у откидного). */
function expectPairsForEveryCup(parts: Part[], label: string) {
  const marks = allMarks(parts);
  const fronts = parts.filter((part) => FRONT_ROLES.has(part.meta?.role ?? ''));
  expect(fronts.length, label).toBeGreaterThan(0);
  let cupCount = 0;
  for (const front of fronts) {
    const flap = front.meta?.role === 'front-flap';
    for (const cupOp of drills(front, 'hinge-cup')) {
      cupCount += 1;
      const cup = getFacePointWorld(front, cupOp.face, cupOp);
      const along = (point: { x: number; y: number }) => (flap ? point.x - cup.x : point.y - cup.y);
      const across = (point: { x: number; y: number }) => (flap ? point.y - cup.y : point.x - cup.x);
      const pair = marks.filter((mark) => Math.abs(along(mark.world)) <= 16.001 && Math.abs(across(mark.world)) < 60);
      expect(pair.map((mark) => Math.round(along(mark.world))).sort((a, b) => a - b), `${label}: пара через 32 вокруг чашки`).toEqual([-16, 16]);

      for (const { part, op, world } of pair) {
        expect(op.depth, label).toBe(2);
        const carcassFront = part.position.z + part.thickness / 2;
        const frontInner = front.position.z - front.thickness / 2;
        expect(carcassFront - world.z, `${label}: отступ от передней кромки`).toBeCloseTo(37 + Math.max(0, carcassFront - frontInner));
      }
    }
  }
  expect(marks, label).toHaveLength(cupCount * 2);
}

describe('метки под ответную планку петли', () => {
  it('накладные двери у боковин и полунакладная у перегородки', () => {
    const parts = build({});
    expectPairsForEveryCup(parts, 'накладные');
    const hosts = new Set(allMarks(parts).map((mark) => mark.part.meta?.role));
    expect(hosts).toEqual(new Set(['left-side', 'right-side', 'partition']));
  });

  it('вкладные двери: отступ растёт на глубину фасада в корпусе', () => {
    expectPairsForEveryCup(build({ frontMode: 'inset' }), 'вкладные');
  });

  it('откидной фасад: метки на крыше', () => {
    const base = build({ partitionCount: 0, withFronts: false });
    const groupId = base[0]!.meta!.groupId!;
    const [opening] = getCabinetOpenings(base, groupId);
    const layout = setFrontOnOpening(base, groupId, toOpeningRef(opening!, opening!), { kind: 'flap', hinge: 'top' })!;
    const { groupId: _, ...draft } = getCabinetModuleState(base, groupId)!;
    const parts = rebuildCabinetGroup(base, groupId, { ...draft, layout }, rules);
    expectPairsForEveryCup(parts, 'откидной');
    expect(new Set(allMarks(parts).map((mark) => mark.part.meta?.role))).toEqual(new Set(['top']));
  });

  it('метки не конфликтуют с остальной присадкой', () => {
    for (const parts of [build({}), build({ frontMode: 'inset' }), build({ shelfCount: 3, withBackPanel: true })]) {
      const conflicts = parts.filter((part) => getDrillConflictIds(part).length > 0).map((part) => part.meta?.role);
      expect(conflicts).toEqual([]);
    }
  });

  // Тумба 26163-1-01 с дверью на правой петле: в эталоне метки на правой боковине 04 стоят
  // на X285 (37 от передней кромки боковины глубиной 319 плюс 3 на фрезу, X=0 у задней), инструмент T3, Z14.
  it('в «Переделке» метки уходят на T3 на X285, как в 26163-1-01-04', () => {
    const base = build({ width: 420, height: 800, depth: 319, partitionCount: 0, withFronts: false });
    const groupId = base[0]!.meta!.groupId!;
    const [opening] = getCabinetOpenings(base, groupId);
    const layout = setFrontOnOpening(base, groupId, toOpeningRef(opening!, opening!), { kind: 'door', hinge: 'right' })!;
    const { groupId: _, ...draft } = getCabinetModuleState(base, groupId)!;
    const parts = rebuildCabinetGroup(base, groupId, { ...draft, layout }, rules);

    const rightSide = parts.find((part) => part.meta?.role === 'right-side')!;
    const marks = buildPeredelkaPrograms(rightSide).front.holes.filter((hole) => hole.tool === 'T3');
    expect(marks).toHaveLength(4);
    expect(new Set(marks.map((hole) => hole.x))).toEqual(new Set([285]));
    expect(marks.every((hole) => hole.depth === 2)).toBe(true);
    expect(allMarks(parts).filter((mark) => mark.part.meta?.role === 'left-side')).toEqual([]);
  });
});
