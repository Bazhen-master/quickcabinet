import { describe, expect, it } from 'vitest';
import { applyGeneratedJoinery, getDefaultAutoJointRules } from '../auto-drilling';
import {
  buildSimpleCabinet,
  getCabinetModuleState,
  HDF_BACK_THICKNESS,
  HDF_GROOVE_BACK_OFFSET,
  HDF_GROOVE_DEPTH,
  HDF_GROOVE_ENGAGEMENT,
  rebuildCabinetGroup,
  type CabinetBuildInput,
} from '../cabinet-builder';
import { isDrillOperation, isGrooveOperation } from '../drill';
import { getFacePointWorld } from '../face-coords';
import { boundsIntersect, getBounds } from '../geometry';
import type { Part } from '../part';

// Задняя стенка из ХДФ в пазу (как верхние модули эталона 26163).
const rules = getDefaultAutoJointRules();
const GROOVED_ROLES = ['left-side', 'right-side', 'top', 'bottom'];

function createHdfCabinet(overrides: Partial<CabinetBuildInput> = {}) {
  return applyGeneratedJoinery(
    buildSimpleCabinet({
      width: 900, height: 2000, depth: 560, thickness: 16, shelfCount: 3, partitionCount: 1,
      withBackPanel: true, backPanelKind: 'hdf', ...overrides,
    }),
    rules,
  );
}

const byRole = (parts: Part[], role: string) => parts.filter((part) => part.meta?.role === role);
const hdfOf = (parts: Part[]) => byRole(parts, 'back-panel')[0]!;

describe('ХДФ в пазу', () => {
  for (const [label, overrides] of [
    ['простой корпус', {}],
    ['цоколь и два яруса', { withPlinth: true, tierCount: 2, tierHeight: 900 }],
    ['вкладная крыша', { topMode: 'inset' as const }],
  ] as const) {
    describe(label, () => {
      const parts = createHdfCabinet(overrides);
      const back = parts[0]!.position.z - 560 / 2;

      it('одна стенка 3 мм на 6 больше проёма, в 17 от задней кромки, без крепежа', () => {
        const panels = byRole(parts, 'back-panel');
        expect(panels).toHaveLength(1);
        const hdf = panels[0]!;
        const left = byRole(parts, 'left-side')[0]!;
        const right = byRole(parts, 'right-side')[0]!;
        const bottom = byRole(parts, 'bottom')[0]!;
        const top = byRole(parts, 'top')[0]!;
        const innerWidth = right.position.x - right.width / 2 - (left.position.x + left.width / 2);
        const innerHeight = top.position.y - top.height / 2 - (bottom.position.y + bottom.height / 2);

        expect(hdf.thickness).toBe(HDF_BACK_THICKNESS);
        expect(hdf.width).toBe(innerWidth + HDF_GROOVE_ENGAGEMENT * 2);
        expect(hdf.height).toBe(innerHeight + HDF_GROOVE_ENGAGEMENT * 2);
        expect(hdf.position.z - back).toBe(HDF_GROOVE_BACK_OFFSET);
        expect(hdf.operations).toEqual([]);
      });

      it('паз по всей длине боковин, крыши и дна — напротив стенки и глубже её захода', () => {
        const hdf = hdfOf(parts);
        for (const role of GROOVED_ROLES) {
          const part = byRole(parts, role)[0]!;
          const grooves = part.operations.filter(isGrooveOperation);
          expect(grooves, role).toHaveLength(1);
          const groove = grooves[0]!;
          const start = getFacePointWorld(part, groove.face, groove);
          const end = getFacePointWorld(part, groove.face, { x: groove.x2, y: groove.y2 });
          expect(start.z - back, `${role}: паз в 17 от задней кромки`).toBeCloseTo(HDF_GROOVE_BACK_OFFSET);
          expect(end.z - back).toBeCloseTo(HDF_GROOVE_BACK_OFFSET);
          const length = Math.hypot(end.x - start.x, end.y - start.y);
          expect(length, `${role}: насквозь`).toBeCloseTo(Math.max(part.width, part.height));
          expect(HDF_GROOVE_DEPTH).toBeGreaterThan(HDF_GROOVE_ENGAGEMENT);
          // Паз смотрит внутрь корпуса, туда, где стоит стенка.
          const into = { left: 1, right: -1, top: -1, bottom: 1 }[groove.face as 'left' | 'right' | 'top' | 'bottom'];
          const axis = groove.face === 'left' || groove.face === 'right' ? 'x' : 'y';
          expect(Math.sign(hdf.position[axis] - start[axis]), `${role}: грань паза обращена к стенке`).toBe(-into);
        }
      });

      it('в стенку заходят только боковины, крыша и дно — полки, перегородки и ярусы стоят перед ней', () => {
        const hdf = getBounds([hdfOf(parts)]);
        const intruders = parts
          .filter((part) => part.meta?.role !== 'back-panel' && !GROOVED_ROLES.includes(part.meta?.role ?? ''))
          .filter((part) => boundsIntersect(getBounds([part]), hdf))
          .map((part) => part.meta?.role);
        expect(intruders).toEqual([]);
      });

      it('задняя стенка не даёт отверстий в корпусе', () => {
        const backSources = parts.flatMap((part) => part.operations.filter(isDrillOperation))
          .filter((op) => /back-panel/.test(op.source ?? ''));
        expect(backSources).toEqual([]);
      });
    });
  }

  it('перестроение не дублирует паз и помнит вид стенки', () => {
    const parts = createHdfCabinet();
    const groupId = parts[0]!.meta!.groupId!;
    const { groupId: _, ...draft } = getCabinetModuleState(parts, groupId)!;
    expect(draft.backPanelKind).toBe('hdf');
    const rebuilt = rebuildCabinetGroup(parts, groupId, { ...draft, shelfCount: 4 }, rules);
    for (const role of GROOVED_ROLES) {
      expect(byRole(rebuilt, role)[0]!.operations.filter(isGrooveOperation), role).toHaveLength(1);
    }

    const asPanel = rebuildCabinetGroup(rebuilt, groupId, { ...draft, backPanelKind: 'panel' }, rules);
    expect(asPanel.flatMap((part) => part.operations.filter(isGrooveOperation))).toEqual([]);
    expect(byRole(asPanel, 'back-panel').every((part) => part.thickness === 16)).toBe(true);
  });

  // Крыша уходит в паз на всю глубину, а внутренняя глубина короче — режим крыши
  // раньше определялся по глубине и при любой правке вставная крыша становилась накладной.
  it('перестроение сохраняет вставную крышу', () => {
    const parts = buildSimpleCabinet({
      width: 806, height: 426, depth: 325, thickness: 16, shelfCount: 0, partitionCount: 0,
      topMode: 'inset', withBackPanel: true, backPanelKind: 'hdf',
    });
    const groupId = parts[0]!.meta!.groupId!;
    const { groupId: _, ...draft } = getCabinetModuleState(parts, groupId)!;
    expect(draft.topMode).toBe('inset');
    const rebuilt = rebuildCabinetGroup(parts, groupId, draft, rules);
    expect(byRole(rebuilt, 'top')[0]!.width).toBe(774);
  });
});

