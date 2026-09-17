// Проёмы и фасады: ячейки между границами, размещение фасадов, тип петли.
import { type CabinetSection, getSectionInnerSpan, OPENING_EDGE_BOTTOM, OPENING_EDGE_TOP, getCabinetTierSpecs, type CabinetFrontHinge, type CabinetFrontSpec, type CabinetLayout, resolveCabinetTierLayouts, updateAllFronts, updateDrawerBlock, DEFAULT_DRAWER_RECESS_BEHIND_DOOR, type CabinetFrontKind } from '../cabinet-layout';
import { type Part, type PartRole, createPanelPart } from '../part';
import { createId } from '../../shared/ids';
import { roleLabel } from './common';
import { HANDLED_FRONT_GAP, INSET_FRONT_HEIGHT_REDUCTION, INSET_FRONT_WIDTH_REDUCTION, NAME_SEP, OVERLAY_FRONT_EDGE_GAP, OVERLAY_FRONT_MIDDLE_GAP, OVERLAY_FRONT_TIER_DIVIDER_GAP, OVERLAY_FRONT_TOP_EDGE_GAP, OVERLAY_FRONT_BOTTOM_EDGE_GAP } from './constants';
import { getLeafTierSections } from './frames';
import { getCabinetModuleState } from './module-state';
import type { CabinetFrontMode, CabinetFrontOpeningMode } from './types';

function getFrontGaps(frontOpeningMode: CabinetFrontOpeningMode) {
  return frontOpeningMode === 'handles'
    ? { edge: HANDLED_FRONT_GAP, middle: HANDLED_FRONT_GAP }
    : { edge: OVERLAY_FRONT_EDGE_GAP, middle: OVERLAY_FRONT_MIDDLE_GAP };
}

const FRONT_SOURCE_PREFIX = 'front:';
/** Wider clear openings get a pair of doors by default. */
const SINGLE_DOOR_MAX_WIDTH = 600;

/** Bottom cell (tier, section, lower boundary) and top boundary; the top may sit in a tier above (`topTierId`/`topSectionId`). */
export type CabinetOpeningRef = {
  tierId: string;
  sectionId: string;
  bottomBoundaryId: string;
  topBoundaryId: string;
  topTierId?: string;
  topSectionId?: string;
};

/** A cell of a section between two neighbouring horizontal boundaries (tier edges, shelves, local dividers); world mm. */
export type CabinetOpening = CabinetOpeningRef & {
  tierIndex: number;
  /** Clear opening between the section's vertical panels and between the boundary panels' faces. */
  startX: number;
  endX: number;
  startY: number;
  endY: number;
  /** Half thickness of the boundary panel below / above. */
  bottomHalf: number;
  topHalf: number;
  leftOuter: boolean;
  rightOuter: boolean;
  isBottomTier: boolean;
  isTopTier: boolean;
  hasDrawers: boolean;
};

type OpeningSection = {
  id: string;
  tierId: string;
  tierIndex: number;
  tierCount: number;
  startY: number;
  endY: number;
  startX: number;
  endX: number;
  leftOuter: boolean;
  rightOuter: boolean;
};

export function toOpeningSection(section: CabinetSection, tierId: string, tierIndex: number, tierCount: number, frame: { startY: number; endY: number }, cabinetX: number, thickness: number): OpeningSection {
  const span = getSectionInnerSpan(section, thickness);
  return {
    id: section.id,
    tierId,
    tierIndex,
    tierCount,
    startY: frame.startY,
    endY: frame.endY,
    startX: cabinetX + span.startX,
    endX: cabinetX + span.endX,
    leftOuter: section.leftBoundary === 'outer',
    rightOuter: section.rightBoundary === 'outer',
  };
}

