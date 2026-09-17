import { describe, expect, it } from 'vitest';
import { applyGeneratedJoinery, getDefaultAutoJointRules } from '../auto-drilling';
import {
  addPartitionToLayoutSection,
  buildSimpleCabinet,
  getCabinetModuleState,
  extendOpeningRef,
  getCabinetOpenings,
  setFrontOnOpening,
  type CabinetOpeningRef,
  getDefaultTierSection,
  getDrawerBlockFacadeHeight,
  getLeafTierSections,
  getLocalZonesForSection,
  rebuildCabinetGroup,
  removeCabinetElementFromLayout,
  type CabinetBuildInput,
  type CabinetModuleState,
} from '../cabinet-builder';
import { OVERLAY_FRONT_BOTTOM_EDGE_GAP, OVERLAY_FRONT_MIDDLE_GAP, OVERLAY_FRONT_TOP_EDGE_GAP } from '../cabinet/constants';
import { setShelfApron, upsertDrawerBlockInSection, type CabinetLayout, type DrawerBlockInput } from '../cabinet-layout';
import { buildCabinetPreset, CABINET_PRESETS, type CabinetPresetId } from '../cabinet-presets';
import { getDrillConflictIds } from '../drill-spacing';
import { getFacePointWorld } from '../face-coords';
import { boundsIntersect, getBounds } from '../geometry';
import { createEmptySideJoinery, type SideJoinery } from '../joinery';
import type { Part, PartRole } from '../part';

const rules = getDefaultAutoJointRules();
const CARCASS_ROLES = new Set<PartRole | undefined>(['left-side', 'right-side', 'top', 'bottom', 'partition', 'shelf', 'tier-divider', 'back-panel', 'drawer-column']);

function createCabinet(overrides: Partial<CabinetBuildInput> = {}) {
  return applyGeneratedJoinery(
    buildSimpleCabinet({ width: 1200, height: 2000, depth: 560, thickness: 16, shelfCount: 0, partitionCount: 1, ...overrides }),
    rules
  );
}

function moduleOf(parts: Part[]): CabinetModuleState {
  const groupId = parts[0]?.meta?.groupId;
  const module = groupId ? getCabinetModuleState(parts, groupId) : null;
  if (!module) throw new Error('cabinet module not found');
  return module;
}

function rebuildWith(parts: Part[], layout: CabinetLayout) {
  const { groupId, ...draft } = moduleOf(parts);
  return rebuildCabinetGroup(parts, groupId, { ...draft, layout, shelfCount: layout.shelves.length, partitionCount: layout.partitions.length }, rules);
}

function blockInput(patch: Partial<DrawerBlockInput> = {}): DrawerBlockInput {
  return {
    anchor: 'bottom',
    offset: 0,
    drawerCount: 3,
    columns: 1,
    slotHeight: 200,
    withBackPanel: true,
    runnerType: 'hidden-unihoper',
    runnerLength: 450,
    runnerLengthMode: 'manual',
    ...patch,
  };
}

function addBlock(parts: Part[], sectionIndex: number, patch?: Partial<DrawerBlockInput>) {
  const module = moduleOf(parts);
  const section = getLeafTierSections(module)[sectionIndex];
  if (!section) throw new Error(`section ${sectionIndex} not found`);
  const { layout, drawerStack } = upsertDrawerBlockInSection(module.layout, section.id, section.tierId, blockInput(patch));
  expect(drawerStack).not.toBeNull();
  return rebuildWith(parts, layout);
}

function withJoinery(parts: Part[], role: PartRole, patch: Partial<SideJoinery>) {
  return applyGeneratedJoinery(
    parts.map((part) => (part.meta?.role === role ? { ...part, meta: { ...part.meta, joinery: { ...createEmptySideJoinery(), ...patch } } } : part)),
    rules
  );
}

const byRole = (parts: Part[], role: PartRole) => parts.filter((part) => part.meta?.role === role);
const localDividers = (parts: Part[]) => parts.filter((part) => part.meta?.role === 'tier-divider' && !part.meta.sourceId?.startsWith('tier-divider:'));

function carcassOverlaps(parts: Part[]) {
  const carcass = parts.filter((part) => CARCASS_ROLES.has(part.meta?.role));
  const hits: string[] = [];
  for (let i = 0; i < carcass.length; i += 1) {
    for (let j = i + 1; j < carcass.length; j += 1) {
      if (boundsIntersect(getBounds([carcass[i]!]), getBounds([carcass[j]!]))) hits.push(`${carcass[i]!.name} × ${carcass[j]!.name}`);
    }
  }
  return hits;
}

const partsWithDrillConflicts = (parts: Part[]) => parts.filter((part) => getDrillConflictIds(part).length > 0).map((part) => part.name);

