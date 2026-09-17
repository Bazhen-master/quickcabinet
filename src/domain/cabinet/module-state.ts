// Состояние модуля по деталям, перестроение группы и правки раскладки секций.
import type { Part } from '../part';
import { createCabinetLayout, getCabinetTierSpecs, addShelfToSection, splitSection, resolveCabinetTierLayouts, setLeafSectionWidths, updateAllFronts, removeShelf, removePartition, removeSectionTierDivider, updateDrawerBlock, setDrawerStackInnerFrontPanel, removeDrawerStack, setCabinetTierHeights, updateSectionTierDividerPosition } from '../cabinet-layout';
import { type AutoJointRuleDraft, applyGeneratedJoinery } from '../auto-drilling';
import { makeSectionBackPanelKey, parseSectionBackPanelKey } from './back-panel';
import { buildSimpleCabinet } from './build';
import { getBackInset, getBodyBaseY, getCabinetInnerHeight, getCabinetInnerWidth, getCabinetOptionsCarrier, getInnerDepth, getLayoutCarrier, mergeExistingAndBuiltOperations, resolveTopMode } from './common';
import { DEFAULT_PLINTH_HEIGHT, DEFAULT_TOP_RAIL_HEIGHT, NAME_SEP } from './constants';
import { getResolvedTierHeights, getTierVerticalFrames } from './frames';
import { getFrontSpecId } from './fronts';
import type { CabinetFrontMode, CabinetModuleState, CabinetTopMode } from './types';

const moduleStateCache = new WeakMap<Part[], Map<string, CabinetModuleState | null>>();

/**
 * Cached per parts array: the scene, inspector and store ask for the same module many times per render,
 * and every project change produces a new parts array. The result is shared — never mutate it.
 */
export function getCabinetModuleState(parts: Part[], groupId: string): CabinetModuleState | null {
  let byGroup = moduleStateCache.get(parts);
  if (!byGroup) {
    byGroup = new Map();
    moduleStateCache.set(parts, byGroup);
  }
  if (!byGroup.has(groupId)) byGroup.set(groupId, computeCabinetModuleState(parts, groupId));
  return byGroup.get(groupId) ?? null;
}