/** Openings are read from the built parts, so shelves count where they really are (manual or evenly spread). */
export function collectSectionOpenings(groupParts: Part[], section: OpeningSection, thickness: number): CabinetOpening[] {
  const insideSection = (part: Part) => part.position.x > section.startX && part.position.x < section.endX
    && part.position.y > section.startY && part.position.y < section.endY;
  const innerBoundaries = groupParts
    .filter((part) => insideSection(part) && part.meta?.sourceId
      && (part.meta.role === 'shelf' || (part.meta.role === 'tier-divider' && !part.meta.sourceId.startsWith('tier-divider:'))))
    .map((part) => ({ id: part.meta!.sourceId!, center: part.position.y, half: part.height / 2 }))
    .sort((a, b) => a.center - b.center);
  const boundaries = [
    { id: OPENING_EDGE_BOTTOM, center: section.startY - thickness / 2, half: thickness / 2 },
    ...innerBoundaries,
    { id: OPENING_EDGE_TOP, center: section.endY + thickness / 2, half: thickness / 2 },
  ];
  const drawerFronts = groupParts.filter((part) => part.meta?.role === 'drawer-front');
  return boundaries.slice(0, -1).map((below, index) => {
    const above = boundaries[index + 1]!;
    const startY = below.center + below.half;
    const endY = above.center - above.half;
    return {
      tierId: section.tierId,
      sectionId: section.id,
      tierIndex: section.tierIndex,
      bottomBoundaryId: below.id,
      topBoundaryId: above.id,
      startX: section.startX,
      endX: section.endX,
      startY,
      endY,
      bottomHalf: below.half,
      topHalf: above.half,
      leftOuter: section.leftOuter,
      rightOuter: section.rightOuter,
      isBottomTier: section.tierIndex === section.tierCount - 1,
      isTopTier: section.tierIndex === 0,
      hasDrawers: drawerFronts.some((part) => part.position.x > section.startX && part.position.x < section.endX && part.position.y > startY && part.position.y < endY),
    };
  });
}

/** All openings of a cabinet: tiers top to bottom, sections left to right, cells bottom to top. */
export function getCabinetOpenings(parts: Part[], groupId: string): CabinetOpening[] {
  const module = getCabinetModuleState(parts, groupId);
  if (!module) return [];
  const groupParts = parts.filter((part) => part.meta?.groupId === groupId);
  const tierCount = getCabinetTierSpecs(module.layout).length;
  return getLeafTierSections(module).flatMap((section) => collectSectionOpenings(
    groupParts,
    toOpeningSection(section, section.tierId, section.tierIndex, tierCount, section, module.position.x, module.thickness),
    module.thickness
  ));
}

/** Cells lined up with `cell` (same clear left/right edges) in every tier, bottom to top. */
function getOpeningColumn(openings: CabinetOpening[], cell: CabinetOpening) {
  return openings
    .filter((item) => Math.abs(item.startX - cell.startX) < 1 && Math.abs(item.endX - cell.endX) < 1)
    .sort((a, b) => a.startY - b.startY);
}

/**
 * The column of cells the ref spans (bottom cell up to top cell, across tiers when they line up) and its index range;
 * null when a boundary no longer exists, the top is below the bottom, or a tier in between has no lined-up section.
 */
export function getOpeningRange(openings: CabinetOpening[], ref: CabinetOpeningRef) {
  const bottomCell = openings.find((cell) => cell.tierId === ref.tierId && cell.sectionId === ref.sectionId && cell.bottomBoundaryId === ref.bottomBoundaryId);
  const topTierId = ref.topTierId ?? ref.tierId;
  const topSectionId = ref.topSectionId ?? ref.sectionId;
  const topCell = openings.find((cell) => cell.tierId === topTierId && cell.sectionId === topSectionId && cell.topBoundaryId === ref.topBoundaryId);
  if (!bottomCell || !topCell) return null;
  const cells = getOpeningColumn(openings, bottomCell);
  const from = cells.indexOf(bottomCell);
  const to = cells.indexOf(topCell);
  if (from < 0 || to < from) return null;
  // Neighbouring cells are one panel apart (shelf, divider); a wider gap is a tier whose sections do not line up.
  for (let index = from; index < to; index += 1) {
    if (cells[index + 1]!.startY - cells[index]!.endY > cells[index]!.topHalf * 2 + 1) return null;
  }
  return { cells, from, to };
}

export function toOpeningRef(bottom: CabinetOpening, top: CabinetOpening): CabinetOpeningRef {
  const crossesSections = top.tierId !== bottom.tierId || top.sectionId !== bottom.sectionId;
  return {
    tierId: bottom.tierId,
    sectionId: bottom.sectionId,
    bottomBoundaryId: bottom.bottomBoundaryId,
    topBoundaryId: top.topBoundaryId,
    ...(crossesSections ? { topTierId: top.tierId, topSectionId: top.sectionId } : {}),
  };
}

