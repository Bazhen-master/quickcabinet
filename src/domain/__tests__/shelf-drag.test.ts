import { describe, expect, it } from 'vitest';
import { getDefaultAutoJointRules } from '../auto-drilling';
import { addShelfToLayoutSection, buildSimpleCabinet, getCabinetModuleState, getLeafTierSections, rebuildCabinetGroup } from '../cabinet-builder';
import { setShelfElevations } from '../cabinet-layout';
import { getShelfDragRange, getShelfSnapTargets, snapShelfY } from '../shelf-drag';
import type { Part } from '../part';

const rules = getDefaultAutoJointRules();

/** Two sections: two shelves on the left, one on the right. */
function createCabinet() {
  let parts = rebuildOnce(buildSimpleCabinet({ width: 1200, height: 2000, depth: 560, thickness: 16, shelfCount: 0, partitionCount: 1 }));
  const [left, right] = getLeafTierSections(moduleOf(parts));
  for (const section of [left!, left!, right!]) {
    const module = moduleOf(parts);
    const { layout } = addShelfToLayoutSection(module, section.id, section.tierId);
    parts = rebuildWith(parts, layout);
  }
  return parts;
}

function moduleOf(parts: Part[]) {
  const module = getCabinetModuleState(parts, parts[0]!.meta!.groupId!);
  if (!module) throw new Error('no module');
  return module;
}

function rebuildWith(parts: Part[], layout: ReturnType<typeof moduleOf>['layout']) {
  const { groupId, ...draft } = moduleOf(parts);
  return rebuildCabinetGroup(parts, groupId, { ...draft, layout, shelfCount: layout.shelves.length, partitionCount: layout.partitions.length }, rules);
}

function rebuildOnce(parts: Part[]) {
  const { groupId, ...draft } = getCabinetModuleState(parts, parts[0]!.meta!.groupId!)!;
  return rebuildCabinetGroup(parts, groupId, draft, rules);
}

const shelves = (parts: Part[]) => parts.filter((part) => part.meta?.role === 'shelf').sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);

describe('shelf drag', () => {
  it('moves between the panels below and above, and snaps to shelves of the other section only', () => {
    const parts = createCabinet();
    const [lowerLeft, upperLeft, right] = shelves(parts);
    const range = getShelfDragRange(parts, lowerLeft!);
    const bottom = parts.find((part) => part.meta?.role === 'bottom')!;
    expect(range.min).toBeCloseTo(bottom.position.y + bottom.height / 2 + lowerLeft!.height / 2, 3);
    expect(range.max).toBeCloseTo(upperLeft!.position.y - upperLeft!.height / 2 - lowerLeft!.height / 2, 3);

    const targets = getShelfSnapTargets(parts, lowerLeft!);
    expect(targets.map((target) => target.partId)).toEqual([right!.id]);

    expect(snapShelfY(right!.position.y + 20, range, targets, 25)).toEqual({ y: right!.position.y, target: targets[0] });
    expect(snapShelfY(right!.position.y + 40.4, range, targets, 25).target).toBeNull();
    expect(snapShelfY(-5000, range, targets, 25).y).toBeCloseTo(range.min, 3);
  });

  it('a snapped height stored as the elevation rebuilds the shelf level with its neighbour', () => {
    const parts = createCabinet();
    const [lowerLeft, , right] = shelves(parts);
    const module = moduleOf(parts);
    // Lower left shelf sits at 1/3 of the section, the right one at 1/2: the right one is inside the lower shelf's range.
    const range = getShelfDragRange(parts, lowerLeft!);
    const { y } = snapShelfY(right!.position.y - 10, range, getShelfSnapTargets(parts, lowerLeft!), 25);
    const moved = rebuildWith(parts, setShelfElevations(module.layout, new Map([[lowerLeft!.meta!.sourceId!, y - module.position.y]])));
    const movedShelf = moved.find((part) => part.meta?.sourceId === lowerLeft!.meta!.sourceId)!;
    expect(movedShelf.position.y).toBeCloseTo(right!.position.y, 3);
  });
});