describe('cabinet invariants', () => {
  it('plain cabinet: carcass panels do not overlap and holes do not collide', () => {
    const parts = createCabinet();
    expect(carcassOverlaps(parts)).toEqual([]);
    expect(partsWithDrillConflicts(parts)).toEqual([]);
  });

  it('after a rebuild, support references point at parts that exist', () => {
    let parts = addBlock(createCabinet(), 0);
    parts = rebuildWith(parts, moduleOf(parts).layout);
    const ids = new Set(parts.map((part) => part.id));
    const references = parts.flatMap((part) => [part.meta?.leftSupportPartId, part.meta?.rightSupportPartId]).filter((id): id is string => Boolean(id));
    expect(references.length).toBeGreaterThan(0);
    expect(references.filter((id) => !ids.has(id))).toEqual([]);
  });

  it('with nothing picked, the tallest tier is the active one', () => {
    const sections = getLeafTierSections(moduleOf(createCabinet({ tierCount: 2, tierHeight: 400, partitionCount: 0 })));
    expect(sections.length).toBeGreaterThan(1);
    expect(getDefaultTierSection(sections)!.clearHeight).toBe(Math.max(...sections.map((section) => section.clearHeight)));
  });
});

describe('drawer block', () => {
  it('builds its divider, columns, drawers and a joined back panel', () => {
    const parts = addBlock(createCabinet(), 0, { columns: 2, drawerCount: 2 });
    expect(localDividers(parts)).toHaveLength(1);
    expect(byRole(parts, 'drawer-column')).toHaveLength(1);
    expect(byRole(parts, 'drawer-front')).toHaveLength(4);
    for (const part of [...localDividers(parts), ...byRole(parts, 'drawer-column')]) {
      expect(part.operations.length, part.name).toBeGreaterThan(0);
    }
    const backPanels = byRole(parts, 'back-panel');
    expect(backPanels.length).toBeGreaterThan(0);
    for (const panel of backPanels) expect(panel.operations.length, panel.name).toBeGreaterThan(0);
    expect(carcassOverlaps(parts)).toEqual([]);
    expect(partsWithDrillConflicts(parts)).toEqual([]);
  });

  it('a niche offset leaves the requested clear height under the block', () => {
    const parts = addBlock(createCabinet(), 0, { offset: 300, drawerCount: 3, slotHeight: 200 });
    const bottom = byRole(parts, 'bottom')[0]!;
    const dividers = localDividers(parts).sort((a, b) => a.position.y - b.position.y);
    expect(dividers).toHaveLength(2);
    const niche = (dividers[0]!.position.y - dividers[0]!.height / 2) - (bottom.position.y + bottom.height / 2);
    const block = (dividers[1]!.position.y - dividers[1]!.height / 2) - (dividers[0]!.position.y + dividers[0]!.height / 2);
    expect(niche).toBeCloseTo(300, 0);
    expect(block).toBeCloseTo(600, 0);
  });

  it('existing zone ids survive adding a block at the other end of the section', () => {
    let parts = addBlock(createCabinet(), 0);
    const section = getLeafTierSections(moduleOf(parts))[0]!;
    const before = getLocalZonesForSection(moduleOf(parts), section.id, section.tierId).map((zone) => zone.id);
    parts = addBlock(parts, 0, { anchor: 'top', drawerCount: 2 });
    const after = getLocalZonesForSection(moduleOf(parts), section.id, section.tierId).map((zone) => zone.id);
    expect(after).toEqual(expect.arrayContaining(before));
  });

  it('the facade height formula matches the built inset drawer fronts', () => {
    const parts = addBlock(createCabinet({ frontMode: 'inset' }), 0, { drawerCount: 3, slotHeight: 200 });
    const front = byRole(parts, 'drawer-front')[0]!;
    expect(getDrawerBlockFacadeHeight(200, 3, moduleOf(parts).frontOpeningMode)).toBeCloseTo(front.height, 1);
  });

  it('overlay drawer fronts sit in front of the carcass, reach over the side, and the box comes up to them', () => {
    const parts = addBlock(createCabinet({ partitionCount: 1 }), 0, { drawerCount: 3, columns: 2 });
    const module = moduleOf(parts);
    const carcassFront = module.position.z + module.depth / 2;
    const fronts = byRole(parts, 'drawer-front');
    expect(fronts).toHaveLength(6);
    for (const front of fronts) expect(front.position.z - front.thickness / 2).toBeCloseTo(carcassFront, 3);
    for (let i = 0; i < fronts.length; i += 1) {
      for (let j = i + 1; j < fronts.length; j += 1) {
        expect(boundsIntersect(getBounds([fronts[i]!]), getBounds([fronts[j]!])), `${fronts[i]!.name} × ${fronts[j]!.name}`).toBe(false);
      }
    }
    // Stacked drawer fronts keep the doors' middle gap between them (26163: 4 mm).
    const firstColumn = fronts.filter((front) => Math.abs(front.position.x - fronts[0]!.position.x) < 0.5).sort((a, b) => a.position.y - b.position.y);
    for (let i = 1; i < firstColumn.length; i += 1) {
      const below = firstColumn[i - 1]!;
      const above = firstColumn[i]!;
      expect(above.position.y - above.height / 2 - (below.position.y + below.height / 2)).toBeCloseTo(OVERLAY_FRONT_MIDDLE_GAP, 3);
    }
    const leftSide = byRole(parts, 'left-side')[0]!;
    const leftmost = [...fronts].sort((a, b) => a.position.x - b.position.x)[0]!;
    expect(leftmost.position.x - leftmost.width / 2).toBeLessThan(leftSide.position.x);
    for (const boxSide of byRole(parts, 'drawer-side-left')) expect(boxSide.position.z + boxSide.thickness / 2).toBeCloseTo(carcassFront, 3);
    const carcass = parts.filter((part) => CARCASS_ROLES.has(part.meta?.role));
    const boxes = parts.filter((part) => part.meta?.role === 'drawer-side-left' || part.meta?.role === 'drawer-side-right' || part.meta?.role === 'drawer-bottom');
    const hits = boxes.flatMap((box) => carcass.filter((panel) => boundsIntersect(getBounds([box]), getBounds([panel]))).map((panel) => `${box.name} × ${panel.name}`));
    expect(hits).toEqual([]);
    expect(partsWithDrillConflicts(parts)).toEqual([]);
  });

  it('a false panel stands the gap off the section wall, joined top and bottom; boxes run beside it, fronts still cover the section', () => {
    for (const frontMode of ['overlay', 'inset'] as const) {
      const plain = addBlock(createCabinet({ partitionCount: 1, frontMode }), 0, { drawerCount: 2, offset: 200 });
      let parts = addBlock(createCabinet({ partitionCount: 1, frontMode }), 0, { drawerCount: 2, offset: 200, falsePanel: { side: 'left', gap: 50 } });
      const [panel] = byRole(parts, 'drawer-false-panel');
      expect(panel, frontMode).toBeDefined();
      const leftSide = byRole(parts, 'left-side')[0]!;
      const leftWallFace = leftSide.position.x + leftSide.width / 2;
      expect(panel!.position.x - panel!.width / 2 - leftWallFace).toBeCloseTo(50, 3);
      // Full height of the block: from the niche divider up to the block divider.
      const dividers = localDividers(parts).sort((a, b) => a.position.y - b.position.y);
      expect(panel!.position.y - panel!.height / 2).toBeCloseTo(dividers[0]!.position.y + dividers[0]!.height / 2, 3);
      expect(panel!.position.y + panel!.height / 2).toBeCloseTo(dividers[1]!.position.y - dividers[1]!.height / 2, 3);
      // Confirmats into both dividers by default, rafix on request.
      expect(panel!.operations.length).toBeGreaterThan(0);
      expect(dividers[0]!.operations.some((op) => op.source?.includes(panel!.id)), frontMode).toBe(true);
      expect(dividers[1]!.operations.some((op) => op.source?.includes(panel!.id)), frontMode).toBe(true);
      const boxSides = byRole(parts, 'drawer-side-left');
      for (const side of boxSides) expect(side.position.x - side.width / 2).toBeGreaterThan(panel!.position.x + panel!.width / 2);
      const plainFronts = byRole(plain, 'drawer-front').map((front) => [front.width, front.position.x]);
      expect(byRole(parts, 'drawer-front').map((front) => [front.width, front.position.x])).toEqual(plainFronts);
      const drawerParts = parts.filter((part) => part.meta?.role?.startsWith('drawer-side') || part.meta?.role === 'drawer-bottom');
      expect(drawerParts.flatMap((box) => [panel!].filter((item) => boundsIntersect(getBounds([box]), getBounds([item]))).map(() => box.name))).toEqual([]);
      const carcass = parts.filter((part) => CARCASS_ROLES.has(part.meta?.role));
      expect(carcass.filter((item) => boundsIntersect(getBounds([panel!]), getBounds([item]))).map((item) => item.name)).toEqual([]);
      expect(partsWithDrillConflicts(parts)).toEqual([]);

      parts = applyGeneratedJoinery(parts.map((part) => part.id === panel!.id ? { ...part, meta: { ...part.meta, joinery: { ...createEmptySideJoinery(), top: 'rafix', bottom: 'rafix' } } } : part), rules);
      const rafixPanel = parts.find((part) => part.id === panel!.id)!;
      expect(rafixPanel.operations.length, frontMode).toBeGreaterThan(0);
      expect(partsWithDrillConflicts(parts)).toEqual([]);
    }
  });

  it('inset drawer fronts stay inside the carcass', () => {
    const parts = addBlock(createCabinet({ partitionCount: 0, frontMode: 'inset' }), 0, { drawerCount: 2 });
    const module = moduleOf(parts);
    for (const front of byRole(parts, 'drawer-front')) {
      expect(front.position.z + front.thickness / 2).toBeLessThanOrEqual(module.position.z + module.depth / 2 + 0.001);
    }
  });
});

