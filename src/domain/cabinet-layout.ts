import { createId } from '../shared/ids';

export type HorizontalCabinetLayout = {
  partitions: CabinetPartitionSpec[];
  shelves: CabinetShelfSpec[];
  drawers?: CabinetDrawerStackSpec[];
  tierDividers?: CabinetSectionTierDividerSpec[];
  sectionWidths?: number[];
  fronts?: CabinetFrontSpec[];
};

export type CabinetFrontKind = 'door' | 'double' | 'flap';
export type CabinetFrontHinge = 'left' | 'right' | 'top' | 'bottom';

/** Opening edge ids for the tier's own lower/upper edge (bottom panel or tier divider below, top panel or divider above). */
export const OPENING_EDGE_BOTTOM = 'tier-bottom';
export const OPENING_EDGE_TOP = 'tier-top';

/**
 * A front over an opening of one section: from its bottom boundary up to its top boundary, covering the shelves between.
 * Boundaries are shelf / local divider ids (or the tier edges), so a front follows them when they move.
 */
export type CabinetFrontSpec = {
  id: string;
  sectionId: string;
  bottomBoundaryId: string;
  topBoundaryId: string;
  /** Set when the top boundary is in a tier above: the front spans the lined-up sections through the tier dividers. */
  topTierId?: string;
  topSectionId?: string;
  kind: CabinetFrontKind;
  /** Door: left/right; flap: top (lifts up) or bottom (folds down); a double door ignores it. */
  hinge: CabinetFrontHinge;
};

export type CabinetTierSpec = {
  id: string;
  heightRatio: number;
  layout: HorizontalCabinetLayout;
};

export type CabinetLayout = HorizontalCabinetLayout & {
  tiers?: CabinetTierSpec[];
};

export type CabinetPartitionSpec = {
  id: string;
  parentSectionId: string;
  leftSectionId: string;
  rightSectionId: string;
  splitRatio: number;
};

export type CabinetShelfSpec = {
  id: string;
  sectionId: string;
  zoneId?: string;
  /** Manually placed shelf: center Y above the cabinet base (mm). Unset = evenly distributed in its zone. */
  elevation?: number;
  /** Apron under the shelf at the back; top/bottom aprons follow the cabinet option instead. */
  withApron?: boolean;
};

export type DrawerRunnerType = 'hidden-unihoper';
export type DrawerRunnerLength = 250 | 300 | 350 | 400 | 450 | 500 | 550 | 600;
export type DrawerRunnerLengthMode = 'auto' | 'manual';

export type CabinetDrawerStackSpec = {
  id: string;
  sectionId: string;
  zoneId?: string;
  drawerCount: number;
  runnerType: DrawerRunnerType;
  runnerLength: DrawerRunnerLength;
  runnerLengthMode?: DrawerRunnerLengthMode;
  withInnerFrontPanel?: boolean;
  /** Set for stacks added as a drawer block; legacy stacks live in a zone picked by `zoneId`. */
  block?: CabinetDrawerBlockSpec;
};

export type DrawerBlockAnchor = 'bottom' | 'top';

/** One-click drawer block: owns the local dividers bounding it; its height follows the drawer count. */
export type CabinetDrawerBlockSpec = {
  anchor: DrawerBlockAnchor;
  /** Divider on the inner side of the block (above a bottom block, below a top one). */
  dividerId: string;
  /** Divider between the block and the section edge; present only when `offset` leaves a niche. */
  baseDividerId?: string;
  /** Clear niche between the section edge and the block, mm. */
  offset?: number;
  /** Height per drawer, mm: block height = drawerCount × slotHeight. */
  slotHeight: number;
  columns: number;
  withBackPanel: boolean;
  /** Drawers take the whole section beyond the niche: no inner divider is built and slotHeight is not used. */
  fill?: boolean;
  /** Full-height panel inside the block, `gap` mm off one section wall: the drawers run on it past hinges, a wall or a door casing. */
  falsePanel?: DrawerFalsePanelSpec;
  /** Drawers (fronts and boxes) set back from the carcass front, mm — e.g. behind a door put over them. Unset = 0. */
  recess?: number;
};

export type DrawerFalsePanelSpec = {
  side: 'left' | 'right';
  /** Clear gap between the section wall and the false panel, mm. */
  gap: number;
};

export const DEFAULT_DRAWER_FALSE_PANEL_GAP = 20;
/** Recess given to drawers that have none when a door is put over them. */
export const DEFAULT_DRAWER_RECESS_BEHIND_DOOR = 20;

export type DrawerBlockInput = {
  anchor: DrawerBlockAnchor;
  offset: number;
  drawerCount: number;
  columns: number;
  slotHeight: number;
  withBackPanel: boolean;
  runnerType: DrawerRunnerType;
  runnerLength: DrawerRunnerLength;
  runnerLengthMode: DrawerRunnerLengthMode;
  fill?: boolean;
  falsePanel?: DrawerFalsePanelSpec;
  recess?: number;
};

export const DEFAULT_DRAWER_SLOT_HEIGHT = 200;
export const MIN_DRAWER_SLOT_HEIGHT = 100;
export const MAX_DRAWER_BLOCK_COLUMNS = 3;
export const MAX_SECTION_TIER_DIVIDERS = 4;

export type CabinetSectionTierDividerSpec = {
  id: string;
  sectionId: string;
  positionRatio: number;
};

export type CabinetSection = {
  id: string;
  parentId: string | null;
  startX: number;
  endX: number;
  width: number;
  centerX: number;
  leftBoundary: 'outer' | 'partition';
  rightBoundary: 'outer' | 'partition';
};

export type CabinetSectionInnerSpan = {
  startX: number;
  endX: number;
  width: number;
  centerX: number;
};

export type ResolvedCabinetPartition = CabinetPartitionSpec & {
  x: number;
};

export type ResolvedCabinetLayout = {
  sections: CabinetSection[];
  leafSections: CabinetSection[];
  partitions: ResolvedCabinetPartition[];
  shelvesBySection: Map<string, CabinetShelfSpec[]>;
  drawersBySection: Map<string, CabinetDrawerStackSpec[]>;
  tierDividersBySection: Map<string, CabinetSectionTierDividerSpec[]>;
};

