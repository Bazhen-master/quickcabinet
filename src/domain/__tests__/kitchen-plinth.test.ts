import { describe, expect, it } from 'vitest';
import { applyGeneratedJoinery, getDefaultAutoJointRules } from '../auto-drilling';
import { getConfirmatDowelPositions } from '../auto-joinery/confirmat-dowel';
import {
  buildSimpleCabinet,
  getCabinetModuleState,
  getCabinetOpenings,
  rebuildCabinetGroup,
  setFrontOnOpening,
  toOpeningRef,
} from '../cabinet-builder';
import { isDrillOperation } from '../drill';
import { getDrillConflictIds } from '../drill-spacing';
import { boundsIntersect, getBounds } from '../geometry';
import { createEmptySideJoinery } from '../joinery';
import type { Part } from '../part';

// Пенал на ножках и конфирмат со шкантом — по эталону Базиса 26163 (пенал 2_02, антресоли, ВМ).
const rules = getDefaultAutoJointRules();
const byRole = (parts: Part[], role: string) => parts.filter((part) => part.meta?.role === role);

describe('конфирмат со шкантом: раскладка по эталону', () => {
  const pairs = (length: number, layout = {}) => getConfirmatDowelPositions(length, layout).map(({ confirmat, dowel }) => [confirmat, dowel]);

  it('ВМ глубиной 319: 69/101 и 261/229', () => {
    expect(pairs(319)).toEqual([[69, 101], [261, 229]]);
  });

  it('антресоль 544 с накладной ХДФ: задний на шаг дальше — 453/421', () => {
    expect(pairs(544, { backReserve: 32 })).toEqual([[69, 101], [261, 293], [453, 421]]);
    expect(pairs(544)).toEqual([[69, 101], [261, 293], [485, 453]]);
  });

  it('цоколь 804: 69/293/517/741, шкант к середине', () => {
    expect(pairs(804)).toEqual([[69, 101], [293, 325], [517, 485], [741, 709]]);
  });

  it('царга 250: 69/101 и 197/165; перегородка — только крайние пары', () => {
    expect(pairs(250)).toEqual([[69, 101], [197, 165]]);
    expect(pairs(544, { spread: 'ends', backReserve: 32 })).toEqual([[69, 101], [453, 421]]);
  });

  it('дно на ножках: передняя пара — один конфирмат на 37', () => {
    expect(pairs(544, { backReserve: 32, frontSingle: true })).toEqual([[37, null], [261, 293], [453, 421]]);
  });
});

describe('пенал на ножках', () => {
  const confirmatDowel = { ...createEmptySideJoinery(), left: 'confirmat-dowel', right: 'confirmat-dowel' } as const;
  const build = () => {
    const base = buildSimpleCabinet({
      width: 836, height: 2230, depth: 544, thickness: 16, shelfCount: 0, partitionCount: 0, topMode: 'inset',
      withBackPanel: true, backPanelKind: 'hdf-overlay', withPlinth: true, plinthHeight: 80, plinthKind: 'kitchen',
      backRailElevations: [500, 1548],
    });
    const groupId = base[0]!.meta!.groupId!;
    const [opening] = getCabinetOpenings(base, groupId);
    const layout = setFrontOnOpening(base, groupId, toOpeningRef(opening!, opening!), { kind: 'double', hinge: 'left' })!;
    const { groupId: _, ...draft } = getCabinetModuleState(base, groupId)!;
    const withJoinery = base.map((part) => (part.meta?.role === 'top' || part.meta?.role === 'bottom' ? { ...part, meta: { ...part.meta, joinery: confirmatDowel } } : part));
    return { parts: rebuildCabinetGroup(withJoinery, groupId, { ...draft, layout }, rules), groupId };
  };

  it('одна планка цоколя с отступом 8, фасады до 30 от пола', () => {
    const { parts } = build();
    expect(byRole(parts, 'plinth-back')).toEqual([]);
    const [plinth] = byRole(parts, 'plinth-front');
    const side = byRole(parts, 'left-side')[0]!;
    expect(side.position.z + side.thickness / 2 - (plinth!.position.z + plinth!.thickness / 2)).toBeCloseTo(8, 3);
    const doors = [...byRole(parts, 'front-left'), ...byRole(parts, 'front-right')];
    expect(doors).toHaveLength(2);
    for (const door of doors) {
      expect(door.position.y - door.height / 2).toBeCloseTo(30, 3);
      expect(door.height).toBe(2198);
    }
  });

  it('ножки: 4 сквозных в дне, по 4 метки на боковинах; царги на заданных высотах', () => {
    const { parts } = build();
    const bottom = byRole(parts, 'bottom')[0]!;
    expect(bottom.operations.filter(isDrillOperation).filter((op) => op.templateName === 'Leg' && op.through)).toHaveLength(4);
    for (const role of ['left-side', 'right-side']) {
      expect(byRole(parts, role)[0]!.operations.filter(isDrillOperation).filter((op) => op.templateName === 'Leg mark'), role).toHaveLength(4);
    }
    const rails = byRole(parts, 'back-rail');
    expect(rails.map((rail) => rail.position.y - rail.height / 2)).toEqual([500, 1548]);
    for (const rail of rails) expect(rail.operations.filter(isDrillOperation)).toHaveLength(8);
  });

  it('корпус без пересечений и столкновений отверстий', () => {
    const { parts } = build();
    const carcass = parts.filter((part) => ['left-side', 'right-side', 'top', 'bottom', 'back-rail', 'plinth-front'].includes(part.meta?.role ?? ''));
    const hits = carcass.flatMap((a, i) => carcass.slice(i + 1).filter((b) => boundsIntersect(getBounds([a]), getBounds([b]))).map((b) => `${a.meta?.role} × ${b.meta?.role}`));
    expect(hits).toEqual([]);
    expect(applyGeneratedJoinery(parts, rules).filter((part) => getDrillConflictIds(part).length > 0).map((part) => part.meta?.role)).toEqual([]);
  });

  it('перестроение помнит вид цоколя и царги', () => {
    const { parts, groupId } = build();
    const state = getCabinetModuleState(parts, groupId)!;
    expect(state.plinthKind).toBe('kitchen');
    expect(state.backRailElevations).toEqual([500, 1548]);
    const { groupId: _, ...draft } = state;
    const rebuilt = rebuildCabinetGroup(parts, groupId, { ...draft, backRailElevations: [700] }, rules);
    expect(byRole(rebuilt, 'back-rail')).toHaveLength(1);
    expect(byRole(rebuilt, 'plinth-front')).toHaveLength(1);
  });
});