describe('back panels on both sides of a partition', () => {
  it('blocks with back panels in neighbouring sections do not drill the partition through at the same spots', () => {
    const withLeftBlock = addBlock(createCabinet({ partitionCount: 1 }), 0);
    const parts = addBlock(withLeftBlock, 1);
    expect(byRole(parts, 'back-panel').length).toBeGreaterThanOrEqual(2);
    expect(partsWithDrillConflicts(parts)).toEqual([]);
  });
});

describe('back panel and aprons', () => {
  it('a full back panel is joined to the top, bottom and both sides by default', () => {
    const parts = createCabinet({ withBackPanel: true, partitionCount: 0 });
    expect(byRole(parts, 'back-panel')[0]!.operations.length).toBeGreaterThan(0);
    for (const role of ['top', 'bottom', 'left-side', 'right-side'] as const) {
      expect(byRole(parts, role)[0]!.operations.some((op) => op.templateName?.startsWith('Back panel')), role).toBe(true);
    }
    expect(partsWithDrillConflicts(parts)).toEqual([]);
  });

  it('a section back panel on minifix is joined at the top too', () => {
    const base = addBlock(createCabinet({ partitionCount: 0 }), 0, { anchor: 'top', drawerCount: 2 });
    const parts = withJoinery(base, 'back-panel', { top: 'minifix-dowel', bottom: 'confirmat', left: 'confirmat', right: 'confirmat' });
    for (const panel of byRole(parts, 'back-panel')) {
      expect(panel.operations.some((op) => op.face === 'top' && op.templateName === 'Back panel connector pin'), panel.name).toBe(true);
    }
  });

  it('top and bottom aprons follow the cabinet option, a shelf apron its own flag, and a back panel replaces them', () => {
    const base = createCabinet({ partitionCount: 0, shelfCount: 2, withAprons: true });
    expect(byRole(base, 'apron').map((part) => part.meta?.sourceId?.split(':')[0]).sort()).toEqual(['bottom', 'top']);

    const shelfId = byRole(base, 'shelf')[0]!.meta!.sourceId!;
    const withShelfApron = rebuildWith(base, setShelfApron(moduleOf(base).layout, shelfId, true));
    expect(byRole(withShelfApron, 'apron')).toHaveLength(3);
    expect(carcassOverlaps(withShelfApron)).toEqual([]);

    const { groupId, ...draft } = moduleOf(withShelfApron);
    const withBack = rebuildCabinetGroup(withShelfApron, groupId, { ...draft, withBackPanel: true }, rules);
    expect(byRole(withBack, 'back-panel').length).toBeGreaterThan(0);
    expect(byRole(withBack, 'apron')).toHaveLength(0);
  });

  it('apron Rafix: housings break through the edge, bolts sit mid apron thickness', () => {
    const parts = withJoinery(createCabinet({ partitionCount: 0, withAprons: true }), 'apron', { top: 'rafix', bottom: 'rafix', left: 'rafix', right: 'rafix' });
    const aprons = byRole(parts, 'apron');
    for (const apron of aprons) {
      const housings = apron.operations.filter((op) => op.templateName === 'Apron Rafix housing');
      expect(housings.length).toBeGreaterThan(0);
      for (const op of housings) expect(Math.min(op.x, apron.width - op.x, op.y, apron.height - op.y)).toBeCloseTo(9.5, 1);
    }
    const mates = parts.flatMap((part) => part.operations.filter((op) => op.templateName === 'Apron Rafix mate').map((op) => getFacePointWorld(part, op.face, op)));
    expect(mates.length).toBeGreaterThan(0);
    for (const mate of mates) expect(aprons.some((apron) => Math.abs(mate.z - apron.position.z) < 0.01)).toBe(true);
  });
});