function computeCabinetModuleState(parts: Part[], groupId: string): CabinetModuleState | null {
  const group = parts.filter((part) => part.meta?.groupId === groupId);
  if (group.length === 0) return null;
  const left = group.find((part) => part.meta?.role === 'left-side');
  const right = group.find((part) => part.meta?.role === 'right-side');
  const top = group.find((part) => part.meta?.role === 'top');
  const bottom = group.find((part) => part.meta?.role === 'bottom');
  if (!left || !right || !top || !bottom) return null;

  const groupBounds = group.reduce((acc, part) => ({
    minY: Math.min(acc.minY, part.position.y - part.height / 2),
    maxY: Math.max(acc.maxY, part.position.y + part.height / 2),
    minX: Math.min(acc.minX, part.position.x - part.width / 2),
    maxX: Math.max(acc.maxX, part.position.x + part.width / 2),
  }), { minY: Number.POSITIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY, minX: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY });

  const width = Math.abs(right.position.x - left.position.x) + left.width;
  const height = groupBounds.maxY - groupBounds.minY;
  const sectionBackPanels = group
    .filter((part) => part.meta?.role === 'back-panel')
    .flatMap((part) => {
      const item = parseSectionBackPanelKey(part.meta?.sourceId);
      return item ? [makeSectionBackPanelKey(item.tierId, item.sectionId, item.zoneId)] : [];
    });
  const hasBack = group.some((part) => part.meta?.role === 'back-panel' && !parseSectionBackPanelKey(part.meta?.sourceId));
  // Sides carry the carcass depth (a top over the fronts is deeper).
  const depth = left.thickness;
  const thickness = left.width;
  const innerWidth = Math.max(50, width - thickness * 2);
  const carrierBackPanelKind = getCabinetOptionsCarrier(group)?.meta?.cabinetOptions?.backPanelKind ?? 'panel';
  // Only the width tells the modes apart: the top runs the full depth either way (into the HDF groove too).
  const detectedTopMode: CabinetTopMode = top.width > innerWidth + 0.001 ? 'overlay' : 'inset';
  const plinthFront = group.find((part) => part.meta?.role === 'plinth-front') ?? null;
  const topRailFront = group.find((part) => part.meta?.role === 'top-rail-front') ?? null;
  const apronPart = group.find((part) => part.meta?.role === 'apron') ?? null;
  const layout = getLayoutCarrier(group)?.meta?.cabinetLayout
    ?? createCabinetLayout(
      group.filter((part) => part.meta?.role === 'partition').length,
      group.filter((part) => part.meta?.role === 'shelf').length
    );
  const carrierOptions = getCabinetOptionsCarrier(group)?.meta?.cabinetOptions;
  const position = {
    x: (left.position.x + right.position.x) / 2,
    y: groupBounds.minY,
    z: left.position.z,
  };
  const frontModeFromGeometry: CabinetFrontMode = (() => {
    const front = group.find((part) => part.meta?.role === 'front-left' || part.meta?.role === 'front-right') ?? null;
    if (!front) return 'inset';
    return front.position.z <= position.z + depth / 2 ? 'inset' : 'overlay';
  })();
  const options = {
    withPlinth: carrierOptions?.withPlinth ?? Boolean(plinthFront),
    plinthHeight: carrierOptions?.plinthHeight ?? plinthFront?.height ?? DEFAULT_PLINTH_HEIGHT,
    plinthKind: carrierOptions?.plinthKind ?? 'frame',
    backRailElevations: carrierOptions?.backRailElevations ?? [],
    withTopRails: carrierOptions?.withTopRails ?? Boolean(topRailFront),
    topRailHeight: carrierOptions?.topRailHeight ?? topRailFront?.height ?? DEFAULT_TOP_RAIL_HEIGHT,
    withAprons: carrierOptions?.withAprons ?? Boolean(apronPart),
    topOverFronts: carrierOptions?.topOverFronts ?? false,
    withTierDivider: carrierOptions?.withTierDivider ?? group.some((part) => part.meta?.role === 'tier-divider'),
    tierCount: carrierOptions?.tierCount ?? Math.max(1, getCabinetTierSpecs(layout).length),
    tierHeight: carrierOptions?.tierHeight ?? 0,
    backPanelSections: carrierOptions?.backPanelSections ?? sectionBackPanels,
    backPanelKind: carrierBackPanelKind,
    withHangers: carrierOptions?.withHangers ?? false,
    frontMode: carrierOptions?.frontMode ?? frontModeFromGeometry,
    frontOpeningMode: carrierOptions?.frontOpeningMode ?? 'handleless',
  };
  const normalizedOptions = options;
  const name = left.name.split(NAME_SEP)[0] ?? 'Cabinet';
  const tierSpecs = getCabinetTierSpecs(layout);
  const tierHeights = getResolvedTierHeights({
    layout,
    height,
    thickness,
    withPlinth: normalizedOptions.withPlinth,
    plinthHeight: normalizedOptions.plinthHeight,
    withTopRails: normalizedOptions.withTopRails,
    topRailHeight: normalizedOptions.topRailHeight,
  });
  const shelfCount = tierSpecs.reduce((sum, tier) => sum + tier.layout.shelves.length, 0);
  const partitionCount = tierSpecs.reduce((sum, tier) => sum + tier.layout.partitions.length, 0);

  return {
    groupId,
    name,
    width,
    height,
    depth,
    thickness,
    shelfCount,
    partitionCount,
    withBackPanel: hasBack,
    backPanelKind: normalizedOptions.backPanelKind,
    withHangers: normalizedOptions.withHangers,
    frontMode: normalizedOptions.frontMode,
    frontOpeningMode: normalizedOptions.frontOpeningMode,
    topMode: resolveTopMode(detectedTopMode, normalizedOptions.withTopRails),
    withPlinth: normalizedOptions.withPlinth,
    plinthHeight: normalizedOptions.plinthHeight,
    plinthKind: normalizedOptions.plinthKind,
    backRailElevations: normalizedOptions.backRailElevations,
    withTopRails: normalizedOptions.withTopRails,
    topRailHeight: normalizedOptions.topRailHeight,
    withAprons: normalizedOptions.withAprons,
    topOverFronts: normalizedOptions.topOverFronts,
    withTierDivider: normalizedOptions.withTierDivider,
    tierCount: normalizedOptions.tierCount,
    tierHeight: tierHeights.heights[0] ?? Math.round(tierHeights.clearTotal / Math.max(1, tierSpecs.length)),
    backPanelSections: normalizedOptions.backPanelSections,
    position,
    layout,
  };
}

