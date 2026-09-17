// Вертикальная разметка корпуса: ярусы, делители, зоны секций и блоков ящиков.
import { type CabinetSectionTierDividerSpec, type CabinetDrawerStackSpec, type ResolvedCabinetLayout, getCabinetTierSpecs, type CabinetLayout, setCabinetTierHeights, type CabinetSection, resolveCabinetTierLayouts, getSectionInnerSpan } from '../cabinet-layout';
import { getBodyBaseY, getCabinetInnerHeight, getCabinetInnerWidth } from './common';
import { MIN_TIER_HEIGHT } from './constants';
import { getDrawerGeometry } from './drawers';
import type { CabinetFrontMode, CabinetFrontOpeningMode, CabinetLocalZone, CabinetModuleState, CabinetSectionDrawerStack, CabinetTierSection, SectionVerticalFrame } from './types';

export function getTierDividerDepth(depthValue: number, backInset: number, frontMode: CabinetFrontMode) {
  // Keep tier divider flush with the front plane (including inset-front mode).
  // Back panel still applies its own rear inset independently.
  const frontInset = 0;
  return Math.max(20, depthValue - backInset - frontInset);
}

export function getTierDividerCenterZ(baseCenterZ: number, backInset: number, frontMode: CabinetFrontMode) {
  const frontInset = 0;
  return baseCenterZ + (backInset - frontInset) / 2;
}

export function getSortedSectionTierDividers(dividers: CabinetSectionTierDividerSpec[]) {
  return [...dividers].sort((a, b) => a.positionRatio - b.positionRatio);
}

/**
 * Named after the divider right below the zone (the lowest zone is the base), not its index: a zone keeps its id —
 * and with it its shelves, back panel and fronts — when other dividers are added/removed or sections are merged.
 */
function makeLocalZoneId(sortedDividers: CabinetSectionTierDividerSpec[], zoneIndex: number) {
  return zoneIndex === 0 ? 'zone-base' : `zone-above-${sortedDividers[zoneIndex - 1]?.id ?? zoneIndex}`;
}

export function getLocalSectionDividerCenters(frame: SectionVerticalFrame, dividerThickness: number, dividers: CabinetSectionTierDividerSpec[]) {
  if (dividers.length <= 0) return [];
  const clearStartY = frame.startY;
  const clearSpan = Math.max(20, frame.clearHeight - dividers.length * dividerThickness);
  return getSortedSectionTierDividers(dividers).map((divider) => (
    clearStartY + clearSpan * divider.positionRatio + dividerThickness * 0.5
  ));
}

function getLocalSectionZoneFrames(frame: SectionVerticalFrame, dividerThickness: number, dividers: CabinetSectionTierDividerSpec[]) {
  const dividerCenters = getLocalSectionDividerCenters(frame, dividerThickness, dividers);
  if (dividerCenters.length <= 0) return [frame];
  const boundaries = [frame.startY, ...dividerCenters.flatMap((centerY) => [centerY - dividerThickness / 2, centerY + dividerThickness / 2]), frame.endY];
  const zones: SectionVerticalFrame[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 2) {
    const startY = boundaries[index] ?? frame.startY;
    const endY = boundaries[index + 1] ?? frame.endY;
    zones.push({
      startY,
      endY,
      clearHeight: Math.max(20, endY - startY),
      centerY: (startY + endY) / 2,
    });
  }
  return zones;
}

/**
 * Drawer blocks are placed in mm (niche offset, then drawerCount × slotHeight): the owned dividers' ratios are derived
 * from the frame, so the niche and the block keep their heights when the cabinet or tier height changes.
 */