describe('shelves', () => {
  it('can be fastened with Rafix', () => {
    const parts = withJoinery(createCabinet({ partitionCount: 1, shelfCount: 1 }), 'shelf', { left: 'rafix', right: 'rafix' });
    const shelf = byRole(parts, 'shelf')[0]!;
    const housings = shelf.operations.filter((op) => op.templateName === 'Shelf Rafix housing');
    expect(housings).toHaveLength(4);
    const mates = parts.flatMap((part) => part.operations.filter((op) => op.templateName === 'Shelf Rafix mate').map((op) => getFacePointWorld(part, op.face, op)));
    expect(mates).toHaveLength(4);
    for (const mate of mates) expect(mate.y).toBeCloseTo(shelf.position.y, 3);
    expect(partsWithDrillConflicts(parts)).toEqual([]);
  });
});

describe('plinth', () => {
  it('long rails sit on dowels, short braces hang under the bottom on minifix without dowels', () => {
    const parts = createCabinet({ withPlinth: true, plinthHeight: 60, partitionCount: 1 });
    const bottom = byRole(parts, 'bottom')[0]!;
    const rails = [...byRole(parts, 'plinth-front'), ...byRole(parts, 'plinth-back')];
    for (const rail of rails) {
      expect(rail.operations.some((op) => op.templateName === 'Plinth to bottom dowel'), rail.name).toBe(true);
      expect(rail.operations.some((op) => op.feature === 'cam-housing' && op.templateName?.includes('bottom')), rail.name).toBe(false);
    }
    const braces = byRole(parts, 'plinth-brace');
    expect(braces).toHaveLength(1);
    expect(braces[0]!.operations.some((op) => op.templateName === 'Plinth brace to bottom cam housing')).toBe(true);
    expect(braces[0]!.operations.some((op) => op.feature === 'dowel' && op.templateName?.includes('bottom'))).toBe(false);
    const pins = bottom.operations.filter((op) => op.templateName === 'Plinth brace to bottom connector pin').map((op) => getFacePointWorld(bottom, op.face, op));
    expect(pins.length).toBeGreaterThan(0);
    for (const pin of pins) {
      expect(braces.some((brace) => Math.abs(pin.x - brace.position.x) < brace.width / 2 && Math.abs(pin.z - brace.position.z) < brace.thickness / 2)).toBe(true);
    }
    expect(partsWithDrillConflicts(parts)).toEqual([]);
  });
});