/** Shift+click: grows `current` to cover the `clicked` cell along its column, across tiers too; null when it is not in that column. */
export function extendOpeningRef(openings: CabinetOpening[], current: CabinetOpeningRef, clicked: CabinetOpeningRef): CabinetOpeningRef | null {
  const range = getOpeningRange(openings, current);
  const clickedRange = getOpeningRange(openings, clicked);
  if (!range || !clickedRange) return null;
  const clickedFrom = range.cells.indexOf(clickedRange.cells[clickedRange.from]!);
  const clickedTo = range.cells.indexOf(clickedRange.cells[clickedRange.to]!);
  if (clickedFrom < 0 || clickedTo < 0) return null;
  const extended = toOpeningRef(range.cells[Math.min(range.from, clickedFrom)]!, range.cells[Math.max(range.to, clickedTo)]!);
  return getOpeningRange(openings, extended) ? extended : null;
}

type FrontBuildContext = {
  name: string;
  groupId: string;
  thickness: number;
  depth: number;
  position: { x: number; y: number; z: number };
  frontMode: CabinetFrontMode;
  frontOpeningMode: CabinetFrontOpeningMode;
  topOverFronts: boolean;
  /** Кухонный цоколь: у пола фасад опускается до этой высоты от пола, закрывая цоколь. */
  floorClearance?: number;
};

export type FrontHingeType = 'overlay' | 'half-overlay' | 'inset';

/**
 * Hinge type follows the panel the hinge edge meets: an overlay front over an outer panel (side, top of the top tier,
 * bottom of the bottom tier) takes an overlay hinge, one half over a shared panel (partition, shelf, divider) a half-overlay hinge.
 */
function getHingeType(hinge: CabinetFrontHinge, first: CabinetOpening, last: CabinetOpening, ctx: Pick<FrontBuildContext, 'frontMode' | 'topOverFronts'>): FrontHingeType {
  if (ctx.frontMode === 'inset') return 'inset';
  const atCabinetTop = last.topBoundaryId === OPENING_EDGE_TOP && last.isTopTier;
  // Under a top over the fronts, a flap hinged at the top stays inside the opening there.
  if (hinge === 'top' && atCabinetTop && ctx.topOverFronts) return 'inset';
  const outer = hinge === 'left'
    ? first.leftOuter
    : hinge === 'right'
      ? first.rightOuter
      : hinge === 'top'
        ? atCabinetTop
        : first.bottomBoundaryId === OPENING_EDGE_BOTTOM && first.isBottomTier;
  return outer ? 'overlay' : 'half-overlay';
}

/** Door leaves or a flap over the cells `first`..`last` of one section. */
export function createOpeningFrontParts(spec: CabinetFrontSpec, first: CabinetOpening, last: CabinetOpening, ctx: FrontBuildContext): Part[] {
  const { left, right, bottom, top, z } = getFrontRect(first, last, ctx);
  const gaps = getFrontGaps(ctx.frontOpeningMode);
  const middle = (left + right) / 2;
  const leaves: Array<{ role: PartRole; hinge: CabinetFrontHinge; leaf?: 'left' | 'right'; left: number; right: number }> = spec.kind === 'double'
    ? [
        { role: 'front-left', hinge: 'left', leaf: 'left', left, right: middle - gaps.middle / 2 },
        { role: 'front-right', hinge: 'right', leaf: 'right', left: middle + gaps.middle / 2, right },
      ]
    : spec.kind === 'flap'
      ? [{ role: 'front-flap', hinge: spec.hinge === 'bottom' ? 'bottom' : 'top', left, right }]
      : [{ role: spec.hinge === 'right' ? 'front-right' : 'front-left', hinge: spec.hinge === 'right' ? 'right' : 'left', left, right }];
  return leaves.map((leaf) => createPanelPart({
    name: `${ctx.name}${NAME_SEP}${roleLabel(leaf.role)}`,
    width: Math.max(40, leaf.right - leaf.left),
    height: Math.max(40, top - bottom),
    thickness: ctx.thickness,
    position: { x: (leaf.left + leaf.right) / 2, y: (bottom + top) / 2, z },
    meta: {
      groupId: ctx.groupId,
      role: leaf.role,
      sourceId: `${FRONT_SOURCE_PREFIX}${spec.id}${leaf.leaf ? `:${leaf.leaf}` : ''}`,
      hingeEdge: leaf.hinge,
      hingeType: getHingeType(leaf.hinge, first, last, ctx),
    },
  }));
}