export function rebuildCabinetGroup(parts: Part[], groupId: string, draft: Omit<CabinetModuleState, 'groupId'>, rules?: AutoJointRuleDraft): Part[] {
  const rebuilt = buildSimpleCabinet({ ...draft, groupId, layout: draft.layout });
  const existingGroup = parts.filter((part) => part.meta?.groupId === groupId);
  // Parts keep their old ids below, while id references in meta were written with the fresh build's ids.
  const keptIdByBuiltId = new Map<string, string>();
  const merged = rebuilt.map((part) => {
    const existing = existingGroup.find((item) =>
      part.meta?.sourceId
        ? item.meta?.sourceId === part.meta.sourceId && item.meta?.role === part.meta?.role
        : item.meta?.role === part.meta?.role
    );
    const nextMeta = existing
      ? {
          ...existing.meta,
          ...part.meta,
          // Joinery the user picked survives rebuilds; the builder's value is only the default for new parts.
          joinery: existing.meta?.joinery ?? part.meta?.joinery,
          // Fronts are rebuilt from their spec, so the built hinge side wins.
          hingeEdge: part.meta?.hingeEdge ?? existing.meta?.hingeEdge,
        }
      : part.meta;
    if (existing) keptIdByBuiltId.set(part.id, existing.id);
    return existing
      ? {
          ...part,
          id: existing.id,
          operations: mergeExistingAndBuiltOperations(existing.operations, part.operations),
          meta: nextMeta,
        }
      : part;
  });
  const followKeptId = (id?: string) => (id ? keptIdByBuiltId.get(id) ?? id : id);
  const remapped = merged.map((part) => (
    part.meta?.leftSupportPartId || part.meta?.rightSupportPartId
      ? { ...part, meta: { ...part.meta, leftSupportPartId: followKeptId(part.meta.leftSupportPartId), rightSupportPartId: followKeptId(part.meta.rightSupportPartId) } }
      : part
  ));
  // The single auto-joinery pass for a rebuilt cabinet.
  return applyGeneratedJoinery(remapped, rules);
}

export function replaceGroupParts(parts: Part[], groupId: string, replacement: Part[]): Part[] {
  return [...parts.filter((part) => part.meta?.groupId !== groupId), ...replacement];
}

export function addShelfToLayoutSection(module: CabinetModuleState, sectionId: string, tierId?: string, zoneId?: string) {
  return addShelfToSection(module.layout, sectionId, tierId, zoneId);
}

export function addPartitionToLayoutSection(module: CabinetModuleState, sectionId: string, tierId?: string) {
  const split = splitSection(module.layout, sectionId, 0.5, tierId);
  const resolvedTiers = resolveCabinetTierLayouts(split.layout, getCabinetInnerWidth(module), module.thickness);
  const targetTier = tierId
    ? resolvedTiers.find((tier) => tier.tierId === tierId) ?? null
    : resolvedTiers.find((tier) => tier.resolved.leafSections.some((section) => section.id === split.partition.leftSectionId || section.id === split.partition.rightSectionId)) ?? null;
  if (!targetTier) return split;
  const leafCount = targetTier.resolved.leafSections.length;
  if (leafCount <= 1) return split;
  const equalWidths = Array.from({ length: leafCount }, () => 1);
  return {
    partition: split.partition,
    layout: setLeafSectionWidths(split.layout, equalWidths, getCabinetInnerWidth(module), targetTier.resolved.leafSections[0]?.id, targetTier.tierId),
  };
}