function applyDrawerBlockDividers(frame: SectionVerticalFrame, dividerThickness: number, dividers: CabinetSectionTierDividerSpec[], drawers: CabinetDrawerStackSpec[]) {
  // A full-height block has no inner divider: its spec stays in the layout (keeping the ids) but is not built.
  const fillDividerIds = new Set(drawers.flatMap((drawer) => (drawer.block?.fill ? [drawer.block.dividerId] : [])));
  const built = fillDividerIds.size > 0 ? dividers.filter((divider) => !fillDividerIds.has(divider.id)) : dividers;
  if (built.length === 0) return built;
  const th = dividerThickness;
  const centers = new Map<string, number>();
  drawers.forEach((drawer) => {
    const block = drawer.block;
    if (!block) return;
    const hasBase = Boolean(block.baseDividerId && built.some((divider) => divider.id === block.baseDividerId));
    const offset = hasBase ? Math.max(0, block.offset ?? 0) : 0;
    const blockHeight = Math.max(40, drawer.drawerCount * block.slotHeight);
    const nicheSpan = hasBase ? offset + th : 0;
    if (block.anchor === 'bottom') {
      if (hasBase) centers.set(block.baseDividerId!, frame.startY + offset + th / 2);
      if (!block.fill) centers.set(block.dividerId, frame.startY + nicheSpan + blockHeight + th / 2);
    } else {
      if (hasBase) centers.set(block.baseDividerId!, frame.endY - offset - th / 2);
      if (!block.fill) centers.set(block.dividerId, frame.endY - nicheSpan - blockHeight - th / 2);
    }
  });
  if (centers.size === 0) return built;
  // Inverse of getLocalSectionDividerCenters: center = startY + clearSpan × ratio + th / 2.
  const clearSpan = Math.max(20, frame.clearHeight - built.length * th);
  return built.map((divider) => {
    const center = centers.get(divider.id);
    if (center === undefined) return divider;
    const clamped = Math.max(frame.startY + th / 2 + 20, Math.min(frame.endY - th / 2 - 20, center));
    return { ...divider, positionRatio: (clamped - frame.startY - th / 2) / clearSpan };
  });
}

export function getResolvedSectionDividers(resolvedLayout: ResolvedCabinetLayout, sectionId: string, frame: SectionVerticalFrame, dividerThickness: number) {
  return applyDrawerBlockDividers(
    frame,
    dividerThickness,
    resolvedLayout.tierDividersBySection.get(sectionId) ?? [],
    resolvedLayout.drawersBySection.get(sectionId) ?? []
  );
}

/** Zone id → drawer block occupying it: the zone just below a bottom block's inner divider, or just above a top block's. */
export function getDrawerBlockZones(zones: CabinetLocalZone[], dividers: CabinetSectionTierDividerSpec[], drawers: CabinetDrawerStackSpec[]) {
  const byZoneId = new Map<string, CabinetDrawerStackSpec>();
  const sorted = getSortedSectionTierDividers(dividers);
  drawers.forEach((drawer) => {
    if (!drawer.block) return;
    if (drawer.block.fill) {
      // No inner divider: the block takes the zone at the far end from its niche (the only zone without one).
      const fillZone = drawer.block.anchor === 'bottom' ? zones[zones.length - 1] : zones[0];
      if (fillZone) byZoneId.set(fillZone.id, drawer);
      return;
    }
    const index = sorted.findIndex((divider) => divider.id === drawer.block!.dividerId);
    if (index < 0) return;
    // zones[i] lies below sorted divider i, zones[i + 1] above it.
    const zone = drawer.block.anchor === 'bottom' ? zones[index] : zones[index + 1];
    if (zone) byZoneId.set(zone.id, drawer);
  });
  return byZoneId;
}

export function getLocalSectionZones(sectionId: string, tierId: string, tierIndex: number, frame: SectionVerticalFrame, dividerThickness: number, dividers: CabinetSectionTierDividerSpec[]): CabinetLocalZone[] {
  const sortedDividers = getSortedSectionTierDividers(dividers);
  return getLocalSectionZoneFrames(frame, dividerThickness, dividers).map((zoneFrame, zoneIndex) => ({
    id: makeLocalZoneId(sortedDividers, zoneIndex),
    sectionId,
    tierId,
    tierIndex,
    zoneIndex,
    startY: zoneFrame.startY,
    endY: zoneFrame.endY,
    clearHeight: zoneFrame.clearHeight,
    centerY: zoneFrame.centerY,
  }));
}