/** Where a front over the cells `first`..`last` goes, by the overlay/inset gap rules; drawer fronts use it for their block too. */
export function getFrontRect(first: CabinetOpening, last: CabinetOpening, ctx: FrontBuildContext) {
  const { thickness, position } = ctx;
  const gaps = getFrontGaps(ctx.frontOpeningMode);
  const innerGap = Math.max(OVERLAY_FRONT_TIER_DIVIDER_GAP, gaps.middle);
  let left: number;
  let right: number;
  let bottom: number;
  let top: number;
  let z: number;
  if (ctx.frontMode === 'inset') {
    left = first.startX + INSET_FRONT_WIDTH_REDUCTION / 2;
    right = first.endX - INSET_FRONT_WIDTH_REDUCTION / 2;
    bottom = first.startY + INSET_FRONT_HEIGHT_REDUCTION / 2;
    top = last.endY - INSET_FRONT_HEIGHT_REDUCTION / 2;
    z = position.z + ctx.depth / 2 - thickness / 2;
  } else {
    // Overlay: over an outer panel up to an edge gap; halfway over a shared panel (partition, shelf, divider) with a gap at its middle.
    left = first.leftOuter ? first.startX - thickness + gaps.edge : first.startX - thickness / 2 + gaps.middle / 2;
    right = first.rightOuter ? first.endX + thickness - gaps.edge : first.endX + thickness / 2 - gaps.middle / 2;
    // At the cabinet bottom a front stops at the bottom panel even with a plinth: covering the plinth would leave no room
    // for the lowest drawer box, which cannot go below the bottom panel.
    bottom = first.bottomBoundaryId !== OPENING_EDGE_BOTTOM || !first.isBottomTier
      ? first.startY - first.bottomHalf + innerGap / 2
      : ctx.floorClearance !== undefined
        ? ctx.position.y + ctx.floorClearance
        : first.startY - thickness + OVERLAY_FRONT_BOTTOM_EDGE_GAP;
    top = last.topBoundaryId !== OPENING_EDGE_TOP || !last.isTopTier
      ? last.endY + last.topHalf - innerGap / 2
      : ctx.topOverFronts
        // The top reaches over the front: the front stops under it.
        ? last.endY - OVERLAY_FRONT_TOP_EDGE_GAP
        : last.endY + thickness - OVERLAY_FRONT_TOP_EDGE_GAP;
    z = position.z + ctx.depth / 2 + thickness / 2;
  }
  return { left, right, bottom, top, z };
}

function createDefaultFrontSpec(sectionId: string, bottomBoundaryId: string, topBoundaryId: string, clearWidth: number, onLeftHalf: boolean): CabinetFrontSpec {
  return {
    id: createId('front'),
    sectionId,
    bottomBoundaryId,
    topBoundaryId,
    kind: clearWidth > SINGLE_DOOR_MAX_WIDTH ? 'double' : 'door',
    hinge: onLeftHalf ? 'left' : 'right',
  };
}

/** A new cabinet with fronts: a door over every whole section. */
export function withDefaultFronts(layout: CabinetLayout, innerWidth: number, thickness: number): CabinetLayout {
  const resolvedTiers = resolveCabinetTierLayouts(layout, innerWidth, thickness);
  return updateAllFronts(layout, (_fronts, tierId) => (
    resolvedTiers.find((tier) => tier.tierId === tierId)?.resolved.leafSections.map((section) => (
      createDefaultFrontSpec(section.id, OPENING_EDGE_BOTTOM, OPENING_EDGE_TOP, getSectionInnerSpan(section, thickness).width, section.centerX <= 1)
    )) ?? []
  ));
}

/** The front spec a front part was built from (both leaves of a double door share it). */
export function getFrontSpecId(part: Part): string | null {
  const sourceId = part.meta?.sourceId;
  return sourceId?.startsWith(FRONT_SOURCE_PREFIX) ? sourceId.slice(FRONT_SOURCE_PREFIX.length).split(':')[0] ?? null : null;
}