export type ResolvedCabinetTierLayout = {
  tierId: string;
  heightRatio: number;
  resolved: ResolvedCabinetLayout;
};

type SectionNode = {
  id: string;
  parentId: string | null;
  startX: number;
  endX: number;
  leftBoundary: CabinetSection['leftBoundary'];
  rightBoundary: CabinetSection['rightBoundary'];
};

type PartitionNode = {
  partition: CabinetPartitionSpec;
  left: string;
  right: string;
};

export const ROOT_SECTION_ID = 'section-root';
export const ROOT_TIER_ID = 'tier-root';
export const WIDE_SECTION_TIER_THRESHOLD = 1000;
const MIN_LOCAL_TIER_DIVIDER_RATIO = 0.2;

function toHorizontalLayout(layout: CabinetLayout): HorizontalCabinetLayout {
  return {
    partitions: layout.partitions,
    shelves: layout.shelves,
    drawers: layout.drawers,
    tierDividers: layout.tierDividers,
    sectionWidths: layout.sectionWidths,
    fronts: layout.fronts,
  };
}

function withTierSpecs(tiers: CabinetTierSpec[]): CabinetLayout {
  const primary = tiers[0]?.layout ?? { partitions: [], shelves: [], drawers: [], tierDividers: [] };
  return {
    partitions: primary.partitions,
    shelves: primary.shelves,
    drawers: primary.drawers,
    tierDividers: primary.tierDividers,
    sectionWidths: primary.sectionWidths,
    fronts: primary.fronts,
    tiers,
  };
}

function getTierSpecs(layout: CabinetLayout): CabinetTierSpec[] {
  if (!layout.tiers?.length) return [{ id: ROOT_TIER_ID, heightRatio: 1, layout: toHorizontalLayout(layout) }];
  // Older cabinets stored a whole tiered layout inside tier 0 (see createCabinetLayout). Edits always update the
  // tier's own top-level fields, while resolving read the stale nested copy, so upper-tier edits had no effect.
  const hasNestedTiers = layout.tiers.some((tier) => Boolean((tier.layout as CabinetLayout).tiers));
  return hasNestedTiers
    ? layout.tiers.map((tier) => ((tier.layout as CabinetLayout).tiers ? { ...tier, layout: toHorizontalLayout(tier.layout) } : tier))
    : layout.tiers;
}

function cloneHorizontalLayout(layout: HorizontalCabinetLayout): HorizontalCabinetLayout {
  const sectionIds = new Set<string>([ROOT_SECTION_ID]);
  layout.partitions.forEach((partition) => {
    sectionIds.add(partition.parentSectionId);
    sectionIds.add(partition.leftSectionId);
    sectionIds.add(partition.rightSectionId);
  });
  layout.shelves.forEach((shelf) => sectionIds.add(shelf.sectionId));
  layout.drawers?.forEach((drawer) => sectionIds.add(drawer.sectionId));
  layout.tierDividers?.forEach((divider) => sectionIds.add(divider.sectionId));
  const sectionIdMap = new Map<string, string>([[ROOT_SECTION_ID, ROOT_SECTION_ID]]);
  [...sectionIds]
    .filter((id) => id !== ROOT_SECTION_ID)
    .forEach((id) => sectionIdMap.set(id, createId('section')));
  const dividerIdMap = new Map((layout.tierDividers ?? []).map((divider) => [divider.id, createId('section-tier-divider')] as const));

  return {
    partitions: layout.partitions.map((partition) => ({
      id: createId('partition'),
      parentSectionId: sectionIdMap.get(partition.parentSectionId) ?? ROOT_SECTION_ID,
      leftSectionId: sectionIdMap.get(partition.leftSectionId) ?? createId('section'),
      rightSectionId: sectionIdMap.get(partition.rightSectionId) ?? createId('section'),
      splitRatio: partition.splitRatio,
    })),
    shelves: layout.shelves.map((shelf) => ({
      id: createId('shelf'),
      sectionId: sectionIdMap.get(shelf.sectionId) ?? shelf.sectionId,
      elevation: shelf.elevation,
    })),
    drawers: layout.drawers?.map((drawer) => ({
      ...drawer,
      id: createId('drawer-stack'),
      sectionId: sectionIdMap.get(drawer.sectionId) ?? drawer.sectionId,
      block: drawer.block
        ? {
            ...drawer.block,
            dividerId: dividerIdMap.get(drawer.block.dividerId) ?? drawer.block.dividerId,
            baseDividerId: drawer.block.baseDividerId ? dividerIdMap.get(drawer.block.baseDividerId) ?? drawer.block.baseDividerId : undefined,
          }
        : undefined,
    })),
    tierDividers: layout.tierDividers?.map((divider) => ({
      ...divider,
      id: dividerIdMap.get(divider.id) ?? createId('section-tier-divider'),
      sectionId: sectionIdMap.get(divider.sectionId) ?? divider.sectionId,
    })),
    sectionWidths: layout.sectionWidths ? [...layout.sectionWidths] : undefined,
    // Fronts point at the old shelf/divider ids, which the clone does not keep.
    fronts: [],
  };
}

function clampLocalTierDividerRatio(value: number) {
  return Math.max(MIN_LOCAL_TIER_DIVIDER_RATIO, Math.min(1 - MIN_LOCAL_TIER_DIVIDER_RATIO, value));
}


function findTierIndexBySectionId(layout: CabinetLayout, sectionId: string) {
  return getTierSpecs(layout).findIndex((tier) => collectLeafOrder(tier.layout).includes(sectionId));
}

function findTierIndexByPartitionId(layout: CabinetLayout, partitionId: string) {
  return getTierSpecs(layout).findIndex((tier) => tier.layout.partitions.some((partition) => partition.id === partitionId));
}

function findTierIndexByShelfId(layout: CabinetLayout, shelfId: string) {
  return getTierSpecs(layout).findIndex((tier) => tier.layout.shelves.some((shelf) => shelf.id === shelfId));
}

function findTierIndexByDrawerId(layout: CabinetLayout, drawerId: string) {
  return getTierSpecs(layout).findIndex((tier) => tier.layout.drawers?.some((drawer) => drawer.id === drawerId));
}