describe('fronts', () => {
  const groupOf = (parts: Part[]) => parts[0]!.meta!.groupId!;
  const openingsOf = (parts: Part[]) => getCabinetOpenings(parts, groupOf(parts));
  const frontParts = (parts: Part[]) => parts.filter((part) => part.meta?.role === 'front-left' || part.meta?.role === 'front-right' || part.meta?.role === 'front-flap');
  const withFront = (parts: Part[], ref: CabinetOpeningRef, front: Parameters<typeof setFrontOnOpening>[3]) => {
    const layout = setFrontOnOpening(parts, groupOf(parts), ref, front);
    expect(layout).not.toBeNull();
    return rebuildWith(parts, layout!);
  };

  it('a new cabinet with fronts gets a door per section, hinged towards the nearer side', () => {
    const parts = createCabinet({ partitionCount: 1, withFronts: true });
    const fronts = frontParts(parts).sort((a, b) => a.position.x - b.position.x);
    expect(fronts.map((front) => front.meta?.hingeEdge)).toEqual(['left', 'right']);
    expect(boundsIntersect(getBounds([fronts[0]!]), getBounds([fronts[1]!]))).toBe(false);
    expect(partsWithDrillConflicts(parts)).toEqual([]);
  });

  it('a front between two shelves covers just that opening, its edges over the shelves', () => {
    const base = createCabinet({ partitionCount: 0, shelfCount: 2 });
    const cells = openingsOf(base);
    expect(cells).toHaveLength(3);
    const parts = withFront(base, cells[1]!, { kind: 'door', hinge: 'left' });
    const fronts = frontParts(parts);
    expect(fronts).toHaveLength(1);
    const front = fronts[0]!;
    const [lower, upper] = byRole(parts, 'shelf').sort((a, b) => a.position.y - b.position.y);
    const frontBottom = front.position.y - front.height / 2;
    const frontTop = front.position.y + front.height / 2;
    expect(frontBottom).toBeGreaterThan(lower!.position.y);
    expect(frontBottom).toBeLessThan(lower!.position.y + lower!.height / 2);
    expect(frontTop).toBeLessThan(upper!.position.y);
    expect(frontTop).toBeGreaterThan(upper!.position.y - upper!.height / 2);
    expect(front.operations.some((op) => op.feature === 'hinge-cup')).toBe(true);
    expect(partsWithDrillConflicts(parts)).toEqual([]);
  });

  it('an extended opening spans the shelf, and a new front replaces the ones it overlaps', () => {
    const base = createCabinet({ partitionCount: 0, shelfCount: 2 });
    const cells = openingsOf(base);
    let parts = withFront(base, { ...cells[0]!, topBoundaryId: cells[1]!.topBoundaryId }, { kind: 'double', hinge: 'left' });
    expect(frontParts(parts)).toHaveLength(2);
    parts = withFront(parts, openingsOf(parts)[1]!, { kind: 'flap', hinge: 'top' });
    const fronts = frontParts(parts);
    expect(fronts).toHaveLength(1);
    expect(fronts[0]!.meta?.role).toBe('front-flap');
    const cups = fronts[0]!.operations.filter((op) => op.feature === 'hinge-cup');
    expect(cups.length).toBeGreaterThan(0);
    for (const cup of cups) expect(cup.y).toBeCloseTo(21.5, 1);
  });

  it('hinges are overlay at an outer panel, half-overlay at a shared one, and inset for inset fronts', () => {
    const base = createCabinet({ partitionCount: 1 });
    const leftCell = openingsOf(base).sort((a, b) => a.startX - b.startX)[0]!;
    const atSide = frontParts(withFront(base, leftCell, { kind: 'door', hinge: 'left' }))[0]!;
    expect(atSide.meta?.hingeType).toBe('overlay');
    expect(atSide.operations.some((op) => op.templateName?.startsWith('Overlay hinge cup'))).toBe(true);
    expect(frontParts(withFront(base, leftCell, { kind: 'door', hinge: 'right' }))[0]!.meta?.hingeType).toBe('half-overlay');

    const withShelf = createCabinet({ partitionCount: 0, shelfCount: 1 });
    const lowerCell = openingsOf(withShelf)[0]!;
    expect(frontParts(withFront(withShelf, lowerCell, { kind: 'flap', hinge: 'top' }))[0]!.meta?.hingeType).toBe('half-overlay');
    expect(frontParts(withFront(withShelf, lowerCell, { kind: 'flap', hinge: 'bottom' }))[0]!.meta?.hingeType).toBe('overlay');

    const insetBase = createCabinet({ partitionCount: 1, frontMode: 'inset' });
    const insetFront = frontParts(withFront(insetBase, openingsOf(insetBase)[0]!, { kind: 'door', hinge: 'left' }))[0]!;
    expect(insetFront.meta?.hingeType).toBe('inset');
    expect(insetFront.operations.some((op) => op.templateName?.startsWith('Inset hinge cup'))).toBe(true);
  });

  it('inset fronts stay inside their opening', () => {
    const base = createCabinet({ partitionCount: 0, shelfCount: 1, frontMode: 'inset' });
    const cell = openingsOf(base)[0]!;
    const front = frontParts(withFront(base, cell, { kind: 'door', hinge: 'right' }))[0]!;
    expect(front.position.y - front.height / 2).toBeGreaterThanOrEqual(cell.startY);
    expect(front.position.y + front.height / 2).toBeLessThanOrEqual(cell.endY);
    expect(front.position.x - front.width / 2).toBeGreaterThanOrEqual(cell.startX);
    expect(front.position.x + front.width / 2).toBeLessThanOrEqual(cell.endX);
  });

  it('drawer cells take no front, and removing a bounding shelf drops the front', () => {
    const withBlock = addBlock(createCabinet({ partitionCount: 0 }), 0, { drawerCount: 2 });
    const drawerCell = openingsOf(withBlock).find((cell) => cell.hasDrawers);
    expect(drawerCell).toBeDefined();
    expect(setFrontOnOpening(withBlock, groupOf(withBlock), drawerCell!, { kind: 'door', hinge: 'left' })).toBeNull();

    const base = createCabinet({ partitionCount: 0, shelfCount: 1 });
    const withDoor = withFront(base, openingsOf(base)[0]!, { kind: 'door', hinge: 'left' });
    expect(frontParts(withDoor)).toHaveLength(1);
    const shelf = byRole(withDoor, 'shelf')[0]!;
    expect(frontParts(rebuildWith(withDoor, removeCabinetElementFromLayout(moduleOf(withDoor), shelf)))).toHaveLength(0);
  });

  it('a tall front spans tiers through the tier divider, and a front on part of it replaces it', () => {
    const base = createCabinet({ tierCount: 2, partitionCount: 1 });
    const cells = openingsOf(base);
    const leftmost = (tierIndex: number) => cells.filter((cell) => cell.tierIndex === tierIndex).sort((a, b) => a.startX - b.startX)[0]!;
    const lower = leftmost(1);
    const upper = leftmost(0);
    const ref = extendOpeningRef(cells, lower, upper);
    expect(ref).not.toBeNull();
    expect(ref!.topTierId).toBe(upper.tierId);
    // Extending from the top cell downwards gives the same opening.
    expect(extendOpeningRef(cells, upper, lower)).toEqual(ref);

    const parts = withFront(base, ref!, { kind: 'door', hinge: 'left' });
    const fronts = frontParts(parts);
    expect(fronts).toHaveLength(1);
    const tall = fronts[0]!;
    const divider = parts.find((part) => part.meta?.sourceId?.startsWith('tier-divider:'))!;
    expect(tall.position.y - tall.height / 2).toBeLessThan(divider.position.y);
    expect(tall.position.y + tall.height / 2).toBeGreaterThan(divider.position.y);
    expect(tall.height).toBeCloseTo(upper.endY - lower.startY + 2 * 16 - OVERLAY_FRONT_TOP_EDGE_GAP - OVERLAY_FRONT_BOTTOM_EDGE_GAP, 0);
    expect(partsWithDrillConflicts(parts)).toEqual([]);

    const upperAgain = openingsOf(parts).filter((cell) => cell.tierIndex === 0).sort((a, b) => a.startX - b.startX)[0]!;
    const replaced = frontParts(withFront(parts, upperAgain, { kind: 'door', hinge: 'left' }));
    expect(replaced).toHaveLength(1);
    expect(replaced[0]!.height).toBeLessThan(tall.height * 0.75);
  });

  it('tiers whose sections do not line up cannot share a front', () => {
    const base = createCabinet({ tierCount: 2, partitionCount: 0 });
    const module = moduleOf(base);
    const lowerSection = getLeafTierSections(module).find((section) => section.tierIndex === 1)!;
    const parts = rebuildWith(base, addPartitionToLayoutSection(module, lowerSection.id, lowerSection.tierId).layout);
    const cells = openingsOf(parts);
    const lowerLeft = cells.filter((cell) => cell.tierIndex === 1).sort((a, b) => a.startX - b.startX)[0]!;
    const upper = cells.find((cell) => cell.tierIndex === 0)!;
    expect(extendOpeningRef(cells, lowerLeft, upper)).toBeNull();
  });

  it('an inset front over a tier divider sets the divider back instead of cutting into it', () => {
    const base = createCabinet({ tierCount: 2, partitionCount: 1, frontMode: 'inset' });
    const cells = openingsOf(base);
    const leftmost = (tierIndex: number) => cells.filter((cell) => cell.tierIndex === tierIndex).sort((a, b) => a.startX - b.startX)[0]!;
    const dividerBefore = base.find((part) => part.meta?.sourceId?.startsWith('tier-divider:'))!;
    const parts = withFront(base, extendOpeningRef(cells, leftmost(1), leftmost(0))!, { kind: 'door', hinge: 'left' });
    const front = frontParts(parts)[0]!;
    const divider = parts.find((part) => part.meta?.sourceId === dividerBefore.meta?.sourceId)!;
    expect(divider.thickness).toBeCloseTo(dividerBefore.thickness - 18, 3);
    expect(boundsIntersect(getBounds([front]), getBounds([divider]))).toBe(false);
    expect(partsWithDrillConflicts(parts)).toEqual([]);
  });

  it('an inset front over a local divider sets that divider back', () => {
    const base = createCabinet({ partitionCount: 0, frontMode: 'inset' });
    const module = moduleOf(base);
    const section = getLeafTierSections(module)[0]!;
    const layout: CabinetLayout = {
      ...module.layout,
      tiers: module.layout.tiers!.map((tier) => ({ ...tier, layout: { ...tier.layout, tierDividers: [{ id: 'local-divider-test', sectionId: section.id, positionRatio: 0.5 }] } })),
    };
    const withDivider = rebuildWith(base, layout);
    const cells = openingsOf(withDivider);
    expect(cells).toHaveLength(2);
    const dividerBefore = withDivider.find((part) => part.meta?.sourceId === 'local-divider-test')!;
    const parts = withFront(withDivider, extendOpeningRef(cells, cells[0]!, cells[1]!)!, { kind: 'door', hinge: 'left' });
    const divider = parts.find((part) => part.meta?.sourceId === 'local-divider-test')!;
    expect(divider.thickness).toBeCloseTo(dividerBefore.thickness - 18, 3);
    expect(boundsIntersect(getBounds([frontParts(parts)[0]!]), getBounds([divider]))).toBe(false);
  });
});