/** Puts a front over the opening, replacing the fronts it overlaps in any tier; `null` just clears the opening. */
export function setFrontOnOpening(parts: Part[], groupId: string, ref: CabinetOpeningRef, front: { kind: CabinetFrontKind; hinge: CabinetFrontHinge } | null): CabinetLayout | null {
  const module = getCabinetModuleState(parts, groupId);
  if (!module) return null;
  const openings = getCabinetOpenings(parts, groupId);
  const target = getOpeningRange(openings, ref);
  if (!target) return null;
  const targetCells = target.cells.slice(target.from, target.to + 1);
  const bottom = targetCells[0]!;
  const { tierId: frontTierId, ...openingRef } = toOpeningRef(bottom, targetCells[targetCells.length - 1]!);
  // A door over drawers: drawers that were never set back go back by the default recess, so their fronts clear the door.
  let layout = module.layout;
  if (front) {
    const drawerFronts = parts.filter((part) => part.meta?.groupId === groupId && part.meta?.role === 'drawer-front');
    getCabinetTierSpecs(layout).flatMap((tier) => tier.layout.drawers ?? []).forEach((stack) => {
      if (!stack.block || stack.block.recess !== undefined) return;
      const covered = drawerFronts.some((part) => (part.meta?.sourceId ?? '').startsWith(`${stack.id}:`)
        && targetCells.some((cell) => cell.hasDrawers && part.position.x > cell.startX && part.position.x < cell.endX && part.position.y > cell.startY && part.position.y < cell.endY));
      if (covered) layout = updateDrawerBlock(layout, stack.id, { recess: DEFAULT_DRAWER_RECESS_BEHIND_DOOR });
    });
  }
  return updateAllFronts(layout, (fronts, tierId) => [
    ...fronts.filter((spec) => {
      const range = getOpeningRange(openings, { ...spec, tierId });
      // A front whose boundary is gone is dropped along the way.
      return Boolean(range) && !range!.cells.slice(range!.from, range!.to + 1).some((cell) => targetCells.includes(cell));
    }),
    // A front is stored in the tier of its bottom cell.
    ...(front && tierId === frontTierId ? [{ id: createId('front'), ...openingRef, kind: front.kind, hinge: front.hinge }] : []),
  ]);
}

/** Doors everywhere: one front per run of drawer-free cells in every section, hinged towards the nearer cabinet side. */
export function setFrontsOnAllOpenings(parts: Part[], groupId: string): CabinetLayout | null {
  const module = getCabinetModuleState(parts, groupId);
  if (!module) return null;
  const openings = getCabinetOpenings(parts, groupId);
  const frontsByTier = new Map<string, CabinetFrontSpec[]>();
  let run: CabinetOpening[] = [];
  const flush = () => {
    const first = run[0];
    const last = run[run.length - 1];
    run = [];
    if (!first || !last) return;
    const spec = createDefaultFrontSpec(first.sectionId, first.bottomBoundaryId, last.topBoundaryId, first.endX - first.startX, (first.startX + first.endX) / 2 <= module.position.x + 1);
    frontsByTier.set(first.tierId, [...(frontsByTier.get(first.tierId) ?? []), spec]);
  };
  openings.forEach((cell, index) => {
    const previous = openings[index - 1];
    if (previous && (previous.tierId !== cell.tierId || previous.sectionId !== cell.sectionId)) flush();
    if (cell.hasDrawers) flush();
    else run.push(cell);
  });
  flush();
  return updateAllFronts(module.layout, (_fronts, tierId) => frontsByTier.get(tierId) ?? []);
}

/** Hinge side picked on a front part: top/bottom makes it a flap, left/right a door (a double door keeps both leaves). */
export function setFrontHingeInLayout(layout: CabinetLayout, frontId: string, hinge: CabinetFrontHinge): CabinetLayout {
  return updateAllFronts(layout, (fronts) => fronts.map((spec) => {
    if (spec.id !== frontId) return spec;
    const kind: CabinetFrontKind = hinge === 'top' || hinge === 'bottom' ? 'flap' : spec.kind === 'double' ? 'double' : 'door';
    return { ...spec, kind, hinge };
  }));
}
