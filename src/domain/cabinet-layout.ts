import { createId } from '../shared/ids';

export type HorizontalCabinetLayout = {
  partitions: CabinetPartitionSpec[];
  shelves: CabinetShelfSpec[];
  drawers?: CabinetDrawerStackSpec[];
  tierDividers?: CabinetSectionTierDividerSpec[];
  sectionWidths?: number[];
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
};

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
    tiers,
  };
}

function getTierSpecs(layout: CabinetLayout): CabinetTierSpec[] {
  return layout.tiers?.length
    ? layout.tiers
    : [{ id: ROOT_TIER_ID, heightRatio: 1, layout: toHorizontalLayout(layout) }];
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
    })),
    drawers: layout.drawers?.map((drawer) => ({
      ...drawer,
      id: createId('drawer-stack'),
      sectionId: sectionIdMap.get(drawer.sectionId) ?? drawer.sectionId,
    })),
    tierDividers: layout.tierDividers?.map((divider) => ({
      ...divider,
      id: createId('section-tier-divider'),
      sectionId: sectionIdMap.get(divider.sectionId) ?? divider.sectionId,
    })),
    sectionWidths: layout.sectionWidths ? [...layout.sectionWidths] : undefined,
  };
}

function clampLocalTierDividerRatio(value: number) {
  return Math.max(MIN_LOCAL_TIER_DIVIDER_RATIO, Math.min(1 - MIN_LOCAL_TIER_DIVIDER_RATIO, value));
}