describe('partitions and local dividers', () => {
  it('removing a partition keeps the drawer block', () => {
    let parts = addBlock(createCabinet({ partitionCount: 1 }), 0);
    const frontCount = byRole(parts, 'drawer-front').length;
    const partition = byRole(parts, 'partition')[0]!;
    parts = rebuildWith(parts, removeCabinetElementFromLayout(moduleOf(parts), partition));
    expect(byRole(parts, 'partition')).toHaveLength(0);
    expect(localDividers(parts)).toHaveLength(1);
    expect(byRole(parts, 'drawer-front')).toHaveLength(frontCount);
  });

  it('adding a partition keeps the local dividers of the split section', () => {
    let parts = addBlock(createCabinet({ partitionCount: 0 }), 0);
    const module = moduleOf(parts);
    const section = getLeafTierSections(module)[0]!;
    parts = rebuildWith(parts, addPartitionToLayoutSection(module, section.id, section.tierId).layout);
    expect(byRole(parts, 'partition')).toHaveLength(1);
    expect(localDividers(parts)).toHaveLength(1);
  });
});

describe('tiers', () => {
  it('partitions of both tiers are joined to the tier divider without colliding holes', () => {
    const base = createCabinet({ tierCount: 2, partitionCount: 1 });
    const joined = applyGeneratedJoinery(
      base.map((part) => (
        part.meta?.role === 'partition'
          ? { ...part, meta: { ...part.meta, joinery: { ...createEmptySideJoinery(), top: 'confirmat' as const, bottom: 'confirmat' as const } } }
          : part
      )),
      rules
    );
    const divider = joined.find((part) => part.meta?.sourceId?.startsWith('tier-divider:'));
    expect(divider).toBeDefined();
    expect(divider!.operations.length).toBeGreaterThan(0);
    expect(partsWithDrillConflicts(joined)).toEqual([]);
  });
});