function findTierIndexBySectionTierDividerId(layout: CabinetLayout, dividerId: string) {
  return getTierSpecs(layout).findIndex((tier) => tier.layout.tierDividers?.some((divider) => divider.id === dividerId));
}

function makeSection(
  id: string,
  parentId: string | null,
  startX: number,
  endX: number,
  leftBoundary: CabinetSection['leftBoundary'],
  rightBoundary: CabinetSection['rightBoundary']
): CabinetSection {
  return {
    id,
    parentId,
    startX,
    endX,
    width: endX - startX,
    centerX: (startX + endX) / 2,
    leftBoundary,
    rightBoundary,
  };
}

function getPartitionTree(layout: HorizontalCabinetLayout) {
  const byParent = new Map<string, CabinetPartitionSpec>();
  layout.partitions.forEach((partition) => byParent.set(partition.parentSectionId, partition));
  return byParent;
}

function collectLeafOrder(layout: HorizontalCabinetLayout): string[] {
  const byParent = getPartitionTree(layout);
  const order: string[] = [];

  const walk = (sectionId: string) => {
    const partition = byParent.get(sectionId);
    if (!partition) {
      order.push(sectionId);
      return;
    }
    walk(partition.leftSectionId);
    walk(partition.rightSectionId);
  };

  walk(ROOT_SECTION_ID);
  return order;
}

function normalizeSectionWidths(widths: number[], innerWidth: number) {
  const sanitized = widths.map((value) => (Number.isFinite(value) && value > 0 ? value : 1));
  const total = sanitized.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return Array.from({ length: sanitized.length }, () => innerWidth / Math.max(sanitized.length, 1));
  return sanitized.map((value) => (value / total) * innerWidth);
}

function normalizeSectionWidthsPinned(widths: number[], innerWidth: number, pinnedIndex: number): number[] {
  const n = widths.length;
  if (n === 0) return [];
  if (n === 1) return [innerWidth];
  const minWidth = 1;
  const maxPinned = innerWidth - (n - 1) * minWidth;
  const pinned = Math.max(minWidth, Math.min(maxPinned, Number.isFinite(widths[pinnedIndex]) ? widths[pinnedIndex]! : minWidth));
  const remaining = innerWidth - pinned;
  const others = widths.map((w, i) => (i !== pinnedIndex ? Math.max(minWidth, Number.isFinite(w) && w > 0 ? w : minWidth) : 0));
  const othersTotal = others.reduce((sum, w) => sum + w, 0);
  return widths.map((_, i) => {
    if (i === pinnedIndex) return pinned;
    return othersTotal > 0 ? (others[i]! / othersTotal) * remaining : remaining / (n - 1);
  });
}

function buildResolvedStructure(layout: HorizontalCabinetLayout, innerWidth: number, thickness: number): { sections: Map<string, SectionNode>; partitions: ResolvedCabinetPartition[]; leafOrder: string[] } {
  const root: SectionNode = {
    id: ROOT_SECTION_ID,
    parentId: null,
    startX: -innerWidth / 2,
    endX: innerWidth / 2,
    leftBoundary: 'outer',
    rightBoundary: 'outer',
  };
  const sections = new Map<string, SectionNode>([[root.id, root]]);
  const byParent = getPartitionTree(layout);
  const resolvedPartitions: ResolvedCabinetPartition[] = [];
  const explicitLeafOrder = collectLeafOrder(layout);
  const explicitWidths = layout.sectionWidths?.length === explicitLeafOrder.length
    ? normalizeSectionWidths(layout.sectionWidths, Math.max(1, innerWidth - layout.partitions.length * thickness))
    : null;

  if (!explicitWidths) {
    let leafSections = [root];
    layout.partitions.forEach((partition) => {
      const parent = leafSections.find((section) => section.id === partition.parentSectionId);
      if (!parent) return;
      const splitX = parent.startX + (parent.endX - parent.startX) * partition.splitRatio;
      const left: SectionNode = {
        id: partition.leftSectionId,
        parentId: parent.id,
        startX: parent.startX,
        endX: splitX,
        leftBoundary: parent.leftBoundary,
        rightBoundary: 'partition',
      };
      const right: SectionNode = {
        id: partition.rightSectionId,
        parentId: parent.id,
        startX: splitX,
        endX: parent.endX,
        leftBoundary: 'partition',
        rightBoundary: parent.rightBoundary,
      };
      sections.set(left.id, left);
      sections.set(right.id, right);
      leafSections = [...leafSections.filter((section) => section.id !== parent.id), left, right].sort((a, b) => a.startX - b.startX);
      resolvedPartitions.push({ ...partition, x: splitX });
    });
    return { sections, partitions: resolvedPartitions, leafOrder: leafSections.map((section) => section.id) };
  }

  const widthByLeaf = new Map(explicitLeafOrder.map((id, index) => [id, explicitWidths[index]!]));
  const partitionNodeByParent = new Map<string, PartitionNode>(
    layout.partitions.map((partition) => [
      partition.parentSectionId,
      { partition, left: partition.leftSectionId, right: partition.rightSectionId },
    ])
  );
  const resolvedSectionNodes = new Map<string, SectionNode>();
  const resolved: ResolvedCabinetPartition[] = [];

  const walk = (
    sectionId: string,
    parentId: string | null,
    startX: number,
    leftBoundary: CabinetSection['leftBoundary'],
    rightBoundary: CabinetSection['rightBoundary']
  ): number => {
    const node = partitionNodeByParent.get(sectionId);
    if (!node) {
      const clearWidth = widthByLeaf.get(sectionId) ?? innerWidth;
      const rawWidth = clearWidth
        + (leftBoundary === 'partition' ? thickness / 2 : 0)
        + (rightBoundary === 'partition' ? thickness / 2 : 0);
      const endX = startX + rawWidth;
      resolvedSectionNodes.set(sectionId, { id: sectionId, parentId, startX, endX, leftBoundary, rightBoundary });
      return endX;
    }

    const leftEndX = walk(node.left, sectionId, startX, leftBoundary, 'partition');
    const endX = walk(node.right, sectionId, leftEndX, 'partition', rightBoundary);
    resolvedSectionNodes.set(sectionId, { id: sectionId, parentId, startX, endX, leftBoundary, rightBoundary });
    resolved.push({ ...node.partition, x: leftEndX });
    return endX;
  };

  walk(ROOT_SECTION_ID, null, -innerWidth / 2, 'outer', 'outer');
  return { sections: resolvedSectionNodes, partitions: resolved.sort((a, b) => a.x - b.x), leafOrder: explicitLeafOrder };
}