export function removeCabinetElementFromLayout(module: CabinetModuleState, selectedPart: Part) {
  const frontId = getFrontSpecId(selectedPart);
  if (frontId) return updateAllFronts(module.layout, (fronts) => fronts.filter((spec) => spec.id !== frontId));
  if (selectedPart.meta?.role === 'shelf' && selectedPart.meta?.sourceId) {
    return removeShelf(module.layout, selectedPart.meta.sourceId);
  }
  if (selectedPart.meta?.role === 'partition' && selectedPart.meta?.sourceId) {
    return removePartition(module.layout, selectedPart.meta.sourceId);
  }
  if (selectedPart.meta?.role === 'tier-divider' && selectedPart.meta?.sourceId && !selectedPart.meta.sourceId.startsWith('tier-divider:')) {
    return removeSectionTierDivider(module.layout, selectedPart.meta.sourceId);
  }
  if (selectedPart.meta?.role === 'drawer-column' && selectedPart.meta?.sourceId) {
    const drawerStackId = selectedPart.meta.sourceId.split(':')[0] ?? '';
    const stack = getCabinetTierSpecs(module.layout).flatMap((tier) => tier.layout.drawers ?? []).find((drawer) => drawer.id === drawerStackId);
    return stack?.block ? updateDrawerBlock(module.layout, stack.id, { columns: stack.block.columns - 1 }) : module.layout;
  }
  if (selectedPart.meta?.role === 'drawer-inner-front' && selectedPart.meta?.sourceId) {
    const drawerStackId = selectedPart.meta.sourceId.split(':')[0] ?? '';
    return setDrawerStackInnerFrontPanel(module.layout, drawerStackId, false);
  }

  if ((selectedPart.meta?.role === 'drawer-front'
    || selectedPart.meta?.role === 'drawer-side-left'
    || selectedPart.meta?.role === 'drawer-side-right'
    || selectedPart.meta?.role === 'drawer-back'
    || selectedPart.meta?.role === 'drawer-bottom') && selectedPart.meta?.sourceId) {
    const drawerStackId = selectedPart.meta.sourceId.split(':')[0] ?? '';
    return removeDrawerStack(module.layout, drawerStackId);
  }
  return module.layout;
}

export function updateCabinetSectionWidths(module: CabinetModuleState, widths: number[], sectionId?: string, tierId?: string, pinnedIndex?: number) {
  return setLeafSectionWidths(module.layout, widths, getCabinetInnerWidth(module), sectionId, tierId, pinnedIndex, module.thickness);
}

export function updateCabinetTierHeight(module: CabinetModuleState, tierId: string, nextHeight: number) {
  const tiers = getCabinetTierSpecs(module.layout);
  const tierIndex = tiers.findIndex((tier) => tier.id === tierId);
  if (tierIndex < 0 || tiers.length < 2) return module.layout;

  const dividerCount = Math.max(0, tiers.length - 1);
  const totalClear = Math.max(50, getCabinetInnerHeight(module) - dividerCount * module.thickness);
  const ratioTotal = Math.max(0.0001, tiers.reduce((sum, tier) => sum + Math.max(0.0001, tier.heightRatio), 0));
  const currentHeights = tiers.map((tier) => totalClear * (Math.max(0.0001, tier.heightRatio) / ratioTotal));
  const minTierHeight = 50;
  const remainingTierCount = tiers.length - 1;
  const maxTargetHeight = Math.max(minTierHeight, totalClear - remainingTierCount * minTierHeight);
  const targetHeight = Math.max(minTierHeight, Math.min(maxTargetHeight, nextHeight));

  if (remainingTierCount <= 0) return setCabinetTierHeights(module.layout, [targetHeight]);

  const remainingCurrent = currentHeights.reduce((sum, height, index) => index === tierIndex ? sum : sum + height, 0);
  const remainingTarget = Math.max(remainingTierCount * minTierHeight, totalClear - targetHeight);

  let nextHeights = currentHeights.map((height, index) => {
    if (index === tierIndex) return targetHeight;
    if (remainingCurrent <= 0) return remainingTarget / remainingTierCount;
    return (height / remainingCurrent) * remainingTarget;
  });

  let deficit = 0;
  nextHeights = nextHeights.map((height, index) => {
    if (index === tierIndex) return height;
    if (height >= minTierHeight) return height;
    deficit += minTierHeight - height;
    return minTierHeight;
  });

  if (deficit > 0) {
    const adjustableIndexes = nextHeights
      .map((height, index) => ({ height, index }))
      .filter((item) => item.index !== tierIndex && item.height > minTierHeight + 0.001)
      .map((item) => item.index);
    const adjustableTotal = adjustableIndexes.reduce((sum, index) => sum + (nextHeights[index] - minTierHeight), 0);
    if (adjustableTotal > 0) {
      adjustableIndexes.forEach((index) => {
        const available = nextHeights[index] - minTierHeight;
        nextHeights[index] -= (available / adjustableTotal) * deficit;
      });
    }
  }

  return setCabinetTierHeights(module.layout, nextHeights);
}