function rebalanceSectionTierDividers(dividers: CabinetSectionTierDividerSpec[]) {
  if (dividers.length <= 0) return [];
  const ordered = [...dividers].sort((a, b) => a.positionRatio - b.positionRatio);
  return ordered.map((divider, index) => ({
    ...divider,
    positionRatio: (index + 1) / (ordered.length + 1),
  }));
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
      layout = splitSection(layout, target.id, splitRatio).layout;
    });
  }

  if (shelfCount > 0) {
    const resolved = resolveCabinetLayout(layout, 1000);
    const leaves = resolved.leafSections;
    for (let idx = 0; idx < shelfCount; idx += 1) {
      const section = leaves[idx % Math.max(leaves.length, 1)];
      if (!section) break;
      layout = addShelfToSection(layout, section.id).layout;
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
    sectionWidths: layout.sectionWidths,
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
  const shelf: CabinetShelfSpec = { id: createId('shelf'), sectionId, zoneId };
  const hasSectionTierDivider = (layout.tierDividers?.some((divider) => divider.sectionId === sectionId)) ?? false;
  return {
    layout: {
      ...layout,
      shelves: [...layout.shelves, shelf],
      drawers: hasSectionTierDivider
        ? layout.drawers
        : layout.drawers?.filter((drawer) => drawer.sectionId !== sectionId),
    },
    shelf,
  };
}

function addSectionTierDividerToHorizontalSection(layout: HorizontalCabinetLayout, sectionId: string): { layout: HorizontalCabinetLayout; divider: CabinetSectionTierDividerSpec } {
  const existing = layout.tierDividers?.filter((divider) => divider.sectionId === sectionId) ?? [];
  if (existing.length >= 2) {
    return { layout, divider: existing[existing.length - 1]! };
  }
  const divider: CabinetSectionTierDividerSpec = { id: createId('section-tier-divider'), sectionId, positionRatio: 0.5 };
  const nextSectionDividers = rebalanceSectionTierDividers([...existing, divider]);
  const nextSectionDividerById = new Map(nextSectionDividers.map((item) => [item.id, item]));
  return {
    layout: {
      ...layout,
      drawers: layout.drawers?.filter((drawer) => drawer.sectionId !== sectionId),
      tierDividers: [
        ...((layout.tierDividers ?? []).filter((item) => item.sectionId !== sectionId)),
        ...nextSectionDividers,
      ],
    },
    divider: nextSectionDividerById.get(divider.id) ?? divider,
  };
}

function upsertDrawerStackInHorizontalSection(
  layout: HorizontalCabinetLayout,
  sectionId: string,
  zoneId: string | undefined,
  drawerCount: number,
  runnerType: DrawerRunnerType,
  runnerLength: DrawerRunnerLength,
  runnerLengthMode: DrawerRunnerLengthMode = 'manual'
): { layout: HorizontalCabinetLayout; drawerStack: CabinetDrawerStackSpec | null } {
  const hasSectionTierDivider = (layout.tierDividers?.some((divider) => divider.sectionId === sectionId)) ?? false;
  if (drawerCount <= 0) {
    return {
      layout: {
        ...layout,
        drawers: layout.drawers?.filter((drawer) => (
          hasSectionTierDivider
            ? !(drawer.sectionId === sectionId && (drawer.zoneId ?? '') === (zoneId ?? ''))
            : drawer.sectionId !== sectionId
        )),
      },
      drawerStack: null,
    };
  }

  const existingDrawer = layout.drawers?.find((drawer) => (
    hasSectionTierDivider
      ? drawer.sectionId === sectionId && (drawer.zoneId ?? '') === (zoneId ?? '')
      : drawer.sectionId === sectionId
  ));
  const drawerStack: CabinetDrawerStackSpec = existingDrawer
    ? { ...existingDrawer, drawerCount: Math.max(1, Math.round(drawerCount)), runnerType, runnerLength, runnerLengthMode, zoneId }
    : { id: createId('drawer-stack'), sectionId, zoneId, drawerCount: Math.max(1, Math.round(drawerCount)), runnerType, runnerLength, runnerLengthMode };

  return {
    layout: {
      ...layout,
      shelves: hasSectionTierDivider
        ? layout.shelves
        : layout.shelves.filter((shelf) => shelf.sectionId !== sectionId),
      tierDividers: layout.tierDividers,
      drawers: [
        ...(layout.drawers ?? []).filter((drawer) => (
          hasSectionTierDivider
            ? !(drawer.sectionId === sectionId && (drawer.zoneId ?? '') === (zoneId ?? ''))
            : drawer.sectionId !== sectionId
        )),
        drawerStack,
      ],
    },
      drawerStack,
    };
}

function removeShelfInHorizontalLayout(layout: HorizontalCabinetLayout, shelfId: string): HorizontalCabinetLayout {
  return {
    ...layout,
    shelves: layout.shelves.filter((shelf) => shelf.id !== shelfId),
  };
}

function removeSectionTierDividerInHorizontalLayout(layout: HorizontalCabinetLayout, dividerId: string): HorizontalCabinetLayout {
  const target = layout.tierDividers?.find((divider) => divider.id === dividerId);
  if (!target) return layout;
  const nextSectionDividers = rebalanceSectionTierDividers(
    (layout.tierDividers ?? []).filter((divider) => divider.sectionId === target.sectionId && divider.id !== dividerId)
  );
  return {
    ...layout,
    tierDividers: [
      ...((layout.tierDividers ?? []).filter((divider) => divider.sectionId !== target.sectionId && divider.id !== dividerId)),
      ...nextSectionDividers,
    ],
  };
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
  const nextDrawers = new Map<string, CabinetDrawerStackSpec>();
  layout.drawers?.forEach((drawer) => {
    const nextSectionId = subtree.descendantLeaves.has(drawer.sectionId)
      ? subtree.target.parentSectionId
      : drawer.sectionId;
    if (!nextDrawers.has(nextSectionId)) {
      nextDrawers.set(nextSectionId, { ...drawer, sectionId: nextSectionId });
    }
  });
  const nextLayoutBase: CabinetLayout = {
    partitions: nextPartitions,
    shelves: layout.shelves.map((shelf) => (
      subtree.descendantLeaves.has(shelf.sectionId)
        ? { ...shelf, sectionId: subtree.target.parentSectionId }
        : shelf
    )),
    drawers: [...nextDrawers.values()],
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

function setLeafSectionWidthsInHorizontalLayout(layout: HorizontalCabinetLayout, widths: number[], innerWidth: number): HorizontalCabinetLayout {
  const leafOrder = collectLeafOrder(layout);
  if (leafOrder.length === 0 || widths.length !== leafOrder.length) return layout;
  return {
    ...layout,
    sectionWidths: normalizeSectionWidths(widths, innerWidth),
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

export function addSectionTierDividerToSection(layout: CabinetLayout, sectionId: string, tierId?: string): { layout: CabinetLayout; divider: CabinetSectionTierDividerSpec } {
  const tiers = getTierSpecs(layout);
  const tierIndex = tierId ? tiers.findIndex((tier) => tier.id === tierId) : findTierIndexBySectionId(layout, sectionId);
  if (tierIndex < 0) {
    const updated = addSectionTierDividerToHorizontalSection(toHorizontalLayout(layout), sectionId);
    return { layout: withTierSpecs([{ id: ROOT_TIER_ID, heightRatio: 1, layout: updated.layout }]), divider: updated.divider };
  }
  const updatedTier = addSectionTierDividerToHorizontalSection(tiers[tierIndex]!.layout, sectionId);
  const nextTiers = tiers.map((tier, index) => index === tierIndex ? { ...tier, layout: updatedTier.layout } : tier);
  return { layout: withTierSpecs(nextTiers), divider: updatedTier.divider };
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

export function upsertDrawerStackInSection(
  layout: CabinetLayout,
  sectionId: string,
  drawerCount: number,
  runnerType: DrawerRunnerType,
  runnerLength: DrawerRunnerLength,
  tierId?: string,
  zoneId?: string,
  runnerLengthMode: DrawerRunnerLengthMode = 'manual'
): { layout: CabinetLayout; drawerStack: CabinetDrawerStackSpec | null } {
  const tiers = getTierSpecs(layout);
  const tierIndex = tierId ? tiers.findIndex((tier) => tier.id === tierId) : findTierIndexBySectionId(layout, sectionId);
  if (tierIndex < 0) {
    const updated = upsertDrawerStackInHorizontalSection(toHorizontalLayout(layout), sectionId, zoneId, drawerCount, runnerType, runnerLength, runnerLengthMode);
    return { layout: withTierSpecs([{ id: ROOT_TIER_ID, heightRatio: 1, layout: updated.layout }]), drawerStack: updated.drawerStack };
  }
  const updatedTier = upsertDrawerStackInHorizontalSection(tiers[tierIndex]!.layout, sectionId, zoneId, drawerCount, runnerType, runnerLength, runnerLengthMode);
  const nextTiers = tiers.map((tier, index) => index === tierIndex ? { ...tier, layout: updatedTier.layout } : tier);
  return { layout: withTierSpecs(nextTiers), drawerStack: updatedTier.drawerStack };
}

export function removeShelf(layout: CabinetLayout, shelfId: string): CabinetLayout {
  const tierIndex = findTierIndexByShelfId(layout, shelfId);
  if (tierIndex < 0) return layout;
  const tiers = getTierSpecs(layout);
  const nextTiers = tiers.map((tier, index) => index === tierIndex ? { ...tier, layout: removeShelfInHorizontalLayout(tier.layout, shelfId) } : tier);
  return withTierSpecs(nextTiers);
}

export function removeDrawerStack(layout: CabinetLayout, drawerId: string): CabinetLayout {
  const tierIndex = findTierIndexByDrawerId(layout, drawerId);
  if (tierIndex < 0) return layout;
  const tiers = getTierSpecs(layout);
  const nextTiers = tiers.map((tier, index) => index === tierIndex ? { ...tier, layout: { ...tier.layout, drawers: tier.layout.drawers?.filter((drawer) => drawer.id !== drawerId) } } : tier);
  return withTierSpecs(nextTiers);
}

export function removeSectionTierDivider(layout: CabinetLayout, dividerId: string): CabinetLayout {
  const tierIndex = findTierIndexBySectionTierDividerId(layout, dividerId);
  if (tierIndex < 0) return layout;
  const tiers = getTierSpecs(layout);
  const nextTiers = tiers.map((tier, index) => index === tierIndex ? { ...tier, layout: removeSectionTierDividerInHorizontalLayout(tier.layout, dividerId) } : tier);
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

export function setLeafSectionWidths(layout: CabinetLayout, widths: number[], innerWidth: number, sectionId?: string, tierId?: string): CabinetLayout {
  const tiers = getTierSpecs(layout);
  const tierIndex = tierId ? tiers.findIndex((tier) => tier.id === tierId) : sectionId ? findTierIndexBySectionId(layout, sectionId) : 0;
  if (tierIndex < 0) return layout;
  const nextTiers = tiers.map((tier, index) => index === tierIndex ? { ...tier, layout: setLeafSectionWidthsInHorizontalLayout(tier.layout, widths, innerWidth) } : tier);
  return withTierSpecs(nextTiers);
}