function getLeafWidths(layout: HorizontalCabinetLayout, innerWidth: number, thickness = 0) {
  const resolved = resolveCabinetLayout(layout, innerWidth, thickness);
  return resolved.leafSections.map((section) => section.width);
}

function collectPartitionSubtree(layout: HorizontalCabinetLayout, partitionId: string) {
  const target = layout.partitions.find((partition) => partition.id === partitionId);
  if (!target) return null;
  const byParent = getPartitionTree(layout);
  const removedPartitionIds = new Set<string>();
  const descendantLeaves = new Set<string>();

  const walk = (sectionId: string) => {
    const child = byParent.get(sectionId);
    if (!child) {
      descendantLeaves.add(sectionId);
      return;
    }
    removedPartitionIds.add(child.id);
    walk(child.leftSectionId);
    walk(child.rightSectionId);
  };

  removedPartitionIds.add(target.id);
  walk(target.leftSectionId);
  walk(target.rightSectionId);

  return { target, removedPartitionIds, descendantLeaves };
}

export function getSectionInnerSpan(section: CabinetSection, thickness: number): CabinetSectionInnerSpan {
  const startInset = section.leftBoundary === 'partition' ? thickness / 2 : 0;
  const endInset = section.rightBoundary === 'partition' ? thickness / 2 : 0;
  const startX = section.startX + startInset;
  const endX = section.endX - endInset;
  return {
    startX,
    endX,
    width: Math.max(0, endX - startX),
    centerX: (startX + endX) / 2,
  };
}

export function createCabinetLayout(partitionCount = 0, shelfCount = 0): CabinetLayout {
  let layout: HorizontalCabinetLayout = { partitions: [], shelves: [] };

  if (partitionCount > 0) {
    const boundaries = Array.from({ length: partitionCount }, (_, idx) => -500 + (1000 * (idx + 1)) / (partitionCount + 1));
    boundaries.forEach((boundary) => {
      const resolved = resolveCabinetLayout(layout, 1000);
      const target = resolved.leafSections.find((section) => boundary > section.startX && boundary < section.endX)
        ?? resolved.leafSections[resolved.leafSections.length - 1];
      if (!target) return;
      const splitRatio = Math.max(0.2, Math.min(0.8, (boundary - target.startX) / Math.max(target.endX - target.startX, 1)));
      // splitSection returns a tiered layout; keep only the horizontal part so tier 0 has no nested tiers.
      layout = toHorizontalLayout(splitSection(layout, target.id, splitRatio).layout);
    });
  }

  if (shelfCount > 0) {
    const resolved = resolveCabinetLayout(layout, 1000);
    const leaves = resolved.leafSections;
    for (let idx = 0; idx < shelfCount; idx += 1) {
      const section = leaves[idx % Math.max(leaves.length, 1)];
      if (!section) break;
      layout = toHorizontalLayout(addShelfToSection(layout, section.id).layout);
    }
  }

  return withTierSpecs([{ id: ROOT_TIER_ID, heightRatio: 1, layout }]);
}

export function resolveCabinetLayout(layout: CabinetLayout, innerWidth: number, thickness = 0): ResolvedCabinetLayout {
  const tier = getTierSpecs(layout)[0]?.layout ?? toHorizontalLayout(layout);
  const { sections: sectionNodes, partitions, leafOrder } = buildResolvedStructure(tier, innerWidth, thickness);
  const sections = [...sectionNodes.values()].map((section) =>
    makeSection(section.id, section.parentId, section.startX, section.endX, section.leftBoundary, section.rightBoundary)
  );
  const leafSections = leafOrder
    .map((id) => sections.find((section) => section.id === id) ?? null)
    .filter((section): section is CabinetSection => Boolean(section));
  const shelvesBySection = new Map<string, CabinetShelfSpec[]>();
  tier.shelves.forEach((shelf) => {
    if (!leafSections.some((section) => section.id === shelf.sectionId)) return;
    shelvesBySection.set(shelf.sectionId, [...(shelvesBySection.get(shelf.sectionId) ?? []), shelf]);
  });
  const drawersBySection = new Map<string, CabinetDrawerStackSpec[]>();
  tier.drawers?.forEach((drawer) => {
    if (!leafSections.some((section) => section.id === drawer.sectionId)) return;
    drawersBySection.set(drawer.sectionId, [...(drawersBySection.get(drawer.sectionId) ?? []), drawer]);
  });
  const tierDividersBySection = new Map<string, CabinetSectionTierDividerSpec[]>();
  tier.tierDividers?.forEach((divider) => {
    if (!leafSections.some((section) => section.id === divider.sectionId)) return;
    tierDividersBySection.set(divider.sectionId, [...(tierDividersBySection.get(divider.sectionId) ?? []), divider]);
  });
  tierDividersBySection.forEach((dividers, sectionId) => {
    tierDividersBySection.set(sectionId, [...dividers].sort((a, b) => a.positionRatio - b.positionRatio));
  });

  return { sections, leafSections, partitions, shelvesBySection, drawersBySection, tierDividersBySection };
}