describe('drawer blocks over the whole section', () => {
  it('a full-height block builds no inner divider and shares the section between its drawers', () => {
    const parts = addBlock(createCabinet({ partitionCount: 0 }), 0, { fill: true, drawerCount: 4 });
    expect(localDividers(parts)).toHaveLength(0);
    const fronts = byRole(parts, 'drawer-front').sort((a, b) => a.position.y - b.position.y);
    expect(fronts).toHaveLength(4);
    const section = getLeafTierSections(moduleOf(parts))[0]!;
    expect(fronts[3]!.position.y).toBeGreaterThan(section.startY + section.clearHeight * 0.75);
    expect(carcassOverlaps(parts)).toEqual([]);
    expect(partsWithDrillConflicts(parts)).toEqual([]);
  });
});

describe('top over the fronts', () => {
  it('reaches forward over the overlay fronts, which stop under it, and its joints still meet the sides', () => {
    const base = createCabinet({ width: 800, height: 850, depth: 450, partitionCount: 0, withFronts: true, topOverFronts: true });
    const parts = withJoinery(base, 'top', { left: 'confirmat', right: 'confirmat' });
    const top = byRole(parts, 'top')[0]!;
    const leftSide = byRole(parts, 'left-side')[0]!;
    const rightSide = byRole(parts, 'right-side')[0]!;
    expect(top.thickness).toBeCloseTo(leftSide.thickness + 16, 3);
    const front = [...byRole(parts, 'front-left'), ...byRole(parts, 'front-right')][0]!;
    expect(front.position.y + front.height / 2).toBeLessThan(top.position.y - top.height / 2);
    expect(front.position.z + front.thickness / 2).toBeLessThanOrEqual(top.position.z + top.thickness / 2 + 0.001);
    const jointZ = (part: Part) => part.operations
      .filter((op) => op.feature === 'confirmat' && (op.source ?? '').includes(top.id))
      .map((op) => Math.round(getFacePointWorld(part, op.face, op).z));
    const topZ = [...new Set(jointZ(top))].sort((a, b) => a - b);
    const sideZ = [...new Set([...jointZ(leftSide), ...jointZ(rightSide)])].sort((a, b) => a - b);
    expect(topZ.length).toBeGreaterThan(0);
    expect(topZ).toEqual(sideZ);
    expect(moduleOf(parts).depth).toBe(450);
    expect(moduleOf(rebuildWith(parts, moduleOf(parts).layout)).depth).toBe(450);
  });
});