export function updateTierDividerLayout(module: CabinetModuleState, dividerSourceId: string, nextCenterY: number) {
  const tiers = getCabinetTierSpecs(module.layout);
  if (tiers.length < 2) return module.layout;
  const dividerIndex = tiers.findIndex((tier) => `tier-divider:${tier.id}` === dividerSourceId);
  if (dividerIndex < 0 || dividerIndex >= tiers.length - 1) return module.layout;

  const dividerCount = Math.max(0, tiers.length - 1);
  const totalClear = Math.max(50, getCabinetInnerHeight(module) - dividerCount * module.thickness);
  const ratioTotal = Math.max(0.0001, tiers.reduce((sum, tier) => sum + Math.max(0.0001, tier.heightRatio), 0));
  const heights = tiers.map((tier) => totalClear * (Math.max(0.0001, tier.heightRatio) / ratioTotal));
  const pairTotal = (heights[dividerIndex] ?? 0) + (heights[dividerIndex + 1] ?? 0);
  const prefixHeight = heights.slice(0, dividerIndex).reduce((sum, value) => sum + value, 0);
  const bodyBaseY = getBodyBaseY(module.position.y, module);
  const cumulativeClear = bodyBaseY + module.thickness + totalClear - nextCenterY - module.thickness * (dividerIndex + 0.5);
  const nextUpperHeightRaw = cumulativeClear - prefixHeight;
  const minTierHeight = 50;
  const nextUpperHeight = Math.max(minTierHeight, Math.min(pairTotal - minTierHeight, nextUpperHeightRaw));
  const nextHeights = [...heights];
  nextHeights[dividerIndex] = nextUpperHeight;
  nextHeights[dividerIndex + 1] = pairTotal - nextUpperHeight;
  return setCabinetTierHeights(module.layout, nextHeights);
}

export function updateLocalTierDividerLayout(module: CabinetModuleState, dividerSourceId: string, nextCenterY: number) {
  const tierLayouts = resolveCabinetTierLayouts(module.layout, getCabinetInnerWidth(module), module.thickness);
  const bodyBaseY = getBodyBaseY(module.position.y, module);
  const frames = getTierVerticalFrames(module, bodyBaseY);

  for (let tierIndex = 0; tierIndex < tierLayouts.length; tierIndex += 1) {
    const tier = tierLayouts[tierIndex]!;
    const frame = frames.find((item) => item.tierId === tier.tierId) ?? frames[tierIndex];
    if (!frame) continue;
    const divider = [...tier.resolved.tierDividersBySection.values()]
      .flat()
      .find((item) => item.id === dividerSourceId);
    if (!divider) continue;

    // Dragging a drawer block's divider edits the block in mm instead of storing a ratio:
    // the base divider sets the niche offset, the inner divider the per-drawer height.
    const owner = (tier.resolved.drawersBySection.get(divider.sectionId) ?? [])
      .find((drawer) => drawer.block?.dividerId === divider.id || drawer.block?.baseDividerId === divider.id);
    if (owner?.block) {
      const th = module.thickness;
      const fromEdge = owner.block.anchor === 'bottom'
        ? nextCenterY - frame.startY - th / 2
        : frame.endY - nextCenterY - th / 2;
      if (owner.block.baseDividerId === divider.id) {
        return updateDrawerBlock(module.layout, owner.id, { offset: fromEdge });
      }
      const nicheSpan = owner.block.baseDividerId ? Math.max(0, owner.block.offset ?? 0) + th : 0;
      return updateDrawerBlock(module.layout, owner.id, { slotHeight: (fromEdge - nicheSpan) / Math.max(1, owner.drawerCount) });
    }
    const dividerCount = (tier.resolved.tierDividersBySection.get(divider.sectionId) ?? []).length;
    const clearSpan = Math.max(20, frame.clearHeight - dividerCount * module.thickness);
    const nextRatio = (nextCenterY - frame.startY - module.thickness / 2) / Math.max(clearSpan, 1);
    return updateSectionTierDividerPosition(module.layout, dividerSourceId, nextRatio);
  }

  return module.layout;
}