function splitSectionInHorizontalLayout(layout: HorizontalCabinetLayout, sectionId: string, splitRatio = 0.5): { layout: HorizontalCabinetLayout; partition: CabinetPartitionSpec } {
  const partition: CabinetPartitionSpec = {
    id: createId('partition'),
    parentSectionId: sectionId,
    leftSectionId: createId('section'),
    rightSectionId: createId('section'),
    splitRatio: Math.max(0.2, Math.min(0.8, splitRatio)),
  };
  const shelves = layout.shelves.map((shelf) => (shelf.sectionId === sectionId ? { ...shelf, sectionId: partition.leftSectionId } : shelf));
  const nextLayout: CabinetLayout = {
    partitions: [...layout.partitions, partition],
    shelves,
    drawers: layout.drawers?.map((drawer) => (drawer.sectionId === sectionId ? { ...drawer, sectionId: partition.leftSectionId } : drawer)),
    // Local dividers follow the section's shelves and drawers into the left half; other sections keep theirs.
    tierDividers: layout.tierDividers?.map((divider) => (divider.sectionId === sectionId ? { ...divider, sectionId: partition.leftSectionId } : divider)),
    sectionWidths: layout.sectionWidths,
    // Fronts follow their shelves into the left half.
    fronts: layout.fronts?.map((front) => (front.sectionId === sectionId ? { ...front, sectionId: partition.leftSectionId } : front)),
  };

  if (!layout.sectionWidths) {
    return { layout: nextLayout, partition };
  }

  const leafOrder = collectLeafOrder(layout);
  const nextLeafOrder = collectLeafOrder(nextLayout);
  const widths = normalizeSectionWidths(layout.sectionWidths, 1000);
  const index = leafOrder.findIndex((id) => id === sectionId);
  if (index < 0) return { layout: nextLayout, partition };
  const originalWidth = widths[index] ?? 1000 / Math.max(leafOrder.length, 1);
  const nextWidths = [
    ...widths.slice(0, index),
    originalWidth * partition.splitRatio,
    originalWidth * (1 - partition.splitRatio),
    ...widths.slice(index + 1),
  ];
  return {
    layout: { ...nextLayout, sectionWidths: nextLeafOrder.length === nextWidths.length ? nextWidths : undefined },
    partition,
  };
}

function addShelfToHorizontalSection(layout: HorizontalCabinetLayout, sectionId: string, zoneId?: string): { layout: HorizontalCabinetLayout; shelf: CabinetShelfSpec } {
  // Adds only the shelf: drawers stay (the builder keeps shelves out of drawer-block zones).
  const shelf: CabinetShelfSpec = { id: createId('shelf'), sectionId, zoneId };
  return { layout: { ...layout, shelves: [...layout.shelves, shelf] }, shelf };
}

function removeShelfInHorizontalLayout(layout: HorizontalCabinetLayout, shelfId: string): HorizontalCabinetLayout {
  return {
    ...layout,
    shelves: layout.shelves.filter((shelf) => shelf.id !== shelfId),
  };
}

function removeSectionTierDividerInHorizontalLayout(layout: HorizontalCabinetLayout, dividerId: string): HorizontalCabinetLayout {
  // The other dividers stay exactly where they are.
  return { ...layout, tierDividers: layout.tierDividers?.filter((divider) => divider.id !== dividerId) };
}

function updateSectionTierDividerPositionInHorizontalLayout(
  layout: HorizontalCabinetLayout,
  dividerId: string,
  nextPositionRatio: number
): HorizontalCabinetLayout {
  const target = layout.tierDividers?.find((divider) => divider.id === dividerId);
  if (!target) return layout;
  const sectionDividers = (layout.tierDividers ?? [])
    .filter((divider) => divider.sectionId === target.sectionId)
    .sort((a, b) => a.positionRatio - b.positionRatio);
  const targetIndex = sectionDividers.findIndex((divider) => divider.id === dividerId);
  if (targetIndex < 0) return layout;

  const prevRatio = targetIndex > 0
    ? (sectionDividers[targetIndex - 1]?.positionRatio ?? MIN_LOCAL_TIER_DIVIDER_RATIO) + MIN_LOCAL_TIER_DIVIDER_RATIO
    : MIN_LOCAL_TIER_DIVIDER_RATIO;
  const nextRatio = targetIndex < sectionDividers.length - 1
    ? (sectionDividers[targetIndex + 1]?.positionRatio ?? (1 - MIN_LOCAL_TIER_DIVIDER_RATIO)) - MIN_LOCAL_TIER_DIVIDER_RATIO
    : 1 - MIN_LOCAL_TIER_DIVIDER_RATIO;
  const clampedRatio = Math.max(prevRatio, Math.min(nextRatio, clampLocalTierDividerRatio(nextPositionRatio)));

  return {
    ...layout,
    tierDividers: (layout.tierDividers ?? []).map((divider) => (
      divider.id === dividerId
        ? { ...divider, positionRatio: clampedRatio }
        : divider
    )),
  };
}

function removePartitionInHorizontalLayout(layout: HorizontalCabinetLayout, partitionId: string): HorizontalCabinetLayout {
  const subtree = collectPartitionSubtree(layout, partitionId);
  if (!subtree) return layout;

  const currentLeafOrder = collectLeafOrder(layout);
  const currentWidths = layout.sectionWidths?.length === currentLeafOrder.length ? [...layout.sectionWidths] : getLeafWidths(layout, 1000);
  const mergedWidth = currentLeafOrder.reduce((sum, sectionId, index) => (
    subtree.descendantLeaves.has(sectionId) ? sum + (currentWidths[index] ?? 0) : sum
  ), 0);

  const nextPartitions = layout.partitions.filter((partition) => !subtree.removedPartitionIds.has(partition.id));
  // The merged section gets one consistent set of dividers and drawers (a drawer block needs its own dividers):
  // those of the first merged section that has any. Sections outside the removed subtree keep everything.
  const parentSectionId = subtree.target.parentSectionId;
  const donorSectionId = currentLeafOrder
    .filter((sectionId) => subtree.descendantLeaves.has(sectionId))
    .find((sectionId) => (layout.tierDividers ?? []).some((divider) => divider.sectionId === sectionId)
      || (layout.drawers ?? []).some((drawer) => drawer.sectionId === sectionId));
  const moveToMergedSection = <T extends { sectionId: string }>(items: T[] | undefined): T[] | undefined => items?.flatMap((item) => {
    if (!subtree.descendantLeaves.has(item.sectionId)) return [item];
    return item.sectionId === donorSectionId ? [{ ...item, sectionId: parentSectionId }] : [];
  });
  const nextLayoutBase: CabinetLayout = {
    partitions: nextPartitions,
    shelves: layout.shelves.map((shelf) => (
      subtree.descendantLeaves.has(shelf.sectionId)
        ? { ...shelf, sectionId: parentSectionId }
        : shelf
    )),
    drawers: moveToMergedSection(layout.drawers),
    tierDividers: moveToMergedSection(layout.tierDividers),
    // Fronts of the merged sections would overlap in the wider section, so they go; others stay.
    fronts: layout.fronts?.filter((front) => !subtree.descendantLeaves.has(front.sectionId)),
  };

  const nextLeafOrder = collectLeafOrder(nextLayoutBase);
  const nextWidths: number[] = [];
  let mergedInserted = false;
  currentLeafOrder.forEach((sectionId, index) => {
    if (subtree.descendantLeaves.has(sectionId)) {
      if (!mergedInserted) {
        nextWidths.push(mergedWidth);
        mergedInserted = true;
      }
      return;
    }
    nextWidths.push(currentWidths[index] ?? 0);
  });

  return {
    ...nextLayoutBase,
    sectionWidths: nextLeafOrder.length === nextWidths.length ? nextWidths : undefined,
  };
}