describe('presets', () => {
  it.each(CABINET_PRESETS.map((preset) => preset.id))('%s builds without overlapping panels or colliding holes', (presetId) => {
    const parts = applyGeneratedJoinery(buildCabinetPreset(presetId, 'Preset', { x: 0, y: 0, z: 0 }), rules);
    expect(parts.length).toBeGreaterThan(0);
    expect(carcassOverlaps(parts)).toEqual([]);
    expect(partsWithDrillConflicts(parts)).toEqual([]);
  });

  it('have the drawers and doors they promise', () => {
    const count = (presetId: CabinetPresetId, roles: PartRole[]) =>
      buildCabinetPreset(presetId, 'Preset', { x: 0, y: 0, z: 0 }).filter((part) => roles.includes(part.meta?.role as PartRole)).length;
    const doors: PartRole[] = ['front-left', 'front-right', 'front-flap'];
    expect(count('dresser', ['drawer-front'])).toBe(4);
    expect(count('dresser', ['tier-divider'])).toBe(0);
    expect(count('nightstand', ['drawer-front'])).toBe(2);
    expect(count('tv-stand', ['drawer-front'])).toBe(1);
    expect(count('tv-stand', doors)).toBe(2);
    expect(count('wardrobe-2', doors)).toBe(2);
    expect(count('wardrobe-3', doors)).toBe(3);
  });

  it('dresser, nightstand and TV stand fasten the back panel with minifix, wardrobes keep confirmat', () => {
    for (const presetId of ['dresser', 'nightstand', 'tv-stand'] as const) {
      const parts = applyGeneratedJoinery(buildCabinetPreset(presetId, 'Preset', { x: 0, y: 0, z: 0 }), rules);
      const panels = byRole(parts, 'back-panel');
      expect(panels.length, presetId).toBeGreaterThan(0);
      for (const panel of panels) {
        expect(panel.meta?.joinery, presetId).toMatchObject({ top: 'minifix-dowel', bottom: 'minifix-dowel', left: 'minifix-dowel', right: 'minifix-dowel' });
        expect(panel.operations.some((op) => op.templateName === 'Back panel cam housing'), presetId).toBe(true);
      }
      expect(partsWithDrillConflicts(parts), presetId).toEqual([]);
    }
    expect(byRole(buildCabinetPreset('wardrobe-2', 'Preset', { x: 0, y: 0, z: 0 }), 'back-panel')[0]!.meta?.joinery?.left).toBe('confirmat');
  });
});

describe('fronts above a plinth', () => {
  it('overlay fronts stop at the bottom panel, so the lowest drawer box keeps its height', () => {
    const dresser = applyGeneratedJoinery(buildCabinetPreset('dresser', 'Preset', { x: 0, y: 0, z: 0 }), rules);
    const bottom = byRole(dresser, 'bottom')[0]!;
    const lowest = byRole(dresser, 'drawer-front').sort((a, b) => a.position.y - b.position.y)[0]!;
    expect(lowest.position.y - lowest.height / 2).toBeCloseTo(bottom.position.y - bottom.height / 2 + OVERLAY_FRONT_BOTTOM_EDGE_GAP, 3);
    const boxSideHeights = byRole(dresser, 'drawer-side-left').map((side) => side.height);
    expect(Math.min(...boxSideHeights)).toBeGreaterThan(Math.max(...boxSideHeights) - 30);
    expect(partsWithDrillConflicts(dresser)).toEqual([]);

    const wardrobe = buildCabinetPreset('wardrobe-2', 'Preset', { x: 0, y: 0, z: 0 });
    const wardrobeBottom = byRole(wardrobe, 'bottom')[0]!;
    const doors = [...byRole(wardrobe, 'front-left'), ...byRole(wardrobe, 'front-right')];
    expect(doors.length).toBeGreaterThan(0);
    for (const door of doors) {
      expect(door.position.y - door.height / 2).toBeCloseTo(wardrobeBottom.position.y - wardrobeBottom.height / 2 + OVERLAY_FRONT_BOTTOM_EDGE_GAP, 3);
    }
  });
});