export function getResolvedTierHeights(module: Pick<CabinetModuleState, 'layout' | 'height' | 'thickness' | 'withPlinth' | 'plinthHeight' | 'withTopRails' | 'topRailHeight'>) {
  const tiers = getCabinetTierSpecs(module.layout);
  const dividerCount = Math.max(0, tiers.length - 1);
  const clearTotal = Math.max(50, getCabinetInnerHeight(module) - dividerCount * module.thickness);
  const ratioTotal = Math.max(0.0001, tiers.reduce((sum, tier) => sum + Math.max(0.0001, tier.heightRatio), 0));
  return {
    clearTotal,
    heights: tiers.map((tier) => clearTotal * (Math.max(0.0001, tier.heightRatio) / ratioTotal)),
  };
}

export function applyTierHeightToLayout(layout: CabinetLayout, innerHeight: number, thickness: number, tierHeight: number) {
  const tiers = getCabinetTierSpecs(layout);
  if (tiers.length < 2) return layout;
  const dividerCount = Math.max(0, tiers.length - 1);
  const clearTotal = Math.max(50, innerHeight - dividerCount * thickness);
  const topHeight = Math.max(MIN_TIER_HEIGHT, Math.min(clearTotal - MIN_TIER_HEIGHT, tierHeight));
  const remainingHeight = clearTotal - topHeight;
  const remainingRatio = Math.max(0.0001, tiers.slice(1).reduce((sum, tier) => sum + Math.max(0.0001, tier.heightRatio), 0));
  return setCabinetTierHeights(layout, [
    topHeight,
    ...tiers.slice(1).map((tier) => remainingHeight * (Math.max(0.0001, tier.heightRatio) / remainingRatio)),
  ]);
}

export function getLeafSections(module: Pick<CabinetModuleState, 'layout' | 'width' | 'thickness'>): CabinetSection[] {
  return resolveCabinetTierLayouts(module.layout, getCabinetInnerWidth(module), module.thickness)
    .flatMap((tier) => tier.resolved.leafSections);
}

export function getLeafSectionInnerSpan(module: Pick<CabinetModuleState, 'thickness'>, section: CabinetSection) {
  return getSectionInnerSpan(section, module.thickness);
}

export function getTierVerticalFrames(
  module: Pick<CabinetModuleState, 'layout' | 'height' | 'thickness' | 'withPlinth' | 'plinthHeight' | 'withTopRails' | 'topRailHeight' | 'position' | 'withTierDivider' | 'tierCount'>,
  bodyBaseY: number
) {
  const tiers = getCabinetTierSpecs(module.layout);
  const dividerCount = Math.max(0, tiers.length - 1);
  const clearTotal = Math.max(50, getCabinetInnerHeight(module) - dividerCount * module.thickness);
  const ratioTotal = Math.max(0.0001, tiers.reduce((sum, tier) => sum + Math.max(0.0001, tier.heightRatio), 0));
  let cursorTopY = bodyBaseY + module.thickness + getCabinetInnerHeight(module);
  return tiers.map((tier, index) => {
    const clearHeight = clearTotal * (Math.max(0.0001, tier.heightRatio) / ratioTotal);
    const endY = cursorTopY;
    const startY = endY - clearHeight;
    cursorTopY = startY - module.thickness;
    return {
      tierId: tier.id,
      tierIndex: index,
      startY,
      endY,
      clearHeight,
      centerY: startY + clearHeight / 2,
    };
  });
}

/** Section picked when the user has not chosen one: the tallest tier has the most to edit (widest section on a tie). */
export function getDefaultTierSection<T extends CabinetTierSection>(sections: T[]): T | null {
  return sections.reduce<T | null>((best, section) => {
    if (!best) return section;
    if (section.clearHeight > best.clearHeight + 0.5) return section;
    if (Math.abs(section.clearHeight - best.clearHeight) <= 0.5 && section.width > best.width + 0.5) return section;
    return best;
  }, null);
}