function setLeafSectionWidthsInHorizontalLayout(layout: HorizontalCabinetLayout, widths: number[], innerWidth: number, pinnedIndex?: number, thickness = 0): HorizontalCabinetLayout {
  const leafOrder = collectLeafOrder(layout);
  if (leafOrder.length === 0 || widths.length !== leafOrder.length) return layout;
  // Widths are clear openings, matching how buildResolvedStructure lays them out (partitions excluded).
  const clearWidth = Math.max(1, innerWidth - layout.partitions.length * thickness);
  const normalized = pinnedIndex !== undefined
    ? normalizeSectionWidthsPinned(widths, clearWidth, pinnedIndex)
    : normalizeSectionWidths(widths, clearWidth);
  return {
    ...layout,
    sectionWidths: normalized,
  };
}

export function getCabinetTierSpecs(layout: CabinetLayout): CabinetTierSpec[] {
  return getTierSpecs(layout);
}

export function resolveCabinetTierLayouts(layout: CabinetLayout, innerWidth: number, thickness = 0): ResolvedCabinetTierLayout[] {
  return getTierSpecs(layout).map((tier) => ({
    tierId: tier.id,
    heightRatio: tier.heightRatio,
    resolved: resolveCabinetLayout({ ...tier.layout }, innerWidth, thickness),
  }));
}

export function ensureTieredCabinetLayout(layout: CabinetLayout, innerWidth: number): CabinetLayout {
  const tiers = getTierSpecs(layout);
  if (tiers.length > 1) return withTierSpecs(tiers);
  const current = tiers[0]?.layout ?? toHorizontalLayout(layout);
  const resolved = resolveCabinetLayout({ ...current }, innerWidth);
  const hasWideSection = resolved.leafSections.some((section) => section.width > WIDE_SECTION_TIER_THRESHOLD);
  if (!hasWideSection) return withTierSpecs([{ id: ROOT_TIER_ID, heightRatio: 1, layout: current }]);
  const upperTier: CabinetTierSpec = { id: createId('tier'), heightRatio: 1, layout: current };
  const lowerTierLayout = cloneHorizontalLayout({ ...current, shelves: [] });
  const lowerTier: CabinetTierSpec = { id: createId('tier'), heightRatio: 1, layout: lowerTierLayout };
  return withTierSpecs([upperTier, lowerTier]);
}

export function setCabinetTierCount(layout: CabinetLayout, tierCount: number, innerWidth: number): CabinetLayout {
  const nextCount = Math.max(1, Math.round(tierCount));
  if (nextCount <= 1) return collapseTieredCabinetLayout(layout);

  const tiers = getTierSpecs(layout);
  if (tiers.length === nextCount) return withTierSpecs(tiers);

  if (tiers.length === 1) {
    const current = tiers[0]?.layout ?? toHorizontalLayout(layout);
    const nextTiers = Array.from({ length: nextCount }, (_, index) => ({
      id: index === 0 ? createId('tier') : createId('tier'),
      heightRatio: 1,
      layout: index === 0 ? current : cloneHorizontalLayout({ ...current, shelves: [] }),
    }));
    return withTierSpecs(nextTiers);
  }

  if (tiers.length > nextCount) {
    return withTierSpecs(tiers.slice(0, nextCount));
  }

  const seed = tiers[tiers.length - 1]?.layout ?? tiers[0]?.layout ?? toHorizontalLayout(layout);
  return withTierSpecs([
    ...tiers,
    ...Array.from({ length: nextCount - tiers.length }, () => ({
      id: createId('tier'),
      heightRatio: 1,
      layout: cloneHorizontalLayout({ ...seed, shelves: [] }),
    })),
  ]);
}

export function collapseTieredCabinetLayout(layout: CabinetLayout): CabinetLayout {
  const primary = getTierSpecs(layout)[0]?.layout ?? toHorizontalLayout(layout);
  return withTierSpecs([{ id: ROOT_TIER_ID, heightRatio: 1, layout: primary }]);
}

export function setCabinetTierHeights(layout: CabinetLayout, heights: number[]): CabinetLayout {
  const tiers = getTierSpecs(layout);
  if (tiers.length === 0 || heights.length !== tiers.length) return layout;
  return withTierSpecs(
    tiers.map((tier, index) => ({
      ...tier,
      heightRatio: Math.max(0.0001, heights[index] ?? tier.heightRatio),
    }))
  );
}

export function splitSection(layout: CabinetLayout, sectionId: string, splitRatio = 0.5, tierId?: string): { layout: CabinetLayout; partition: CabinetPartitionSpec } {
  const tiers = getTierSpecs(layout);
  const tierIndex = tierId ? tiers.findIndex((tier) => tier.id === tierId) : findTierIndexBySectionId(layout, sectionId);
  if (tierIndex < 0) return splitSectionInHorizontalLayout(toHorizontalLayout(layout), sectionId, splitRatio) as { layout: CabinetLayout; partition: CabinetPartitionSpec };
  const updatedTier = splitSectionInHorizontalLayout(tiers[tierIndex]!.layout, sectionId, splitRatio);
  const nextTiers = tiers.map((tier, index) => index === tierIndex ? { ...tier, layout: updatedTier.layout } : tier);
  return { layout: withTierSpecs(nextTiers), partition: updatedTier.partition };
}