// Накладная ХДФ — как у антресолей и пеналов эталона 26163: прибита на задние торцы,
// на 2 мм меньше корпуса с каждой стороны, внутренние детали на всю глубину, пазов нет.
describe('ХДФ накладная', () => {
  const antresol = () => createHdfCabinet({
    width: 836, height: 400, depth: 544, shelfCount: 0, partitionCount: 1, topMode: 'inset', backPanelKind: 'hdf-overlay',
  });

  it('антресоль 836x400: стенка 832x396 за корпусом, перегородка на всю глубину, без пазов', () => {
    const parts = antresol();
    const hdf = hdfOf(parts);
    expect([hdf.width, hdf.height, hdf.thickness]).toEqual([832, 396, 3]);
    const side = byRole(parts, 'left-side')[0]!;
    expect(hdf.position.z + hdf.thickness / 2).toBeCloseTo(side.position.z - side.thickness / 2, 3);
    expect(byRole(parts, 'partition')[0]!.thickness).toBe(544);
    expect(parts.flatMap((part) => part.operations.filter(isGrooveOperation))).toEqual([]);
    expect(hdf.operations).toEqual([]);
  });

  it('с цоколем стенка идёт от низа дна до верха крыши', () => {
    const parts = createHdfCabinet({ withPlinth: true, plinthHeight: 80, backPanelKind: 'hdf-overlay' });
    const hdf = hdfOf(parts);
    const bottom = byRole(parts, 'bottom')[0]!;
    const top = byRole(parts, 'top')[0]!;
    expect(hdf.position.y - hdf.height / 2).toBeCloseTo(bottom.position.y - bottom.height / 2 + 2, 3);
    expect(hdf.position.y + hdf.height / 2).toBeCloseTo(top.position.y + top.height / 2 - 2, 3);
  });

  it('перестроение помнит вид стенки', () => {
    const parts = antresol();
    const groupId = parts[0]!.meta!.groupId!;
    const { groupId: _, ...draft } = getCabinetModuleState(parts, groupId)!;
    expect(draft.backPanelKind).toBe('hdf-overlay');
    expect(draft.topMode).toBe('inset');
    expect(hdfOf(rebuildCabinetGroup(parts, groupId, draft, rules)).width).toBe(832);
  });
});