/** Front height of each drawer in a block of `drawerCount` × `slotHeight` (same formula the builder uses). */
export function getDrawerBlockFacadeHeight(slotHeight: number, drawerCount: number, frontOpeningMode: CabinetFrontOpeningMode) {
  return getDrawerGeometry(0, Math.max(40, drawerCount * slotHeight), drawerCount, 0, frontOpeningMode).facadeHeight;
}

export function getLeafTierSections(
  module: Pick<CabinetModuleState, 'layout' | 'width' | 'thickness' | 'height' | 'withPlinth' | 'plinthHeight' | 'withTopRails' | 'topRailHeight' | 'position' | 'withTierDivider' | 'tierCount'>
): CabinetTierSection[] {
  const tierLayouts = resolveCabinetTierLayouts(module.layout, getCabinetInnerWidth(module), module.thickness);
  const bodyBaseY = getBodyBaseY(module.position.y, {
    withPlinth: module.withPlinth,
    plinthHeight: module.plinthHeight,
    withTopRails: module.withTopRails,
    topRailHeight: module.topRailHeight,
    withAprons: false,
    withTierDivider: false,
    tierCount: 1,
    tierHeight: 0,
    backPanelSections: [],
    frontMode: 'inset',
    frontOpeningMode: 'handleless',
  });
  const frames = getTierVerticalFrames(module, bodyBaseY);
  return tierLayouts.flatMap((tier, tierIndex) => {
    const frame = frames.find((item) => item.tierId === tier.tierId) ?? frames[tierIndex];
    if (!frame) return [];
    return tier.resolved.leafSections.map((section) => ({
      ...section,
      tierId: tier.tierId,
      tierIndex,
      startY: frame.startY,
      endY: frame.endY,
      clearHeight: frame.clearHeight,
    }));
  });
}

export function getLocalZonesForSection(
  module: Pick<CabinetModuleState, 'layout' | 'width' | 'thickness' | 'height' | 'withPlinth' | 'plinthHeight' | 'withTopRails' | 'topRailHeight' | 'position' | 'withTierDivider' | 'tierCount'>,
  sectionId: string,
  tierId?: string
): CabinetLocalZone[] {
  const tierLayouts = resolveCabinetTierLayouts(module.layout, getCabinetInnerWidth(module), module.thickness);
  const bodyBaseY = getBodyBaseY(module.position.y, {
    withPlinth: module.withPlinth,
    plinthHeight: module.plinthHeight,
    withTopRails: module.withTopRails,
    topRailHeight: module.topRailHeight,
    withAprons: false,
    withTierDivider: false,
    tierCount: 1,
    tierHeight: 0,
    backPanelSections: [],
    frontMode: 'inset',
    frontOpeningMode: 'handleless',
  });
  const frames = getTierVerticalFrames(module, bodyBaseY);
  return tierLayouts.flatMap((tier, tierIndex) => {
    if (tierId && tier.tierId !== tierId) return [];
    const frame = frames.find((item) => item.tierId === tier.tierId) ?? frames[tierIndex];
    const section = tier.resolved.leafSections.find((item) => item.id === sectionId);
    if (!frame || !section) return [];
    const dividers = getResolvedSectionDividers(tier.resolved, sectionId, frame, module.thickness);
    return getLocalSectionZones(sectionId, tier.tierId, tierIndex, frame, module.thickness, dividers);
  });
}

export function getDrawerStackForSection(module: Pick<CabinetModuleState, 'layout'>, sectionId: string, tierId?: string, zoneId?: string): CabinetSectionDrawerStack | null {
  const tiers = getCabinetTierSpecs(module.layout);
  const tier = tierId ? tiers.find((item) => item.id === tierId) : tiers.find((item) => item.layout.drawers?.some((drawer) => drawer.sectionId === sectionId));
  if (!tier) return null;
  const drawer = tier.layout.drawers?.find((item) => item.sectionId === sectionId && (zoneId === undefined || (item.zoneId ?? '') === zoneId)) ?? null;
  return drawer ? { ...drawer, tierId: tier.id } : null;
}