export function addShelfToSection(layout: CabinetLayout, sectionId: string, tierId?: string, zoneId?: string): { layout: CabinetLayout; shelf: CabinetShelfSpec } {
  const tiers = getTierSpecs(layout);
  const tierIndex = tierId ? tiers.findIndex((tier) => tier.id === tierId) : findTierIndexBySectionId(layout, sectionId);
  if (tierIndex < 0) {
    const updated = addShelfToHorizontalSection(toHorizontalLayout(layout), sectionId, zoneId);
    return { layout: withTierSpecs([{ id: ROOT_TIER_ID, heightRatio: 1, layout: updated.layout }]), shelf: updated.shelf };
  }
  const updatedTier = addShelfToHorizontalSection(tiers[tierIndex]!.layout, sectionId, zoneId);
  const nextTiers = tiers.map((tier, index) => index === tierIndex ? { ...tier, layout: updatedTier.layout } : tier);
  return { layout: withTierSpecs(nextTiers), shelf: updatedTier.shelf };
}

export function updateSectionTierDividerPosition(layout: CabinetLayout, dividerId: string, nextPositionRatio: number): CabinetLayout {
  const tierIndex = findTierIndexBySectionTierDividerId(layout, dividerId);
  if (tierIndex < 0) return layout;
  const tiers = getTierSpecs(layout);
  const nextTiers = tiers.map((tier, index) => index === tierIndex
    ? { ...tier, layout: updateSectionTierDividerPositionInHorizontalLayout(tier.layout, dividerId, nextPositionRatio) }
    : tier);
  return withTierSpecs(nextTiers);
}

export function removeShelf(layout: CabinetLayout, shelfId: string): CabinetLayout {
  const tierIndex = findTierIndexByShelfId(layout, shelfId);
  if (tierIndex < 0) return layout;
  const tiers = getTierSpecs(layout);
  const nextTiers = tiers.map((tier, index) => index === tierIndex ? { ...tier, layout: removeShelfInHorizontalLayout(tier.layout, shelfId) } : tier);
  return withTierSpecs(nextTiers);
}

export function setShelfElevations(layout: CabinetLayout, elevations: Map<string, number>): CabinetLayout {
  if (elevations.size === 0) return layout;
  const tiers = getTierSpecs(layout);
  const nextTiers = tiers.map((tier) => ({
    ...tier,
    layout: {
      ...tier.layout,
      shelves: tier.layout.shelves.map((shelf) => elevations.has(shelf.id) ? { ...shelf, elevation: elevations.get(shelf.id) } : shelf),
    },
  }));
  return withTierSpecs(nextTiers);
}

export function setShelfApron(layout: CabinetLayout, shelfId: string, withApron: boolean): CabinetLayout {
  const tiers = getTierSpecs(layout);
  const nextTiers = tiers.map((tier) => ({
    ...tier,
    layout: {
      ...tier.layout,
      shelves: tier.layout.shelves.map((shelf) => shelf.id === shelfId ? { ...shelf, withApron } : shelf),
    },
  }));
  return withTierSpecs(nextTiers);
}

export function updateAllFronts(layout: CabinetLayout, update: (fronts: CabinetFrontSpec[], tierId: string) => CabinetFrontSpec[]): CabinetLayout {
  return withTierSpecs(getTierSpecs(layout).map((tier) => ({ ...tier, layout: { ...tier.layout, fronts: update(tier.layout.fronts ?? [], tier.id) } })));
}

export function updateTierFronts(layout: CabinetLayout, tierId: string, update: (fronts: CabinetFrontSpec[]) => CabinetFrontSpec[]): CabinetLayout {
  return updateAllFronts(layout, (fronts, id) => (id === tierId ? update(fronts) : fronts));
}

export function removeDrawerStack(layout: CabinetLayout, drawerId: string): CabinetLayout {
  const tierIndex = findTierIndexByDrawerId(layout, drawerId);
  if (tierIndex < 0) return layout;
  const tiers = getTierSpecs(layout);
  const nextTiers = tiers.map((tier, index) => {
    if (index !== tierIndex) return tier;
    const target = tier.layout.drawers?.find((drawer) => drawer.id === drawerId);
    return {
      ...tier,
      layout: {
        ...tier.layout,
        drawers: tier.layout.drawers?.filter((drawer) => drawer.id !== drawerId),
        // A drawer block takes its dividers with it.
        tierDividers: target?.block
          ? tier.layout.tierDividers?.filter((divider) => divider.id !== target.block!.dividerId && divider.id !== target.block!.baseDividerId)
          : tier.layout.tierDividers,
      },
    };
  });
  return withTierSpecs(nextTiers);
}

export function removeSectionTierDivider(layout: CabinetLayout, dividerId: string): CabinetLayout {
  const tierIndex = findTierIndexBySectionTierDividerId(layout, dividerId);
  if (tierIndex < 0) return layout;
  const tiers = getTierSpecs(layout);
  const nextTiers = tiers.map((tier, index) => {
    if (index !== tierIndex) return tier;
    const removed = removeSectionTierDividerInHorizontalLayout(tier.layout, dividerId);
    // Removing a drawer block's inner divider removes the block; removing its base divider only drops the niche.
    const drawers = removed.drawers
      ?.filter((drawer) => drawer.block?.dividerId !== dividerId)
      .map((drawer) => drawer.block?.baseDividerId === dividerId
        ? { ...drawer, block: { ...drawer.block, baseDividerId: undefined, offset: 0 } }
        : drawer);
    return { ...tier, layout: { ...removed, drawers } };
  });
  return withTierSpecs(nextTiers);
}

/** Adds or updates the drawer block at one end of a section; null when its dividers would exceed the section limit. */
export function upsertDrawerBlockInSection(
  layout: CabinetLayout,
  sectionId: string,
  tierId: string | undefined,
  input: DrawerBlockInput
): { layout: CabinetLayout; drawerStack: CabinetDrawerStackSpec | null } {
  const tiers = getTierSpecs(layout);
  const tierIndex = tierId ? tiers.findIndex((tier) => tier.id === tierId) : findTierIndexBySectionId(layout, sectionId);
  if (tierIndex < 0) return { layout, drawerStack: null };
  const tierLayout = tiers[tierIndex]!.layout;
  const existing = tierLayout.drawers?.find((drawer) => drawer.sectionId === sectionId && drawer.block?.anchor === input.anchor);
  const sectionDividerIds = new Set((tierLayout.tierDividers ?? []).filter((divider) => divider.sectionId === sectionId).map((divider) => divider.id));
  const keep = (id?: string) => (id && sectionDividerIds.has(id) ? id : undefined);
  const offset = Math.max(0, Math.round(input.offset));
  const dividerId = keep(existing?.block?.dividerId) ?? createId('section-tier-divider');
  const baseDividerId = offset > 0 ? keep(existing?.block?.baseDividerId) ?? createId('section-tier-divider') : undefined;
  const staleBaseDividerId = offset > 0 ? undefined : keep(existing?.block?.baseDividerId);
  const otherDividerCount = [...sectionDividerIds].filter((id) => id !== dividerId && id !== baseDividerId && id !== staleBaseDividerId).length;
  if (otherDividerCount + (baseDividerId ? 2 : 1) > MAX_SECTION_TIER_DIVIDERS) return { layout, drawerStack: null };
  // Ratios only order the dividers; the builder places a block's dividers from its offset and height.
  const ensureDivider = (list: CabinetSectionTierDividerSpec[], id: string, positionRatio: number) => (
    list.some((divider) => divider.id === id) ? list : [...list, { id, sectionId, positionRatio }]
  );
  let tierDividers = (tierLayout.tierDividers ?? []).filter((divider) => divider.id !== staleBaseDividerId);
  tierDividers = ensureDivider(tierDividers, dividerId, input.anchor === 'bottom' ? 0.01 : 0.99);
  if (baseDividerId) tierDividers = ensureDivider(tierDividers, baseDividerId, input.anchor === 'bottom' ? 0 : 1);
  const drawerStack: CabinetDrawerStackSpec = {
    ...(existing ?? { id: createId('drawer-stack'), sectionId }),
    zoneId: undefined,
    drawerCount: Math.max(1, Math.round(input.drawerCount)),
    runnerType: input.runnerType,
    runnerLength: input.runnerLength,
    runnerLengthMode: input.runnerLengthMode,
    block: {
      anchor: input.anchor,
      dividerId,
      baseDividerId,
      offset,
      slotHeight: Math.max(MIN_DRAWER_SLOT_HEIGHT, Math.round(input.slotHeight)),
      columns: Math.max(1, Math.min(MAX_DRAWER_BLOCK_COLUMNS, Math.round(input.columns))),
      withBackPanel: input.withBackPanel,
      fill: Boolean(input.fill),
      ...(input.recess ? { recess: Math.max(0, Math.round(input.recess)) } : {}),
      ...(input.falsePanel ? { falsePanel: { side: input.falsePanel.side, gap: Math.max(0, Math.round(input.falsePanel.gap)) } } : {}),
    },
  };
  const nextTierLayout: HorizontalCabinetLayout = {
    ...tierLayout,
    tierDividers,
    drawers: [
      ...(tierLayout.drawers ?? []).filter((drawer) => drawer.id !== drawerStack.id),
      drawerStack,
    ],
  };
  return { layout: withTierSpecs(tiers.map((tier, index) => index === tierIndex ? { ...tier, layout: nextTierLayout } : tier)), drawerStack };
}

export function updateDrawerBlock(layout: CabinetLayout, drawerId: string, patch: Partial<Pick<CabinetDrawerBlockSpec, 'columns' | 'slotHeight' | 'withBackPanel' | 'offset' | 'fill' | 'falsePanel' | 'recess'>>): CabinetLayout {
  const tierIndex = findTierIndexByDrawerId(layout, drawerId);
  if (tierIndex < 0) return layout;
  const tiers = getTierSpecs(layout);
  const nextTiers = tiers.map((tier, index) => index === tierIndex
    ? {
        ...tier,
        layout: {
          ...tier.layout,
          drawers: tier.layout.drawers?.map((drawer) => drawer.id === drawerId && drawer.block
            ? {
                ...drawer,
                block: {
                  ...drawer.block,
                  ...patch,
                  columns: Math.max(1, Math.min(MAX_DRAWER_BLOCK_COLUMNS, Math.round(patch.columns ?? drawer.block.columns))),
                  slotHeight: Math.max(MIN_DRAWER_SLOT_HEIGHT, Math.round(patch.slotHeight ?? drawer.block.slotHeight)),
                  // A niche that has its own divider can't collapse to nothing.
                  offset: patch.offset !== undefined
                    ? Math.max(drawer.block.baseDividerId ? 20 : 0, Math.round(patch.offset))
                    : drawer.block.offset,
                },
              }
            : drawer),
        },
      }
    : tier);
  return withTierSpecs(nextTiers);
}

export function setDrawerStackInnerFrontPanel(layout: CabinetLayout, drawerId: string, enabled: boolean): CabinetLayout {
  const tierIndex = findTierIndexByDrawerId(layout, drawerId);
  if (tierIndex < 0) return layout;
  const tiers = getTierSpecs(layout);
  const nextTiers = tiers.map((tier, index) => index === tierIndex
    ? {
        ...tier,
        layout: {
          ...tier.layout,
          drawers: tier.layout.drawers?.map((drawer) => drawer.id === drawerId ? { ...drawer, withInnerFrontPanel: enabled } : drawer),
        },
      }
    : tier);
  return withTierSpecs(nextTiers);
}

export function removePartition(layout: CabinetLayout, partitionId: string): CabinetLayout {
  const tierIndex = findTierIndexByPartitionId(layout, partitionId);
  if (tierIndex < 0) return layout;
  const tiers = getTierSpecs(layout);
  const nextTiers = tiers.map((tier, index) => index === tierIndex ? { ...tier, layout: removePartitionInHorizontalLayout(tier.layout, partitionId) } : tier);
  return withTierSpecs(nextTiers);
}

export function setLeafSectionWidths(layout: CabinetLayout, widths: number[], innerWidth: number, sectionId?: string, tierId?: string, pinnedIndex?: number, thickness = 0): CabinetLayout {
  const tiers = getTierSpecs(layout);
  const tierIndex = tierId ? tiers.findIndex((tier) => tier.id === tierId) : sectionId ? findTierIndexBySectionId(layout, sectionId) : 0;
  if (tierIndex < 0) return layout;
  const nextTiers = tiers.map((tier, index) => index === tierIndex ? { ...tier, layout: setLeafSectionWidthsInHorizontalLayout(tier.layout, widths, innerWidth, pinnedIndex, thickness) } : tier);
  return withTierSpecs(nextTiers);
}
