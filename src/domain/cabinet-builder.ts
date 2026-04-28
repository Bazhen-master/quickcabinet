import { createId } from '../shared/ids';
import { applyGeneratedJoinery } from './auto-drilling';
import {
  addShelfToSection,
  addSectionTierDividerToSection,
  collapseTieredCabinetLayout,
  createCabinetLayout,
  ensureTieredCabinetLayout,
  getCabinetTierSpecs,
  getSectionInnerSpan,
  upsertDrawerStackInSection,
  removePartition,
  removeDrawerStack,
  removeSectionTierDivider,
  removeShelf,
  resolveCabinetLayout,
  resolveCabinetTierLayouts,
  setDrawerStackInnerFrontPanel,
  setCabinetTierCount,
  setCabinetTierHeights,
  updateSectionTierDividerPosition,
  setLeafSectionWidths,
  splitSection,
  type CabinetLayout,
  type CabinetDrawerStackSpec,
  type CabinetSection,
  type CabinetSectionTierDividerSpec,
  type DrawerRunnerLength,
  type DrawerRunnerLengthMode,
  type DrawerRunnerType,
  type ResolvedCabinetTierLayout,
} from './cabinet-layout';
import { createDrillOperation, getFaceAxis, type DrillOperation } from './drill';
import { createEmptySideJoinery } from './joinery';
import { createPanelPart, type Part } from './part';

export type CabinetFrontType = 'none' | 'double';
export type CabinetTopMode = 'overlay' | 'inset';
export type CabinetFrontMode = 'overlay' | 'inset';
export type CabinetFrontOpeningMode = 'handleless' | 'handles';

export type CabinetBuildInput = {
  name?: string;
  width: number;
  height: number;
  depth: number;
  thickness: number;
  shelfCount: number;
  partitionCount?: number;
  withBackPanel?: boolean;
  frontType?: CabinetFrontType;
  frontCount?: number;
  frontMode?: CabinetFrontMode;
  frontOpeningMode?: CabinetFrontOpeningMode;
  topMode?: CabinetTopMode;
  withPlinth?: boolean;
  plinthHeight?: number;
  withTopRails?: boolean;
  topRailHeight?: number;
  withAprons?: boolean;
  withTierDivider?: boolean;
  tierCount?: number;
  tierHeight?: number;
  backPanelSections?: string[];
  frontTierIds?: string[];
  position?: { x: number; y: number; z: number };
  groupId?: string;
  layout?: CabinetLayout;
};

export type CabinetModuleState = {
  groupId: string;
  name: string;
  width: number;
  height: number;
  depth: number;
  thickness: number;
  shelfCount: number;
  partitionCount: number;
  withBackPanel: boolean;
  frontType: CabinetFrontType;
  frontCount: number;
  frontMode: CabinetFrontMode;
  frontOpeningMode: CabinetFrontOpeningMode;
  topMode: CabinetTopMode;
  withPlinth: boolean;
  plinthHeight: number;
  withTopRails: boolean;
  topRailHeight: number;
  withAprons: boolean;
  withTierDivider: boolean;
  tierCount: number;
  tierHeight: number;
  backPanelSections: string[];
  frontTierIds: string[];
  position: { x: number; y: number; z: number };
  layout: CabinetLayout;
};

export type CabinetTierSection = CabinetSection & {
  tierId: string;
  tierIndex: number;
  startY: number;
  endY: number;
  clearHeight: number;
};

export type CabinetLocalZone = {
  id: string;
  sectionId: string;
  tierId: string;
  tierIndex: number;
  zoneIndex: number;
  startY: number;
  endY: number;
  clearHeight: number;
  centerY: number;
};

export type CabinetSectionDrawerStack = CabinetDrawerStackSpec & {
  tierId?: string;
};

type SectionVerticalFrame = {
  startY: number;
  endY: number;
  clearHeight: number;
  centerY: number;
};

type CabinetOptions = {
  withPlinth: boolean;
  plinthHeight: number;
  withTopRails: boolean;
  topRailHeight: number;
  withAprons: boolean;
  withTierDivider: boolean;
  tierCount: number;
  tierHeight: number;
  backPanelSections: string[];
  frontTierIds: string[];
  frontMode: CabinetFrontMode;
  frontOpeningMode: CabinetFrontOpeningMode;
};

const NAME_SEP = ' · ';
const DEFAULT_PLINTH_HEIGHT = 60;
const DEFAULT_TOP_RAIL_HEIGHT = 60;
const APRON_HEIGHT = 150;
const APRON_MIN_WIDTH = 300;
const CROWN_FORWARD_OFFSET = 16;
const GENERATED_CROWN_SOURCE_PREFIX = 'generated-crown:';
const GENERATED_PLINTH_SOURCE_PREFIX = 'generated-plinth:';
const GENERATED_DRAWER_SOURCE_PREFIX = 'generated-drawer:';
const TOP_RAIL_SUPPORT_SHORTER_BY = 32;
const TOP_RAIL_MINIFIX_SPACING = 400;
const TOP_RAIL_MINIFIX_EDGE_OFFSET = 50;
const MINIFIX_CENTER_OFFSET = 34;
const MINIFIX_CONNECTOR_CHANNEL_DIAMETER = 8;
const MINIFIX_CONNECTOR_CHANNEL_DEPTH = 30;
const MINIFIX_CONNECTOR_PIN_DIAMETER = 5;
const MINIFIX_CONNECTOR_PIN_DEPTH = 12;
const PLINTH_MINIFIX_DOWEL_SPACING = 32;
const PLINTH_DOWEL_DIAMETER = 8;
const PLINTH_DOWEL_DEPTH = 12;
const PLINTH_TO_BOTTOM_MAX_DOWEL_SPACING = 400;
const TOP_RAIL_CONNECTOR_PIN_BOTTOM_OFFSET = 8;
const BACK_PANEL_SPLIT_THRESHOLD = 1000;
const BACK_PANEL_MIN_SECTION_WIDTH = 300;
export const DRAWER_RUNNER_LENGTHS: DrawerRunnerLength[] = [250, 300, 350, 400, 450, 500, 550, 600];
const DEFAULT_DRAWER_RUNNER_LENGTH: DrawerRunnerLength = 450;
const DRAWER_RUNNER_AUTO_FRONT_CLEARANCE = 16;
const DRAWER_RUNNER_AUTO_BACK_CLEARANCE = 30;
const DRAWER_FINGER_CLEARANCE = 32;
const HANDLED_FRONT_GAP = 3;
const DRAWER_FACADE_SIDE_CLEARANCE = 4;
const DRAWER_BOX_HEIGHT_REDUCTION = 50;
const DRAWER_BOX_WIDTH_REDUCTION = 10;
const DRAWER_FRONT_BACK_LOWER_BY = 28;
const DRAWER_SIDE_BOTTOM_OVERHANG = 12;
const DRAWER_BOX_BACK_OFFSET = 16;
const DRAWER_BACK_LIFT = 4;
const DRAWER_BOTTOM_EXTRA_DEPTH = 32;
const DRAWER_BOX_WALL_TOP_EXTENSION = 20;
const DRAWER_BOX_LIFT_RELATIVE_TO_FACADE = 4;
const INSET_FRONT_WIDTH_REDUCTION = 2;
const INSET_FRONT_HEIGHT_REDUCTION = 8;
const INSET_FRONT_INTERNAL_RECESS = 18;
const TIER_DIVIDER_FRONT_INSET = 16;
const TIER_DIVIDER_BACK_PANEL_INSET = 16;
const OVERLAY_FRONT_EDGE_GAP = 2;
const OVERLAY_FRONT_MIDDLE_GAP = 2;
const OVERLAY_FRONT_TIER_REDUCTION = 3;
const OVERLAY_FRONT_HEIGHT_INCREASE = 29;
const OVERLAY_FRONT_PLINTH_FLOOR_GAP = 20;
const OVERLAY_FRONT_TIER_DIVIDER_GAP = 3;
const DRAWER_BOTTOM_FACADE_MIN_CLEARANCE = 4;
const MIN_DRAWER_FACADE_HEIGHT = 130;
const DRAWER_FRONT_PANEL_MIN_FACADE_HEIGHT = 180;
const MIN_TIER_HEIGHT = 50;
const CONFIRMAT_THREAD_DIAMETER = 5;
const CONFIRMAT_THREAD_DEPTH = 50;
const CONFIRMAT_HEAD_DIAMETER = 8;
const CONFIRMAT_HEAD_DEPTH = 16;

function resolveTopMode(topMode: CabinetTopMode, withTopRails: boolean): CabinetTopMode {
  return withTopRails ? 'inset' : topMode;
}

function roleLabel(role: string, index?: number) {
  switch (role) {
    case 'left-side': return 'Left side';
    case 'right-side': return 'Right side';
    case 'bottom': return 'Bottom';
    case 'top': return 'Top';
    case 'shelf': return `Shelf ${index ?? 1}`;
    case 'drawer-front': return `Drawer front ${index ?? 1}`;
    case 'drawer-side-left': return `Drawer left side ${index ?? 1}`;
    case 'drawer-side-right': return `Drawer right side ${index ?? 1}`;
    case 'drawer-back': return `Drawer back ${index ?? 1}`;
    case 'drawer-inner-front': return `Drawer inner front ${index ?? 1}`;
    case 'drawer-bottom': return `Drawer bottom ${index ?? 1}`;
    case 'partition': return `Partition ${index ?? 1}`;
    case 'apron': return `Apron ${index ?? 1}`;
    case 'back-panel': return 'Back panel';
    case 'front-left': return 'Front left';
    case 'front-right': return 'Front right';
    case 'plinth-front': return 'Plinth front';
    case 'plinth-back': return 'Plinth back';
    case 'plinth-brace': return `Plinth brace ${index ?? 1}`;
    case 'top-rail-front': return 'Top rail front';
    case 'top-rail-support': return 'Top rail support';
    default: return 'Panel';
  }
}

function getLayoutCarrier(parts: Part[]) {
  return parts.find((part) => part.meta?.role === 'left-side' && part.meta?.cabinetLayout);
}

function getCabinetOptionsCarrier(parts: Part[]) {
  return parts.find((part) => part.meta?.role === 'left-side' && part.meta?.cabinetOptions);
}

function isBuilderGeneratedOp(source?: string) {
  return typeof source === 'string' && (source.startsWith(GENERATED_CROWN_SOURCE_PREFIX) || source.startsWith(GENERATED_PLINTH_SOURCE_PREFIX) || source.startsWith(GENERATED_DRAWER_SOURCE_PREFIX));
}

function mergeExistingAndBuiltOperations(existing: DrillOperation[], built: DrillOperation[]) {
  return [...existing.filter((op) => !isBuilderGeneratedOp(op.source)), ...built];
}

function withDefaultSectionWidths(layout: CabinetLayout, innerWidth: number, thickness: number): CabinetLayout {
  const tiers = getCabinetTierSpecs(layout);
  const nextTiers = tiers.map((tier) => {
    if (tier.layout.sectionWidths && tier.layout.sectionWidths.length > 0) return tier;
    const leafCount = tier.layout.partitions.length + 1;
    const clearOpeningWidth = Math.max(20, (innerWidth - tier.layout.partitions.length * thickness) / Math.max(leafCount, 1));
    return {
      ...tier,
      layout: {
        ...tier.layout,
        sectionWidths: Array.from({ length: leafCount }, () => clearOpeningWidth),
      },
    };
  });
  const primary = nextTiers[0]?.layout ?? { partitions: [], shelves: [], drawers: [] };
  return {
    partitions: primary.partitions,
    shelves: primary.shelves,
    drawers: primary.drawers,
    sectionWidths: primary.sectionWidths,
    tiers: nextTiers,
  };
}

export function getCabinetInnerWidth(module: Pick<CabinetModuleState, 'width' | 'thickness'>) {
  return Math.max(50, module.width - module.thickness * 2);
}

export function getCabinetBodyHeight(module: Pick<CabinetModuleState, 'height' | 'withPlinth' | 'plinthHeight' | 'withTopRails' | 'topRailHeight'>) {
  const plinth = module.withPlinth ? module.plinthHeight : 0;
  const rails = module.withTopRails ? module.topRailHeight : 0;
  return Math.max(100, module.height - plinth - rails);
}

export function getCabinetInnerHeight(module: Pick<CabinetModuleState, 'height' | 'thickness' | 'withPlinth' | 'plinthHeight' | 'withTopRails' | 'topRailHeight'>) {
  return Math.max(50, getCabinetBodyHeight(module) - module.thickness * 2);
}

function getInnerDepth(depth: number, thickness: number, withBackPanel: boolean) {
  return Math.max(50, depth - (withBackPanel ? thickness : 0));
}

function getBodyBaseY(baseY: number, options: CabinetOptions) {
  return baseY + (options.withPlinth ? options.plinthHeight : 0);
}

function getBodyTopY(bodyBaseY: number, bodyHeight: number) {
  return bodyBaseY + bodyHeight;
}

function getCabinetCenterY(bodyBaseY: number, bodyHeight: number) {
  return bodyBaseY + bodyHeight / 2;
}

function getDefaultCabinetOptions(input: Pick<CabinetBuildInput, 'withPlinth' | 'plinthHeight' | 'withTopRails' | 'topRailHeight' | 'withAprons' | 'withTierDivider' | 'tierCount' | 'tierHeight' | 'backPanelSections' | 'frontTierIds' | 'frontMode' | 'frontOpeningMode'>): CabinetOptions {
  const tierCount = Math.max(1, Math.round(input.tierCount ?? (input.withTierDivider ? 2 : 1)));
  return {
    withPlinth: input.withPlinth ?? false,
    plinthHeight: Math.max(40, input.plinthHeight ?? DEFAULT_PLINTH_HEIGHT),
    withTopRails: input.withTopRails ?? false,
    topRailHeight: Math.max(20, input.topRailHeight ?? DEFAULT_TOP_RAIL_HEIGHT),
    withAprons: input.withAprons ?? false,
    withTierDivider: tierCount > 1,
    tierCount,
    tierHeight: Math.max(0, input.tierHeight ?? 0),
    backPanelSections: [...(input.backPanelSections ?? [])],
    frontTierIds: [...(input.frontTierIds ?? [])],
    frontMode: (input as CabinetBuildInput).frontMode ?? 'overlay',
    frontOpeningMode: input.frontOpeningMode ?? 'handleless',
  };
}

function getInsetAdjustedDepth(depthValue: number, frontMode: CabinetFrontMode) {
  return frontMode === 'inset'
    ? Math.max(50, depthValue - INSET_FRONT_INTERNAL_RECESS)
    : depthValue;
}

function getInsetAdjustedCenterZ(baseCenterZ: number, frontMode: CabinetFrontMode) {
  return frontMode === 'inset'
    ? baseCenterZ - INSET_FRONT_INTERNAL_RECESS / 2
    : baseCenterZ;
}

function getTierDividerDepth(depthValue: number, withBackPanel: boolean, frontMode: CabinetFrontMode, frontCount: number) {
  const backInset = withBackPanel ? TIER_DIVIDER_BACK_PANEL_INSET : 0;
  // Keep tier divider flush with the front plane (including inset-front mode).
  // Back panel still applies its own rear inset independently.
  const frontInset = 0;
  return Math.max(20, depthValue - backInset - frontInset);
}

function getTierDividerCenterZ(baseCenterZ: number, withBackPanel: boolean, frontMode: CabinetFrontMode, frontCount: number) {
  const backInset = withBackPanel ? TIER_DIVIDER_BACK_PANEL_INSET : 0;
  const frontInset = 0;
  return baseCenterZ + (backInset - frontInset) / 2;
}

function getSortedSectionTierDividers(dividers: CabinetSectionTierDividerSpec[]) {
  return [...dividers].sort((a, b) => a.positionRatio - b.positionRatio);
}

function makeLocalZoneId(sectionId: string, zoneIndex: number) {
  return `${sectionId}:zone:${zoneIndex}`;
}

function getLocalSectionDividerCenters(frame: SectionVerticalFrame, dividerThickness: number, dividers: CabinetSectionTierDividerSpec[]) {
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

function getLocalSectionZones(sectionId: string, tierId: string, tierIndex: number, frame: SectionVerticalFrame, dividerThickness: number, dividers: CabinetSectionTierDividerSpec[]): CabinetLocalZone[] {
  return getLocalSectionZoneFrames(frame, dividerThickness, dividers).map((zoneFrame, zoneIndex) => ({
    id: makeLocalZoneId(sectionId, zoneIndex),
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

function getFrontGaps(frontOpeningMode: CabinetFrontOpeningMode) {
  return frontOpeningMode === 'handles'
    ? { edge: HANDLED_FRONT_GAP, middle: HANDLED_FRONT_GAP }
    : { edge: OVERLAY_FRONT_EDGE_GAP, middle: OVERLAY_FRONT_MIDDLE_GAP };
}

function getZoneFrontNominalHeight(clearHeight: number, frontMode: CabinetFrontMode, _frontOpeningMode: CabinetFrontOpeningMode) {
  return frontMode === 'overlay'
    ? Math.max(60, clearHeight - OVERLAY_FRONT_TIER_REDUCTION + OVERLAY_FRONT_HEIGHT_INCREASE)
    : Math.max(60, clearHeight);
}

function getFrontVerticalPlacement(params: {
  frontMode: CabinetFrontMode;
  clearHeight: number;
  centerY: number;
  endY: number;
  withPlinth: boolean;
  isBottomTier: boolean;
  isBottomZoneInTier: boolean;
  tierIndex: number;
  tierCount: number;
  dividerThickness: number;
  floorY: number;
  frontOpeningMode: CabinetFrontOpeningMode;
}) {
  const {
    frontMode,
    clearHeight,
    centerY,
    endY,
    withPlinth,
    isBottomTier,
    isBottomZoneInTier,
    tierIndex,
    tierCount,
    dividerThickness,
    floorY,
    frontOpeningMode,
  } = params;
  const nominalFrontHeight = getZoneFrontNominalHeight(clearHeight, frontMode, frontOpeningMode);
  let topY = centerY + nominalFrontHeight / 2;
  let bottomY = centerY - nominalFrontHeight / 2;

  if (frontMode === 'overlay' && tierCount > 1) {
    if (tierIndex > 0) {
      const upperDividerCenterY = endY + dividerThickness / 2;
      topY = upperDividerCenterY - OVERLAY_FRONT_TIER_DIVIDER_GAP / 2;
    }
    if (tierIndex < tierCount - 1) {
      const lowerDividerCenterY = centerY - clearHeight / 2 - dividerThickness / 2;
      bottomY = lowerDividerCenterY + OVERLAY_FRONT_TIER_DIVIDER_GAP / 2;
    }
  }

  if (frontMode === 'overlay' && withPlinth && isBottomTier && isBottomZoneInTier) {
    bottomY = floorY + OVERLAY_FRONT_PLINTH_FLOOR_GAP;
  }

  const stretchedHeight = topY - bottomY;
  if (stretchedHeight <= 20) return { nominalFrontHeight, centerY };
  return {
    nominalFrontHeight: Math.max(60, stretchedHeight),
    centerY: bottomY + stretchedHeight / 2,
  };
}

function getFrontPanelGeometry(
  frontMode: CabinetFrontMode,
  cabinetDepth: number,
  partThickness: number,
  position: { x: number; y: number; z: number },
  width: number,
  height: number
) {
  if (frontMode === 'inset') {
    return {
      width: Math.max(40, width - INSET_FRONT_WIDTH_REDUCTION),
      height: Math.max(40, height - INSET_FRONT_HEIGHT_REDUCTION),
      z: position.z + cabinetDepth / 2 - partThickness / 2,
    };
  }
  return {
    width,
    height,
    z: position.z + cabinetDepth / 2 + partThickness / 2,
  };
}

function getOverlayFrontWidths(totalWidth: number, count: number, frontOpeningMode: CabinetFrontOpeningMode, weights?: number[]) {
  const nextCount = Math.max(1, count);
  const gaps = getFrontGaps(frontOpeningMode);
  const totalGap = gaps.edge * 2 + gaps.middle * Math.max(0, nextCount - 1);
  const availableWidth = Math.max(40 * nextCount, totalWidth - totalGap);
  const safeWeights = weights && weights.length === nextCount
    ? weights.map((value) => (Number.isFinite(value) && value > 0 ? value : 1))
    : Array.from({ length: nextCount }, () => 1);
  const weightTotal = safeWeights.reduce((sum, value) => sum + value, 0) || nextCount;
  return safeWeights.map((value) => (availableWidth * value) / weightTotal);
}

function getOverlayFrontCenters(totalWidth: number, widths: number[], frontOpeningMode: CabinetFrontOpeningMode) {
  const gaps = getFrontGaps(frontOpeningMode);
  let cursor = -totalWidth / 2 + gaps.edge;
  return widths.map((widthValue) => {
    const center = cursor + widthValue / 2;
    cursor += widthValue + gaps.middle;
    return center;
  });
}

function clampFrontCount(value: number) {
  return Math.max(0, Math.min(4, Math.round(value)));
}

function makeMainFrontSourceId(tierId: string, index: number, hingeSide: 'left' | 'right', sectionId?: string, zoneId?: string) {
  return `front-main:${tierId}:${index}:${hingeSide}${sectionId ? `:${sectionId}` : ''}${zoneId ? `:${zoneId}` : ''}`;
}

function parseMainFrontSourceId(sourceId?: string | null) {
  if (!sourceId?.startsWith('front-main:')) return null;
  const parts = sourceId.split(':');
  if (parts.length < 4) return null;
  const isNewShape = parts.length >= 5;
  const tierId = isNewShape ? parts[2] : undefined;
  const indexRaw = isNewShape ? parts[3] : parts[2];
  const hingeSide = isNewShape ? parts[4] : parts[3];
  const sectionId = isNewShape ? parts[5] : parts[4];
  if ((hingeSide !== 'left' && hingeSide !== 'right') || !indexRaw) return null;
  const index = Number(indexRaw);
  if (!Number.isFinite(index)) return null;
  return { tierId, index, hingeSide, sectionId: sectionId || undefined };
}

function getResolvedTierHeights(module: Pick<CabinetModuleState, 'layout' | 'height' | 'thickness' | 'withPlinth' | 'plinthHeight' | 'withTopRails' | 'topRailHeight'>) {
  const tiers = getCabinetTierSpecs(module.layout);
  const dividerCount = Math.max(0, tiers.length - 1);
  const clearTotal = Math.max(50, getCabinetInnerHeight(module) - dividerCount * module.thickness);
  const ratioTotal = Math.max(0.0001, tiers.reduce((sum, tier) => sum + Math.max(0.0001, tier.heightRatio), 0));
  return {
    clearTotal,
    heights: tiers.map((tier) => clearTotal * (Math.max(0.0001, tier.heightRatio) / ratioTotal)),
  };
}

function applyTierHeightToLayout(layout: CabinetLayout, innerHeight: number, thickness: number, tierHeight: number) {
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

function normalizeBackPanelAprons(withBackPanel: boolean, options: CabinetOptions) {
  return {
    withBackPanel,
    options: {
      ...options,
      withAprons: withBackPanel ? false : options.withAprons,
    },
  };
}

type BackPanelSegment = {
  id: string;
  startX: number;
  endX: number;
  width: number;
  centerX: number;
  leftBoundary: CabinetSection['leftBoundary'];
  rightBoundary: CabinetSection['rightBoundary'];
  clearWidth: number;
};

function getBackPanelSegmentClearWidth(segment: Pick<BackPanelSegment, 'startX' | 'endX' | 'leftBoundary' | 'rightBoundary'>, thickness: number) {
  const startInset = segment.leftBoundary === 'partition' ? thickness / 2 : 0;
  const endInset = segment.rightBoundary === 'partition' ? thickness / 2 : 0;
  return Math.max(0, segment.endX - segment.startX - startInset - endInset);
}

function mergeBackPanelSegments(left: BackPanelSegment, right: BackPanelSegment, thickness: number): BackPanelSegment {
  const merged = {
    id: `${left.id}+${right.id}`,
    startX: left.startX,
    endX: right.endX,
    width: right.endX - left.startX,
    centerX: (left.startX + right.endX) / 2,
    leftBoundary: left.leftBoundary,
    rightBoundary: right.rightBoundary,
  };
  return {
    ...merged,
    clearWidth: getBackPanelSegmentClearWidth(merged, thickness),
  };
}

function getBackPanelSegments(
  resolved: ReturnType<typeof resolveCabinetLayout>,
  innerWidth: number,
  innerHeight: number,
  thickness: number
): BackPanelSegment[] {
  if (innerWidth <= BACK_PANEL_SPLIT_THRESHOLD || innerHeight <= BACK_PANEL_SPLIT_THRESHOLD || resolved.leafSections.length <= 1) {
    return [{
      id: 'full',
      startX: -innerWidth / 2,
      endX: innerWidth / 2,
      width: innerWidth,
      centerX: 0,
      leftBoundary: 'outer',
      rightBoundary: 'outer',
      clearWidth: innerWidth,
    }];
  }

  const segments = resolved.leafSections
    .map((section) => {
      const innerSpan = getSectionInnerSpan(section, thickness);
      return {
        id: section.id,
        startX: innerSpan.startX,
        endX: innerSpan.endX,
        width: innerSpan.width,
        centerX: innerSpan.centerX,
        leftBoundary: section.leftBoundary,
        rightBoundary: section.rightBoundary,
        clearWidth: innerSpan.width,
      } satisfies BackPanelSegment;
    });

  let next = [...segments];
  while (next.length > 1) {
    const narrowIndex = next.findIndex((segment) => segment.clearWidth < BACK_PANEL_MIN_SECTION_WIDTH);
    if (narrowIndex === -1) break;
    if (narrowIndex === 0) {
      next.splice(0, 2, mergeBackPanelSegments(next[0]!, next[1]!, thickness));
      continue;
    }
    if (narrowIndex === next.length - 1) {
      next.splice(narrowIndex - 1, 2, mergeBackPanelSegments(next[narrowIndex - 1]!, next[narrowIndex]!, thickness));
      continue;
    }
    const left = next[narrowIndex - 1]!;
    const current = next[narrowIndex]!;
    const right = next[narrowIndex + 1]!;
    const mergeRight = right.clearWidth >= left.clearWidth;
    if (mergeRight) {
      next.splice(narrowIndex, 2, mergeBackPanelSegments(current, right, thickness));
    } else {
      next.splice(narrowIndex - 1, 2, mergeBackPanelSegments(left, current, thickness));
    }
  }

  return next;
}

type DrawerGeometry = {
  facadeWidth: number;
  facadeHeight: number;
  boxWidth: number;
  boxHeight: number;
  boxDepth: number;
  sideHeight: number;
  frontBackHeight: number;
};

function getDrawerGeometry(sectionWidth: number, tierHeight: number, drawerCount: number, runnerLength: number, frontOpeningMode: CabinetFrontOpeningMode) : DrawerGeometry {
  const slotHeight = tierHeight / Math.max(1, drawerCount);
  const facadeHeight = frontOpeningMode === 'handles'
    ? Math.max(60, (tierHeight - HANDLED_FRONT_GAP * (Math.max(1, drawerCount) + 1)) / Math.max(1, drawerCount))
    : Math.max(60, slotHeight - DRAWER_FINGER_CLEARANCE);
  const boxHeight = Math.max(40, facadeHeight - DRAWER_BOX_HEIGHT_REDUCTION);
  return {
    facadeWidth: Math.max(100, sectionWidth - DRAWER_FACADE_SIDE_CLEARANCE),
    facadeHeight,
    boxWidth: Math.max(80, sectionWidth - DRAWER_BOX_WIDTH_REDUCTION),
    boxHeight,
    boxDepth: runnerLength,
    sideHeight: boxHeight,
    frontBackHeight: Math.max(20, boxHeight - DRAWER_FRONT_BACK_LOWER_BY),
  };
}

export function getAutoDrawerRunnerLength(cabinetDepth: number): DrawerRunnerLength {
  const availableDepth = cabinetDepth - DRAWER_RUNNER_AUTO_FRONT_CLEARANCE - DRAWER_RUNNER_AUTO_BACK_CLEARANCE;
  const fitting = DRAWER_RUNNER_LENGTHS.filter((length) => length <= availableDepth);
  return fitting[fitting.length - 1] ?? DRAWER_RUNNER_LENGTHS[0] ?? DEFAULT_DRAWER_RUNNER_LENGTH;
}

export function getEffectiveDrawerRunnerLength(drawerStack: CabinetDrawerStackSpec, cabinetDepth: number): DrawerRunnerLength {
  return drawerStack.runnerLengthMode === 'auto'
    ? getAutoDrawerRunnerLength(cabinetDepth)
    : drawerStack.runnerLength;
}

export function getMaxDrawerCountForClearHeight(clearHeight: number) {
  return Math.max(0, Math.floor(clearHeight / (MIN_DRAWER_FACADE_HEIGHT + DRAWER_FINGER_CLEARANCE)));
}

function getDrawerJoineryVerticalOffsets(height: number) {
  const clampY = (value: number) => Math.max(18, Math.min(height - 18, value));
  if (height <= 80) return [height / 2];
  return [clampY(height / 3), clampY(height * 2 / 3)];
}

function createDrawerWallConfirmatOps(
  sidePart: Part,
  wallPart: Part,
  side: 'left' | 'right',
  wallKey: 'back' | 'inner-front'
) {
  const source = `${GENERATED_DRAWER_SOURCE_PREFIX}${sidePart.id}:${wallKey}-confirmat:${side}`;
  const yOffsets = getDrawerJoineryVerticalOffsets(wallPart.height);
  const sideFace = side === 'left' ? 'left' : 'right';
  const wallFace = side === 'left' ? 'left' : 'right';
  const sideX = wallKey === 'back'
    ? Math.max(9, sidePart.thickness - wallPart.thickness / 2)
    : Math.max(9, wallPart.thickness / 2);
  const wallX = wallPart.thickness / 2;
  const templateName = wallKey === 'back' ? 'Drawer back confirmat' : 'Drawer inner front confirmat';
  return {
    sideOps: yOffsets.map((offset) =>
      createDrillOperation({
        source,
        face: sideFace,
        axis: getFaceAxis(sideFace),
        x: sideX,
        y: sidePart.height / 2 - (wallPart.position.y + wallPart.height / 2 - offset - sidePart.position.y),
        diameter: CONFIRMAT_HEAD_DIAMETER,
        depth: Math.min(CONFIRMAT_HEAD_DEPTH, sidePart.width),
        through: false,
        templateName,
        feature: 'confirmat',
      })
    ),
    wallOps: yOffsets.map((offset) =>
      createDrillOperation({
        source,
        face: wallFace,
        axis: getFaceAxis(wallFace),
        x: wallX,
        y: offset,
        diameter: CONFIRMAT_THREAD_DIAMETER,
        depth: Math.min(CONFIRMAT_THREAD_DEPTH, wallPart.width),
        through: false,
        templateName,
        feature: 'confirmat',
      })
    ),
  };
}

function createDrawerFacadeMinifixOps(facadePart: Part, sidePart: Part, side: 'left' | 'right', withMinifix: boolean) {
  const source = `${GENERATED_DRAWER_SOURCE_PREFIX}${facadePart.id}:facade-minifix:${side}`;
  const sideFace = side === 'left' ? 'left' as const : 'right' as const;
  const localYOnSide = Math.max(18, Math.min(sidePart.height - 18, 20));
  const projectSideWorldXToFacadeX = (worldX: number) => {
    const facadeLocalX = worldX - (facadePart.position.x - facadePart.width / 2);
    return Math.max(8, Math.min(facadePart.width - 8, facadeLocalX));
  };
  const xOnFacade = projectSideWorldXToFacadeX(sidePart.position.x);
  const projectSideLocalYToFacadeY = (sideLocalY: number) => {
    const worldY = sidePart.position.y + sidePart.height / 2 - sideLocalY;
    const facadeLocalY = facadePart.position.y + facadePart.height / 2 - worldY;
    return Math.max(18, Math.min(facadePart.height - 18, facadeLocalY));
  };
  const referenceFacadeY = projectSideLocalYToFacadeY(localYOnSide);
  const connectorPinYOnFacade = referenceFacadeY;
  const dowelYOnSide = Math.max(18, Math.min(sidePart.height - 18, localYOnSide + 32));
  const dowelYOnFacade = projectSideLocalYToFacadeY(dowelYOnSide);
  const sideX = Math.max(9, Math.min(sidePart.thickness - 9, 32));
  return {
    facadeOps: [
      ...(withMinifix
        ? [createDrillOperation({
            source,
            face: 'back',
            axis: getFaceAxis('back'),
            x: xOnFacade,
            y: connectorPinYOnFacade,
            diameter: 5,
            depth: Math.min(12, facadePart.thickness),
            through: false,
            templateName: 'Drawer facade connector pin',
            feature: 'connector-pin',
          })]
        : []),
      createDrillOperation({
        source,
        face: 'back',
        axis: getFaceAxis('back'),
        x: xOnFacade,
        y: dowelYOnFacade,
        diameter: 8,
        depth: Math.min(12, facadePart.thickness),
        through: false,
        templateName: 'Drawer facade dowel',
        feature: 'dowel',
      }),
    ],
    sideOps: [
      ...(withMinifix
        ? [
            createDrillOperation({
              source,
              face: sideFace,
              axis: getFaceAxis(sideFace),
              x: sideX,
              y: localYOnSide,
              diameter: 15,
              depth: Math.min(12, sidePart.width),
              through: false,
              templateName: 'Drawer facade cam housing',
              feature: 'cam-housing',
            }),
            createDrillOperation({
              source,
              face: 'front',
              axis: getFaceAxis('front'),
              x: sidePart.width / 2,
              y: localYOnSide,
              diameter: 8,
              depth: Math.min(30, sidePart.thickness),
              through: false,
              templateName: 'Top connector pin',
              feature: 'connector-pin',
            }),
          ]
        : []),
      createDrillOperation({
        source,
        face: 'front',
        axis: getFaceAxis('front'),
        x: sidePart.width / 2,
        y: dowelYOnSide,
        diameter: 8,
        depth: Math.min(12, sidePart.thickness),
        through: false,
        templateName: 'Drawer facade dowel',
        feature: 'dowel',
      }),
    ],
  };
}

function createDrawerBottomFacadeMinifixOps(facadePart: Part, bottomPart: Part) {
  const source = `${GENERATED_DRAWER_SOURCE_PREFIX}${facadePart.id}:bottom-facade-minifix`;
  const commonWidth = Math.min(facadePart.width, bottomPart.width);
  const worldXOffsets = [
    facadePart.position.x - commonWidth / 4,
    facadePart.position.x + commonWidth / 4,
  ];
  const xOffsets = worldXOffsets.map((worldX) =>
    Math.max(34, Math.min(facadePart.width - 34, worldX - (facadePart.position.x - facadePart.width / 2)))
  );
  const bottomXOffsets = worldXOffsets.map((worldX) =>
    Math.max(34, Math.min(bottomPart.width - 34, worldX - (bottomPart.position.x - bottomPart.width / 2)))
  );
  const yOnFacade = Math.max(34, Math.min(facadePart.height - 32, facadePart.height - 32 - DRAWER_BOX_LIFT_RELATIVE_TO_FACADE));
  return {
    facadeOps: xOffsets.map((x) =>
      createDrillOperation({
        source,
        face: 'back',
        axis: getFaceAxis('back'),
        x,
        y: yOnFacade,
        diameter: 5,
        depth: Math.min(12, facadePart.thickness),
        through: false,
        templateName: 'Drawer bottom connector pin',
        feature: 'connector-pin',
      })
    ),
    bottomOps: bottomXOffsets.map((x) =>
      createDrillOperation({
        source,
        face: 'bottom',
        axis: getFaceAxis('bottom'),
        x,
        y: Math.max(34, Math.min(bottomPart.thickness - 34, 34)),
        diameter: 15,
        depth: Math.min(12, bottomPart.height),
        through: false,
        templateName: 'Drawer bottom cam housing',
        feature: 'cam-housing',
      })
    ).concat(
      bottomXOffsets.map((x) =>
        createDrillOperation({
          source,
          face: 'front',
          axis: getFaceAxis('front'),
          x,
          y: bottomPart.height / 2,
          diameter: 8,
          depth: Math.min(30, bottomPart.thickness),
          through: false,
          templateName: 'Drawer bottom connector pin',
          feature: 'connector-pin',
        })
      )
    ),
  };
}

function createDrawerWallBottomConfirmatOps(wallPart: Part, bottomPart: Part, wallKey: 'back' | 'inner-front') {
  const source = `${GENERATED_DRAWER_SOURCE_PREFIX}${wallPart.id}:bottom-confirmat`;
  const xOffsets = [wallPart.width / 4, wallPart.width * 3 / 4];
  const wallCenterLocalZOnBottom = wallPart.position.z - bottomPart.position.z;
  const yOnBottom = Math.max(
    8,
    Math.min(bottomPart.thickness - 8, bottomPart.thickness / 2 - wallCenterLocalZOnBottom)
  );
  const templateName = wallKey === 'back' ? 'Drawer back bottom confirmat' : 'Drawer inner front bottom confirmat';
  return {
    bottomOps: xOffsets.map((x) =>
      createDrillOperation({
        source,
        face: 'bottom',
        axis: getFaceAxis('bottom'),
        x: Math.max(8, Math.min(bottomPart.width - 8, x)),
        y: yOnBottom,
        diameter: CONFIRMAT_HEAD_DIAMETER,
        depth: Math.min(CONFIRMAT_HEAD_DEPTH, bottomPart.height),
        through: false,
        templateName,
        feature: 'confirmat',
      })
    ),
    backOps: xOffsets.map((x) =>
      createDrillOperation({
        source,
        face: 'bottom',
        axis: getFaceAxis('bottom'),
        x: Math.max(8, Math.min(wallPart.width - 8, x)),
        y: wallPart.thickness / 2,
        diameter: CONFIRMAT_THREAD_DIAMETER,
        depth: Math.min(CONFIRMAT_THREAD_DEPTH, wallPart.height),
        through: false,
        templateName,
        feature: 'confirmat',
      })
    ),
  };
}

function createDrawerSideBottomConfirmatOps(sidePart: Part, bottomPart: Part, side: 'left' | 'right') {
  const source = `${GENERATED_DRAWER_SOURCE_PREFIX}${sidePart.id}:bottom-confirmat`;
  const sideFace = side === 'left' ? 'left' as const : 'right' as const;
  const bottomFace = side === 'left' ? 'left' as const : 'right' as const;
  const xOffsets = [sidePart.thickness / 4, sidePart.thickness * 3 / 4];
  const sideY = Math.max(
    8,
    Math.min(sidePart.height - 8, sidePart.height / 2 - (bottomPart.position.y - sidePart.position.y))
  );
  const projectSideDepthToBottomDepth = (xOnSide: number) => {
    const worldZ = sidePart.position.z + sidePart.thickness / 2 - xOnSide;
    return Math.max(
      8,
      Math.min(bottomPart.thickness - 8, bottomPart.thickness / 2 - (worldZ - bottomPart.position.z))
    );
  };
  const templateName = 'Drawer side bottom confirmat';
  return {
    sideOps: xOffsets.map((x) =>
      createDrillOperation({
        source,
        face: sideFace,
        axis: getFaceAxis(sideFace),
        x: Math.max(8, Math.min(sidePart.thickness - 8, x)),
        y: sideY,
        diameter: CONFIRMAT_HEAD_DIAMETER,
        depth: Math.min(CONFIRMAT_HEAD_DEPTH, sidePart.width),
        through: false,
        templateName,
        feature: 'confirmat',
      })
    ),
    bottomOps: xOffsets.map((x) =>
      createDrillOperation({
        source,
        face: bottomFace,
        axis: getFaceAxis(bottomFace),
        x: projectSideDepthToBottomDepth(x),
        y: bottomPart.height / 2,
        diameter: CONFIRMAT_THREAD_DIAMETER,
        depth: Math.min(CONFIRMAT_THREAD_DEPTH, bottomPart.width),
        through: false,
        templateName,
        feature: 'confirmat',
      })
    ),
  };
}

function getTopPanelGeometry(
  width: number,
  depth: number,
  thickness: number,
  _withBackPanel: boolean,
  topMode: CabinetTopMode,
  position: { x: number; y: number; z: number },
  innerWidth: number,
  _innerDepth: number,
  bodyHeight: number,
  bodyBaseY: number
) {
  return topMode === 'overlay'
    ? {
        width,
        depth,
        y: bodyBaseY + bodyHeight - thickness / 2,
        z: position.z,
      }
    : {
        width: innerWidth,
        depth,
        y: bodyBaseY + bodyHeight - thickness / 2,
        z: position.z,
      };
}

function getSidePanelGeometry(
  height: number,
  thickness: number,
  topMode: CabinetTopMode,
  position: { x: number; y: number; z: number }
) {
  const overlayReduction = topMode === 'overlay' ? thickness : 0;
  const sideHeight = Math.max(100, height - overlayReduction);
  return {
    height: sideHeight,
    y: position.y + sideHeight / 2,
  };
}

function getBackApronZ(position: { x: number; y: number; z: number }, depth: number, thickness: number) {
  return position.z - depth / 2 + thickness / 2;
}

function makeSectionBackPanelKey(tierId: string, sectionId: string, zoneId?: string) {
  return zoneId ? `section-back-panel:${tierId}:${sectionId}:${zoneId}` : `section-back-panel:${tierId}:${sectionId}`;
}

function parseSectionBackPanelKey(sourceId?: string | null) {
  if (!sourceId?.startsWith('section-back-panel:')) return null;
  const [, tierId, sectionId, ...zoneParts] = sourceId.split(':');
  const zoneId = zoneParts.length > 0 ? zoneParts.join(':') : undefined;
  return tierId && sectionId ? { tierId, sectionId, zoneId } : null;
}

function hasSectionBackPanel(options: Pick<CabinetOptions, 'backPanelSections'>, tierId: string, sectionId: string) {
  return options.backPanelSections.includes(makeSectionBackPanelKey(tierId, sectionId));
}

function makeTierFrontKey(tierId: string, sectionId?: string, zoneId?: string) {
  return sectionId
    ? zoneId
      ? `tier-front:${tierId}:${sectionId}:${zoneId}`
      : `tier-front:${tierId}:${sectionId}`
    : `tier-front:${tierId}`;
}

function parseTierFrontKey(sourceId?: string | null) {
  if (!sourceId?.startsWith('tier-front:')) return null;
  const [, tierId, sectionId, ...zoneParts] = sourceId.split(':');
  return tierId ? { tierId, sectionId: sectionId || undefined, zoneId: zoneParts.length > 0 ? zoneParts.join(':') : undefined } : null;
}

function clampMinifixOffset(span: number) {
  return Math.max(9, Math.min(span - 9, MINIFIX_CENTER_OFFSET));
}

function getTopRailMinifixPositions(frontRailWidth: number, supportRailWidth: number) {
  const inset = Math.max(0, (frontRailWidth - supportRailWidth) / 2);
  const edgeInset = Math.max(0, Math.min(supportRailWidth / 2, TOP_RAIL_MINIFIX_EDGE_OFFSET));
  const start = inset + edgeInset;
  const end = frontRailWidth - inset - edgeInset;
  const span = Math.max(0, end - start);

  if (span <= 0) return [frontRailWidth / 2];
  if (span <= TOP_RAIL_MINIFIX_SPACING) return [start, end];

  const connectorCount = Math.ceil(span / TOP_RAIL_MINIFIX_SPACING) + 1;
  const step = span / (connectorCount - 1);
  return Array.from({ length: connectorCount }, (_, index) => start + step * index);
}

function createCrownMinifixOps(frontRail: Part, supportRail: Part, xOnFront: number, index: number) {
  const source = `${GENERATED_CROWN_SOURCE_PREFIX}${frontRail.id}:${index}`;
  const frontY = Math.max(0, frontRail.height - TOP_RAIL_CONNECTOR_PIN_BOTTOM_OFFSET);
  const supportWorldX = frontRail.position.x - frontRail.width / 2 + xOnFront;
  const supportX = supportWorldX - (supportRail.position.x - supportRail.width / 2);
  const supportFrontY = Math.max(0, supportRail.height - TOP_RAIL_CONNECTOR_PIN_BOTTOM_OFFSET);
  const supportY = clampMinifixOffset(supportRail.thickness);

  return {
    frontOps: [
      createDrillOperation({
        source,
        face: 'back',
        axis: getFaceAxis('back'),
        x: xOnFront,
        y: frontY,
        diameter: 5,
        depth: Math.min(12, frontRail.thickness),
        through: false,
        templateName: `Top rail connector pin ${index + 1}`,
        feature: 'connector-pin',
      }),
    ],
    supportOps: [
      createDrillOperation({
        source,
        face: 'top',
        axis: getFaceAxis('top'),
        x: supportX,
        y: supportY,
        diameter: 15,
        depth: Math.min(12, supportRail.height),
        through: false,
        templateName: `Top rail cam housing ${index + 1}`,
        feature: 'cam-housing',
      }),
      createDrillOperation({
        source,
        face: 'front',
        axis: getFaceAxis('front'),
        x: supportX,
        y: supportFrontY,
        diameter: 8,
        depth: Math.min(30, supportRail.thickness),
        through: false,
        templateName: `Top rail connector channel ${index + 1}`,
        feature: 'connector-pin',
      }),
    ],
  };
}

function createPlinthSideDowelOps(sidePart: Part, railPart: Part, side: 'left' | 'right', node: 'front' | 'back') {
  const source = `${GENERATED_PLINTH_SOURCE_PREFIX}${railPart.id}:${side}:${node}:dowel`;
  const sideFace = side === 'left' ? 'right' : 'left';
  const railFace = side === 'left' ? 'left' : 'right';
  const zOffset = node === 'front' ? sidePart.width / 2 : sidePart.thickness - sidePart.width / 2;
  const sideCenterY = sidePart.height / 2 - (railPart.position.y - sidePart.position.y);
  const edgeOffset = Math.min(12, railPart.height / 4);
  const yPositions = [sideCenterY - edgeOffset, sideCenterY + edgeOffset];
  const railYPositions = [railPart.height / 2 - edgeOffset, railPart.height / 2 + edgeOffset];

  return {
    sideOps: yPositions.map((y) =>
      createDrillOperation({
        source,
        face: sideFace,
        axis: getFaceAxis(sideFace),
        x: zOffset,
        y,
        diameter: 8,
        depth: Math.min(12, sidePart.width),
        through: false,
        templateName: 'Plinth dowel',
        feature: 'dowel',
      })
    ),
    railOps: railYPositions.map((y) =>
      createDrillOperation({
        source,
        face: railFace,
        axis: getFaceAxis(railFace),
        x: railPart.thickness / 2,
        y,
        diameter: 8,
        depth: Math.min(18, railPart.width),
        through: false,
        templateName: 'Plinth dowel',
        feature: 'dowel',
      })
    ),
  };
}

function createPlinthBraceMinifixOps(frontRail: Part, backRail: Part, brace: Part) {
  const source = `${GENERATED_PLINTH_SOURCE_PREFIX}${brace.id}:brace`;
  const frontX = brace.position.x - frontRail.position.x + frontRail.width / 2;
  const backX = brace.position.x - backRail.position.x + backRail.width / 2;
  const camFace = brace.position.x >= frontRail.position.x ? 'left' : 'right';
  const frontCamX = Math.max(0, Math.min(brace.thickness, MINIFIX_CENTER_OFFSET));
  const backCamX = Math.max(0, Math.min(brace.thickness, brace.thickness - MINIFIX_CENTER_OFFSET));
  const braceCenterY = brace.height / 2;
  const halfPairSpacing = Math.max(8, PLINTH_MINIFIX_DOWEL_SPACING / 2);
  const connectorY = Math.max(9, Math.min(brace.height - 9, braceCenterY - halfPairSpacing));
  const dowelY = Math.max(9, Math.min(brace.height - 9, braceCenterY + halfPairSpacing));
  const braceEdgeX = brace.width / 2;

  return {
    frontOps: [
      createDrillOperation({
        source,
        face: 'back',
        axis: getFaceAxis('back'),
        x: frontX,
        y: connectorY,
        diameter: MINIFIX_CONNECTOR_PIN_DIAMETER,
        depth: Math.min(MINIFIX_CONNECTOR_PIN_DEPTH, frontRail.thickness),
        through: false,
        templateName: 'Plinth brace connector pin',
        feature: 'connector-pin',
      }),
      createDrillOperation({
        source,
        face: 'back',
        axis: getFaceAxis('back'),
        x: frontX,
        y: dowelY,
        diameter: PLINTH_DOWEL_DIAMETER,
        depth: Math.min(PLINTH_DOWEL_DEPTH, frontRail.thickness),
        through: false,
        templateName: 'Plinth brace dowel',
        feature: 'dowel',
      }),
    ],
    backOps: [
      createDrillOperation({
        source,
        face: 'front',
        axis: getFaceAxis('front'),
        x: backX,
        y: connectorY,
        diameter: MINIFIX_CONNECTOR_PIN_DIAMETER,
        depth: Math.min(MINIFIX_CONNECTOR_PIN_DEPTH, backRail.thickness),
        through: false,
        templateName: 'Plinth brace connector pin',
        feature: 'connector-pin',
      }),
      createDrillOperation({
        source,
        face: 'front',
        axis: getFaceAxis('front'),
        x: backX,
        y: dowelY,
        diameter: PLINTH_DOWEL_DIAMETER,
        depth: Math.min(PLINTH_DOWEL_DEPTH, backRail.thickness),
        through: false,
        templateName: 'Plinth brace dowel',
        feature: 'dowel',
      }),
    ],
    braceOps: [
      createDrillOperation({
        source,
        face: camFace,
        axis: getFaceAxis(camFace),
        x: frontCamX,
        y: connectorY,
        diameter: 15,
        depth: Math.min(12, brace.width),
        through: false,
        templateName: 'Plinth brace minifix front',
        feature: 'cam-housing',
      }),
      createDrillOperation({
        source,
        face: 'front',
        axis: getFaceAxis('front'),
        x: braceEdgeX,
        y: connectorY,
        diameter: MINIFIX_CONNECTOR_CHANNEL_DIAMETER,
        depth: Math.min(MINIFIX_CONNECTOR_CHANNEL_DEPTH, brace.thickness),
        through: false,
        templateName: 'Plinth brace connector channel front',
        feature: 'connector-pin',
      }),
      createDrillOperation({
        source,
        face: 'front',
        axis: getFaceAxis('front'),
        x: braceEdgeX,
        y: dowelY,
        diameter: PLINTH_DOWEL_DIAMETER,
        depth: Math.min(PLINTH_DOWEL_DEPTH, brace.thickness),
        through: false,
        templateName: 'Plinth brace dowel front',
        feature: 'dowel',
      }),
      createDrillOperation({
        source,
        face: camFace,
        axis: getFaceAxis(camFace),
        x: backCamX,
        y: connectorY,
        diameter: 15,
        depth: Math.min(12, brace.width),
        through: false,
        templateName: 'Plinth brace minifix back',
        feature: 'cam-housing',
      }),
      createDrillOperation({
        source,
        face: 'back',
        axis: getFaceAxis('back'),
        x: braceEdgeX,
        y: connectorY,
        diameter: MINIFIX_CONNECTOR_CHANNEL_DIAMETER,
        depth: Math.min(MINIFIX_CONNECTOR_CHANNEL_DEPTH, brace.thickness),
        through: false,
        templateName: 'Plinth brace connector channel back',
        feature: 'connector-pin',
      }),
      createDrillOperation({
        source,
        face: 'back',
        axis: getFaceAxis('back'),
        x: braceEdgeX,
        y: dowelY,
        diameter: PLINTH_DOWEL_DIAMETER,
        depth: Math.min(PLINTH_DOWEL_DEPTH, brace.thickness),
        through: false,
        templateName: 'Plinth brace dowel back',
        feature: 'dowel',
      }),
    ],
  };
}

function getPlinthBottomDowelOffsets(width: number) {
  if (width <= 0) return [];
  const dowelCount = Math.max(1, Math.ceil(width / PLINTH_TO_BOTTOM_MAX_DOWEL_SPACING) - 1);
  const gap = width / (dowelCount + 1);
  return Array.from({ length: dowelCount }, (_, index) => gap * (index + 1));
}

function createPlinthToBottomDowelOps(bottom: Part, rail: Part, node: 'front' | 'back') {
  const source = `${GENERATED_PLINTH_SOURCE_PREFIX}${rail.id}:bottom:${node}:dowel`;
  const xOffsets = getPlinthBottomDowelOffsets(bottom.width);
  const railFaceY = rail.thickness / 2;
  const bottomFaceY = node === 'front' ? rail.thickness / 2 : bottom.thickness - rail.thickness / 2;

  return {
    bottomOps: xOffsets.map((x) =>
      createDrillOperation({
        source,
        face: 'bottom',
        axis: getFaceAxis('bottom'),
        x,
        y: bottomFaceY,
        diameter: PLINTH_DOWEL_DIAMETER,
        depth: Math.min(PLINTH_DOWEL_DEPTH, bottom.height),
        through: false,
        templateName: 'Plinth to bottom dowel',
        feature: 'dowel',
      })
    ),
    railOps: xOffsets.map((x) =>
      createDrillOperation({
        source,
        face: 'top',
        axis: getFaceAxis('top'),
        x,
        y: railFaceY,
        diameter: PLINTH_DOWEL_DIAMETER,
        depth: Math.min(PLINTH_DOWEL_DEPTH, rail.height),
        through: false,
        templateName: 'Plinth to bottom dowel',
        feature: 'dowel',
      })
    ),
  };
}

function getPlinthBraceOffsetX(resolved: ReturnType<typeof resolveCabinetLayout>, partitionId: string) {
  const partitionIndex = resolved.partitions.findIndex((partition) => partition.id === partitionId);
  if (partitionIndex < 0) return 20;

  const leftSection = resolved.leafSections[partitionIndex] ?? null;
  const rightSection = resolved.leafSections[partitionIndex + 1] ?? null;
  const leftRawWidth = leftSection ? leftSection.endX - leftSection.startX : 0;
  const rightRawWidth = rightSection ? rightSection.endX - rightSection.startX : 0;

  if (rightRawWidth >= leftRawWidth) return 20;
  return -20;
}

export function getLeafSections(module: Pick<CabinetModuleState, 'layout' | 'width' | 'thickness'>): CabinetSection[] {
  return resolveCabinetTierLayouts(module.layout, getCabinetInnerWidth(module), module.thickness)
    .flatMap((tier) => tier.resolved.leafSections);
}

export function getLeafSectionInnerSpan(module: Pick<CabinetModuleState, 'thickness'>, section: CabinetSection) {
  return getSectionInnerSpan(section, module.thickness);
}

function getTierVerticalFrames(
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
    frontTierIds: [],
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
    frontTierIds: [],
    frontMode: 'inset',
    frontOpeningMode: 'handleless',
  });
  const frames = getTierVerticalFrames(module, bodyBaseY);
  return tierLayouts.flatMap((tier, tierIndex) => {
    if (tierId && tier.tierId !== tierId) return [];
    const frame = frames.find((item) => item.tierId === tier.tierId) ?? frames[tierIndex];
    const section = tier.resolved.leafSections.find((item) => item.id === sectionId);
    if (!frame || !section) return [];
    const dividers = tier.resolved.tierDividersBySection.get(sectionId) ?? [];
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

export function buildSimpleCabinet(input: CabinetBuildInput): Part[] {
  const {
    width,
    height,
    depth,
    thickness,
    shelfCount,
    partitionCount = 0,
    withBackPanel = false,
    frontType = 'none',
    frontCount,
    frontMode = 'overlay',
    topMode = 'overlay',
    position = { x: 0, y: 0, z: 0 },
    name = 'Cabinet',
  } = input;

  const normalizedStructure = normalizeBackPanelAprons(withBackPanel, getDefaultCabinetOptions(input));
  const options = normalizedStructure.options;
  const effectiveWithBackPanel = normalizedStructure.withBackPanel;
  const effectiveTopMode = resolveTopMode(topMode, options.withTopRails);
  const requestedFrontCount = clampFrontCount(frontCount ?? (frontType === 'double' ? 2 : 0));
  const groupId = input.groupId ?? createId('cab');
  const sourceLayout = input.layout ?? createCabinetLayout(partitionCount, shelfCount);
  const bodyBaseY = getBodyBaseY(position.y, options);
  const bodyHeight = getCabinetBodyHeight({ height, ...options });
  const bodyTopY = getBodyTopY(bodyBaseY, bodyHeight);
  const innerWidth = getCabinetInnerWidth({ width, thickness });
  const baseLayout = withDefaultSectionWidths(
    setCabinetTierCount(
      options.withTierDivider ? ensureTieredCabinetLayout(sourceLayout, innerWidth) : collapseTieredCabinetLayout(sourceLayout),
      options.tierCount,
      innerWidth
    ),
    innerWidth,
    thickness
  );
  const innerHeight = getCabinetInnerHeight({ height, thickness, ...options });
  const shouldApplyTierHeightPreset = options.withTierDivider && !input.layout && options.tierHeight > 0;
  const layout = shouldApplyTierHeightPreset
    ? applyTierHeightToLayout(baseLayout, innerHeight, thickness, options.tierHeight)
    : baseLayout;
  const innerDepth = getInnerDepth(depth, thickness, effectiveWithBackPanel);
  const cabinetCenterY = getCabinetCenterY(bodyBaseY, bodyHeight);
  const topPanel = getTopPanelGeometry(width, depth, thickness, effectiveWithBackPanel, effectiveTopMode, position, innerWidth, innerDepth, bodyHeight, bodyBaseY);
  const sidePanel = getSidePanelGeometry(height, thickness, effectiveTopMode, position);
  const resolved = resolveCabinetTierLayouts(layout, innerWidth, thickness);
  const bottomTierResolved = resolved[resolved.length - 1]?.resolved ?? resolveCabinetLayout(layout, innerWidth, thickness);
  const usesSingleBackPanel =
    effectiveWithBackPanel
    && (innerWidth <= BACK_PANEL_SPLIT_THRESHOLD
      || innerHeight <= BACK_PANEL_SPLIT_THRESHOLD
      || (resolved[0]?.resolved.leafSections.length ?? bottomTierResolved.leafSections.length) <= 1);
  const tierFrames = getTierVerticalFrames(
    {
      layout,
      height,
      thickness,
      withPlinth: options.withPlinth,
      plinthHeight: options.plinthHeight,
      withTopRails: options.withTopRails,
      topRailHeight: options.topRailHeight,
      position,
      withTierDivider: options.withTierDivider,
      tierCount: options.tierCount,
    },
    bodyBaseY
  );
  const parts: Part[] = [];

  const leftSide = createPanelPart({
    name: `${name}${NAME_SEP}${roleLabel('left-side')}`,
    width: thickness,
    height: sidePanel.height,
    thickness: depth,
    position: { x: position.x - width / 2 + thickness / 2, y: sidePanel.y, z: position.z },
    meta: {
      groupId,
      role: 'left-side',
      cabinetLayout: layout,
      cabinetOptions: {
        ...options,
        tierHeight: getResolvedTierHeights({
          layout,
          height,
          thickness,
          withPlinth: options.withPlinth,
          plinthHeight: options.plinthHeight,
          withTopRails: options.withTopRails,
          topRailHeight: options.topRailHeight,
        }).heights[0] ?? options.tierHeight,
        tierCount: options.tierCount,
        backPanelSections: [...options.backPanelSections],
        frontTierIds: [...options.frontTierIds],
        frontMode: options.frontMode,
        frontOpeningMode: options.frontOpeningMode,
      },
    },
  });
  const rightSide = createPanelPart({
    name: `${name}${NAME_SEP}${roleLabel('right-side')}`,
    width: thickness,
    height: sidePanel.height,
    thickness: depth,
    position: { x: position.x + width / 2 - thickness / 2, y: sidePanel.y, z: position.z },
    meta: { groupId, role: 'right-side' },
  });
  const bottom = createPanelPart({
    name: `${name}${NAME_SEP}${roleLabel('bottom')}`,
    width: innerWidth,
    height: thickness,
    thickness: depth,
    position: { x: position.x, y: bodyBaseY + thickness / 2, z: position.z },
    meta: { groupId, role: 'bottom' },
  });
  const top = createPanelPart({
    name: `${name}${NAME_SEP}${roleLabel('top')}`,
    width: topPanel.width,
    height: thickness,
    thickness: topPanel.depth,
    position: { x: position.x, y: topPanel.y, z: topPanel.z },
    meta: { groupId, role: 'top', joinery: createEmptySideJoinery() },
  });

  parts.push(leftSide, rightSide, bottom, top);

  let partitionIndex = 0;
  let shelfIndex = 0;
  let drawerIndex = 0;
  resolved.forEach((tierResolved, tierIndex) => {
    const frame = tierFrames.find((item) => item.tierId === tierResolved.tierId) ?? tierFrames[tierIndex];
    if (!frame) return;
    const tierPartitionPartIdByX = new Map<string, string>();
    tierResolved.resolved.partitions.forEach((partition) => {
      partitionIndex += 1;
      const partitionPart = createPanelPart({
        name: `${name}${NAME_SEP}${roleLabel('partition', partitionIndex)}`,
        width: thickness,
        height: frame.clearHeight,
        thickness: usesSingleBackPanel ? innerDepth : (effectiveWithBackPanel ? depth : innerDepth),
        position: {
          x: position.x + partition.x,
          y: frame.centerY,
          z: usesSingleBackPanel ? position.z + thickness / 2 : position.z,
        },
        meta: { groupId, role: 'partition', sourceId: partition.id },
      });
      parts.push(partitionPart);
      tierPartitionPartIdByX.set(partition.x.toFixed(3), partitionPart.id);
    });

    tierResolved.resolved.leafSections.forEach((section) => {
      const shelves = tierResolved.resolved.shelvesBySection.get(section.id) ?? [];
      const drawerStacks = tierResolved.resolved.drawersBySection.get(section.id) ?? [];
      const sectionTierDividers = tierResolved.resolved.tierDividersBySection.get(section.id) ?? [];
      const innerSpan = getSectionInnerSpan(section, thickness);
      const localZones = getLocalSectionZones(section.id, tierResolved.tierId, tierIndex, frame, thickness, sectionTierDividers);
      const leftSupportPartId = section.leftBoundary === 'outer'
        ? leftSide.id
        : tierPartitionPartIdByX.get(section.startX.toFixed(3));
      const rightSupportPartId = section.rightBoundary === 'outer'
        ? rightSide.id
        : tierPartitionPartIdByX.get(section.endX.toFixed(3));
      localZones.forEach((zone) => {
        const zoneShelves = shelves.filter((shelf) => (shelf.zoneId ?? localZones[localZones.length - 1]?.id ?? '') === zone.id);
        const drawerStack = drawerStacks.find((item) => (item.zoneId ?? localZones[0]?.id ?? '') === zone.id) ?? null;
        const step = zone.clearHeight / (zoneShelves.length + 1);
        zoneShelves.forEach((shelf, idx) => {
          shelfIndex += 1;
          parts.push(
            createPanelPart({
              name: `${name}${NAME_SEP}${roleLabel('shelf', shelfIndex)}`,
              width: Math.max(20, innerSpan.width),
              height: thickness,
              thickness: getInsetAdjustedDepth(innerDepth, frontMode),
              position: {
                x: position.x + innerSpan.centerX,
                y: zone.startY + step * (idx + 1),
                z: getInsetAdjustedCenterZ(position.z + (effectiveWithBackPanel ? thickness / 2 : 0), frontMode),
              },
              meta: {
                groupId,
                role: 'shelf',
                sourceId: shelf.id,
                parentSectionId: section.id,
                leftSupportPartId,
                rightSupportPartId,
                shelfDrillReferenceDepth: innerDepth,
              },
            })
          );
        });

        if (!drawerStack) return;
        const effectiveRunnerLength = getEffectiveDrawerRunnerLength(drawerStack, depth);
        const drawerGeometry = getDrawerGeometry(innerSpan.width, zone.clearHeight, drawerStack.drawerCount, effectiveRunnerLength, options.frontOpeningMode);
        const boxBottomInset = 24;
        const boxDepthCenterZ = position.z + depth / 2 - drawerGeometry.boxDepth / 2 - DRAWER_BOX_BACK_OFFSET;
        const totalFacadeHeight = drawerGeometry.facadeHeight * drawerStack.drawerCount;
        const bottomFacadeGap = options.frontOpeningMode === 'handles' ? HANDLED_FRONT_GAP : DRAWER_BOTTOM_FACADE_MIN_CLEARANCE;
        const sharedFacadeGap = Math.max(
          0,
          (zone.clearHeight - totalFacadeHeight - bottomFacadeGap) / Math.max(1, drawerStack.drawerCount)
        );
        for (let idx = 0; idx < drawerStack.drawerCount; idx += 1) {
          drawerIndex += 1;
          const stackIndexFromBottom = drawerStack.drawerCount - 1 - idx;
          const facadeBottomY = zone.startY + bottomFacadeGap + stackIndexFromBottom * (drawerGeometry.facadeHeight + sharedFacadeGap);
          const facadeCenterY = facadeBottomY + drawerGeometry.facadeHeight / 2;
          const boxBottomY = facadeCenterY - drawerGeometry.facadeHeight / 2 + boxBottomInset + DRAWER_BOX_LIFT_RELATIVE_TO_FACADE;
          const boxCenterY = boxBottomY + drawerGeometry.boxHeight / 2;
          const frontWallCenterY = boxBottomY + DRAWER_SIDE_BOTTOM_OVERHANG + drawerGeometry.frontBackHeight / 2;
          const backWallCenterY = frontWallCenterY + DRAWER_BACK_LIFT;
          const sideBottomY = boxBottomY - DRAWER_SIDE_BOTTOM_OVERHANG;
          const bottomCenterY = boxBottomY + thickness / 2;
          const frontFaceZ = position.z + depth / 2 - thickness / 2;
          const boxCenterX = position.x + innerSpan.centerX;
          const drawerSourceBase = `${drawerStack.id}:${idx}`;
          const drawerSideHeight = drawerGeometry.sideHeight + DRAWER_BOX_WALL_TOP_EXTENSION;
          const drawerBackHeight = drawerGeometry.frontBackHeight + DRAWER_BOX_WALL_TOP_EXTENSION;
          const drawerSideCenterY = sideBottomY + drawerGeometry.sideHeight / 2 + DRAWER_BOX_WALL_TOP_EXTENSION / 2;
          const drawerBackCenterY = backWallCenterY + DRAWER_BOX_WALL_TOP_EXTENSION / 2;
          const facadePart = createPanelPart({
            name: `${name}${NAME_SEP}${roleLabel('drawer-front', drawerIndex)}`,
            width: drawerGeometry.facadeWidth,
            height: drawerGeometry.facadeHeight,
            thickness,
            position: { x: boxCenterX, y: facadeCenterY, z: frontFaceZ },
            meta: { groupId, role: 'drawer-front', sourceId: `${drawerSourceBase}:front` },
          });
          const leftSidePart = createPanelPart({
            name: `${name}${NAME_SEP}${roleLabel('drawer-side-left', drawerIndex)}`,
            width: thickness,
            height: drawerSideHeight,
            thickness: drawerGeometry.boxDepth,
            position: { x: boxCenterX - drawerGeometry.boxWidth / 2 + thickness / 2, y: drawerSideCenterY, z: boxDepthCenterZ },
            meta: { groupId, role: 'drawer-side-left', sourceId: `${drawerSourceBase}:side-left` },
          });
          const rightSidePart = createPanelPart({
            name: `${name}${NAME_SEP}${roleLabel('drawer-side-right', drawerIndex)}`,
            width: thickness,
            height: drawerSideHeight,
            thickness: drawerGeometry.boxDepth,
            position: { x: boxCenterX + drawerGeometry.boxWidth / 2 - thickness / 2, y: drawerSideCenterY, z: boxDepthCenterZ },
            meta: { groupId, role: 'drawer-side-right', sourceId: `${drawerSourceBase}:side-right` },
          });
          const backPart = createPanelPart({
            name: `${name}${NAME_SEP}${roleLabel('drawer-back', drawerIndex)}`,
            width: Math.max(40, drawerGeometry.boxWidth - thickness * 2),
            height: drawerBackHeight,
            thickness,
            position: { x: boxCenterX, y: drawerBackCenterY, z: boxDepthCenterZ - drawerGeometry.boxDepth / 2 + thickness / 2 },
            meta: { groupId, role: 'drawer-back', sourceId: `${drawerSourceBase}:back` },
          });
          const shouldAutoCreateInnerFrontPart = drawerGeometry.facadeHeight > DRAWER_FRONT_PANEL_MIN_FACADE_HEIGHT;
          const hasInnerFrontPart = drawerStack.withInnerFrontPanel ?? shouldAutoCreateInnerFrontPart;
          const frontInnerPart = hasInnerFrontPart
            ? createPanelPart({
              name: `${name}${NAME_SEP}${roleLabel('drawer-inner-front', drawerIndex)}`,
              width: Math.max(40, drawerGeometry.boxWidth - thickness * 2),
              height: Math.max(20, drawerGeometry.frontBackHeight - 20),
              thickness,
              position: { x: boxCenterX, y: frontWallCenterY - 6, z: boxDepthCenterZ + drawerGeometry.boxDepth / 2 - thickness / 2 },
              meta: { groupId, role: 'drawer-inner-front', sourceId: `${drawerSourceBase}:inner-front` },
            })
            : null;
          const bottomPart = createPanelPart({
            name: `${name}${NAME_SEP}${roleLabel('drawer-bottom', drawerIndex)}`,
            width: Math.max(40, drawerGeometry.boxWidth - thickness * 2),
            height: thickness,
            thickness: Math.max(40, drawerGeometry.boxDepth - thickness * 2 + DRAWER_BOTTOM_EXTRA_DEPTH),
            position: { x: boxCenterX, y: bottomCenterY, z: boxDepthCenterZ + DRAWER_BOTTOM_EXTRA_DEPTH / 2 - 16 },
            meta: { groupId, role: 'drawer-bottom', sourceId: `${drawerSourceBase}:bottom` },
          });

          const leftBackConfirmat = createDrawerWallConfirmatOps(leftSidePart, backPart, 'left', 'back');
          const rightBackConfirmat = createDrawerWallConfirmatOps(rightSidePart, backPart, 'right', 'back');
          const leftFrontConfirmat = frontInnerPart
            ? createDrawerWallConfirmatOps(leftSidePart, frontInnerPart, 'left', 'inner-front')
            : { sideOps: [], wallOps: [] };
          const rightFrontConfirmat = frontInnerPart
            ? createDrawerWallConfirmatOps(rightSidePart, frontInnerPart, 'right', 'inner-front')
            : { sideOps: [], wallOps: [] };
          const leftFacadeMinifix = createDrawerFacadeMinifixOps(facadePart, leftSidePart, 'left', !hasInnerFrontPart);
          const rightFacadeMinifix = createDrawerFacadeMinifixOps(facadePart, rightSidePart, 'right', !hasInnerFrontPart);
          const bottomFacadeMinifix = !hasInnerFrontPart
            ? createDrawerBottomFacadeMinifixOps(facadePart, bottomPart)
            : { facadeOps: [], bottomOps: [] };
          const backBottomConfirmat = createDrawerWallBottomConfirmatOps(backPart, bottomPart, 'back');
          const frontBottomConfirmat = frontInnerPart
            ? createDrawerWallBottomConfirmatOps(frontInnerPart, bottomPart, 'inner-front')
            : { backOps: [], bottomOps: [] };
          const leftSideBottomConfirmat = createDrawerSideBottomConfirmatOps(leftSidePart, bottomPart, 'left');
          const rightSideBottomConfirmat = createDrawerSideBottomConfirmatOps(rightSidePart, bottomPart, 'right');

          parts.push(
            {
              ...facadePart,
              operations: [...facadePart.operations, ...leftFacadeMinifix.facadeOps, ...rightFacadeMinifix.facadeOps, ...bottomFacadeMinifix.facadeOps],
            },
            {
              ...leftSidePart,
              operations: [...leftSidePart.operations, ...leftBackConfirmat.sideOps, ...leftFrontConfirmat.sideOps, ...leftFacadeMinifix.sideOps, ...leftSideBottomConfirmat.sideOps],
            },
            {
              ...rightSidePart,
              operations: [...rightSidePart.operations, ...rightBackConfirmat.sideOps, ...rightFrontConfirmat.sideOps, ...rightFacadeMinifix.sideOps, ...rightSideBottomConfirmat.sideOps],
            },
            {
              ...backPart,
              operations: [...backPart.operations, ...leftBackConfirmat.wallOps, ...rightBackConfirmat.wallOps, ...backBottomConfirmat.backOps],
            },
            ...(frontInnerPart
              ? [{
                  ...frontInnerPart,
                  operations: [...frontInnerPart.operations, ...leftFrontConfirmat.wallOps, ...rightFrontConfirmat.wallOps, ...frontBottomConfirmat.backOps],
                }]
              : []),
            {
              ...bottomPart,
              operations: [
                ...bottomPart.operations,
                ...bottomFacadeMinifix.bottomOps,
                ...backBottomConfirmat.bottomOps,
                ...frontBottomConfirmat.bottomOps,
                ...leftSideBottomConfirmat.bottomOps,
                ...rightSideBottomConfirmat.bottomOps,
              ],
            }
          );
        }
      });
      const sortedSectionTierDividers = getSortedSectionTierDividers(sectionTierDividers);
      const dividerCenters = getLocalSectionDividerCenters(frame, thickness, sortedSectionTierDividers);
      sortedSectionTierDividers.forEach((divider, dividerIndex) => {
        parts.push(
          createPanelPart({
            name: `${name}${NAME_SEP}Tier divider ${dividerIndex + 1}`,
            width: Math.max(20, innerSpan.width),
            height: thickness,
            thickness: getTierDividerDepth(depth, effectiveWithBackPanel, frontMode, requestedFrontCount),
            position: {
              x: position.x + innerSpan.centerX,
              y: dividerCenters[dividerIndex] ?? frame.centerY,
              z: getTierDividerCenterZ(position.z, effectiveWithBackPanel, frontMode, requestedFrontCount),
            },
            meta: { groupId, role: 'tier-divider', sourceId: divider.id, joinery: createEmptySideJoinery() },
          })
        );
      });
    });
  });

    tierFrames.slice(0, -1).forEach((frame, idx) => {
      const tierDividerDepth = getTierDividerDepth(depth, effectiveWithBackPanel, frontMode, requestedFrontCount);
      parts.push(
        createPanelPart({
          name: `${name}${NAME_SEP}Tier divider ${idx + 1}`,
          width: innerWidth,
          height: thickness,
          thickness: tierDividerDepth,
          position: {
            x: position.x,
            y: frame.startY - thickness / 2,
            z: getTierDividerCenterZ(position.z, effectiveWithBackPanel, frontMode, requestedFrontCount),
          },
          meta: { groupId, role: 'tier-divider', sourceId: `tier-divider:${frame.tierId}`, joinery: createEmptySideJoinery() },
        })
      );
  });

  if (options.withAprons) {
    let apronIndex = 0;
    const backApronZ = getBackApronZ(position, depth, thickness);
    const createApron = (sectionId: string, width: number, centerX: number, y: number, hostKey: string) => {
      if (width < APRON_MIN_WIDTH) return;
      apronIndex += 1;
      parts.push(
        createPanelPart({
          name: `${name}${NAME_SEP}${roleLabel('apron', apronIndex)}`,
          width,
          height: APRON_HEIGHT,
          thickness,
          position: { x: position.x + centerX, y, z: backApronZ },
          meta: { groupId, role: 'apron', sourceId: hostKey },
        })
      );
    };

    resolved.forEach((tierResolved, tierIndex) => {
      const frame = tierFrames.find((item) => item.tierId === tierResolved.tierId) ?? tierFrames[tierIndex];
      if (!frame) return;
      tierResolved.resolved.leafSections.forEach((section) => {
        const innerSpan = getSectionInnerSpan(section, thickness);
        if (tierIndex === resolved.length - 1) {
          if (hasSectionBackPanel(options, tierResolved.tierId, section.id)) return;
          createApron(section.id, innerSpan.width, innerSpan.centerX, bottom.position.y + bottom.height / 2 + APRON_HEIGHT / 2, `bottom:${section.id}`);
        }
        if (tierIndex === 0) {
          if (hasSectionBackPanel(options, tierResolved.tierId, section.id)) return;
          createApron(section.id, innerSpan.width, innerSpan.centerX, top.position.y - top.height / 2 - APRON_HEIGHT / 2, `top:${section.id}`);
        }
        const shelves = tierResolved.resolved.shelvesBySection.get(section.id) ?? [];
        shelves.forEach((shelf) => {
          const shelfPart = parts.find((part) => part.meta?.role === 'shelf' && part.meta?.sourceId === shelf.id);
          if (!shelfPart) return;
          if (hasSectionBackPanel(options, tierResolved.tierId, section.id)) return;
          createApron(section.id, innerSpan.width, innerSpan.centerX, shelfPart.position.y - shelfPart.height / 2 - APRON_HEIGHT / 2, `shelf:${section.id}:${shelf.id}`);
        });
      });
    });
  }

  if (effectiveWithBackPanel) {
    const backPanelSegments = getBackPanelSegments(resolved[0]?.resolved ?? bottomTierResolved, innerWidth, innerHeight, thickness);
    backPanelSegments.forEach((segment, idx) => {
      parts.push(
        createPanelPart({
          name: `${name}${NAME_SEP}${roleLabel('back-panel')}${backPanelSegments.length > 1 ? ` ${idx + 1}` : ''}`,
          width: segment.width,
          height: innerHeight,
          thickness,
          position: { x: position.x + segment.centerX, y: cabinetCenterY, z: position.z - depth / 2 + thickness / 2 },
          meta: { groupId, role: 'back-panel', sourceId: segment.id },
        })
      );
    });
  } else if (options.backPanelSections.length > 0) {
    resolved.forEach((tierResolved, tierIndex) => {
      const frame = tierFrames.find((item) => item.tierId === tierResolved.tierId) ?? tierFrames[tierIndex];
      if (!frame) return;
      tierResolved.resolved.leafSections.forEach((section) => {
        const innerSpan = getSectionInnerSpan(section, thickness);
        const sectionTierDividers = tierResolved.resolved.tierDividersBySection.get(section.id) ?? [];
        const localZones = getLocalSectionZones(section.id, tierResolved.tierId, tierIndex, frame, thickness, sectionTierDividers);
        const zoneKeys = localZones.map((zone) => makeSectionBackPanelKey(tierResolved.tierId, section.id, zone.id));
        const hasZonePanels = zoneKeys.some((key) => options.backPanelSections.includes(key));
        if (hasZonePanels) {
          localZones.forEach((zone) => {
            const sourceId = makeSectionBackPanelKey(tierResolved.tierId, section.id, zone.id);
            if (!options.backPanelSections.includes(sourceId)) return;
            parts.push(
              createPanelPart({
                name: `${name}${NAME_SEP}${roleLabel('back-panel')}`,
                width: Math.max(20, innerSpan.width),
                height: Math.max(20, zone.clearHeight),
                thickness,
                position: { x: position.x + innerSpan.centerX, y: zone.centerY, z: position.z - depth / 2 + thickness / 2 },
                meta: { groupId, role: 'back-panel', sourceId },
              })
            );
          });
          return;
        }
        const sourceId = makeSectionBackPanelKey(tierResolved.tierId, section.id);
        if (!options.backPanelSections.includes(sourceId)) return;
        parts.push(
          createPanelPart({
            name: `${name}${NAME_SEP}${roleLabel('back-panel')}`,
            width: Math.max(20, innerSpan.width),
            height: Math.max(20, frame.clearHeight),
            thickness,
            position: { x: position.x + innerSpan.centerX, y: frame.centerY, z: position.z - depth / 2 + thickness / 2 },
            meta: { groupId, role: 'back-panel', sourceId },
          })
        );
      });
    });
  }

  if (options.withPlinth) {
    const plinthFront = createPanelPart({
      name: `${name}${NAME_SEP}${roleLabel('plinth-front')}`,
      width: innerWidth,
      height: options.plinthHeight,
      thickness,
      position: { x: position.x, y: position.y + options.plinthHeight / 2, z: position.z + depth / 2 - thickness / 2 },
      meta: { groupId, role: 'plinth-front' },
    });
    const plinthBack = createPanelPart({
      name: `${name}${NAME_SEP}${roleLabel('plinth-back')}`,
      width: innerWidth,
      height: options.plinthHeight,
      thickness,
      position: { x: position.x, y: position.y + options.plinthHeight / 2, z: position.z - depth / 2 + thickness / 2 },
      meta: { groupId, role: 'plinth-back' },
    });
    const leftFrontDowels = createPlinthSideDowelOps(leftSide, plinthFront, 'left', 'front');
    const rightFrontDowels = createPlinthSideDowelOps(rightSide, plinthFront, 'right', 'front');
    const leftBackDowels = createPlinthSideDowelOps(leftSide, plinthBack, 'left', 'back');
    const rightBackDowels = createPlinthSideDowelOps(rightSide, plinthBack, 'right', 'back');
    const frontBottomDowels = createPlinthToBottomDowelOps(bottom, plinthFront, 'front');
    const backBottomDowels = createPlinthToBottomDowelOps(bottom, plinthBack, 'back');

    parts[0] = { ...leftSide, operations: [...leftSide.operations, ...leftFrontDowels.sideOps, ...leftBackDowels.sideOps] };
    parts[1] = { ...rightSide, operations: [...rightSide.operations, ...rightFrontDowels.sideOps, ...rightBackDowels.sideOps] };
    parts[2] = { ...bottom, operations: [...bottom.operations, ...frontBottomDowels.bottomOps, ...backBottomDowels.bottomOps] };
    parts.push(
      { ...plinthFront, operations: [...plinthFront.operations, ...leftFrontDowels.railOps, ...rightFrontDowels.railOps, ...frontBottomDowels.railOps] },
      { ...plinthBack, operations: [...plinthBack.operations, ...leftBackDowels.railOps, ...rightBackDowels.railOps, ...backBottomDowels.railOps] }
    );

    bottomTierResolved.partitions.forEach((partition, idx) => {
      const offsetToCenter = getPlinthBraceOffsetX(bottomTierResolved, partition.id);
      const brace = createPanelPart({
        name: `${name}${NAME_SEP}${roleLabel('plinth-brace', idx + 1)}`,
        width: thickness,
        height: options.plinthHeight,
        thickness: Math.max(thickness, depth - thickness * 2),
        position: {
          x: position.x + partition.x + offsetToCenter,
          y: position.y + options.plinthHeight / 2,
          z: position.z,
        },
        meta: { groupId, role: 'plinth-brace', sourceId: partition.id },
      });
      const braceJoinery = createPlinthBraceMinifixOps(
        parts.find((part) => part.meta?.role === 'plinth-front') ?? plinthFront,
        parts.find((part) => part.meta?.role === 'plinth-back') ?? plinthBack,
        brace
      );
      const currentFront = parts.find((part) => part.meta?.role === 'plinth-front') ?? plinthFront;
      const currentBack = parts.find((part) => part.meta?.role === 'plinth-back') ?? plinthBack;
      parts.splice(parts.indexOf(currentFront), 1, { ...currentFront, operations: [...currentFront.operations, ...braceJoinery.frontOps] });
      parts.splice(parts.indexOf(currentBack), 1, { ...currentBack, operations: [...currentBack.operations, ...braceJoinery.backOps] });
      parts.push({ ...brace, operations: [...brace.operations, ...braceJoinery.braceOps] });
    });
  }

  if (options.withTopRails) {
    const frontRail = createPanelPart({
      name: `${name}${NAME_SEP}${roleLabel('top-rail-front')}`,
      width,
      height: options.topRailHeight,
      thickness,
      position: { x: position.x, y: position.y + height - options.topRailHeight / 2, z: position.z + depth / 2 - thickness / 2 + CROWN_FORWARD_OFFSET },
      meta: { groupId, role: 'top-rail-front' },
    });
    const supportWidth = Math.max(thickness, frontRail.width - TOP_RAIL_SUPPORT_SHORTER_BY);
    const support = createPanelPart({
      name: `${name}${NAME_SEP}${roleLabel('top-rail-support')}`,
      width: supportWidth,
      height: thickness,
      thickness: options.topRailHeight,
      position: {
        x: position.x,
        y: top.position.y + top.height / 2 + thickness / 2,
        z: position.z + depth / 2 - options.topRailHeight / 2,
      },
      meta: { groupId, role: 'top-rail-support' },
    });
    const crownJoinery = getTopRailMinifixPositions(frontRail.width, support.width).map((xOnFront, index) =>
      createCrownMinifixOps(frontRail, support, xOnFront, index)
    );
    parts.push(
      {
        ...frontRail,
        operations: [...frontRail.operations, ...crownJoinery.flatMap((joinery) => joinery.frontOps)],
      },
      {
        ...support,
        operations: [...support.operations, ...crownJoinery.flatMap((joinery) => joinery.supportOps)],
      }
    );
  }

  if (requestedFrontCount > 0) {
    let frontIndex = 0;
    resolved.forEach((tierResolved, tierIndex) => {
      const frame = tierFrames.find((item) => item.tierId === tierResolved.tierId) ?? tierFrames[tierIndex];
      if (!frame) return;
      const tierLeafSections = tierResolved.resolved.leafSections;
      const sectionBased = tierLeafSections.length > 0 && tierLeafSections.length === requestedFrontCount;
      const sectionFronts = (() => {
        if (frontMode === 'overlay') {
          const weights = sectionBased
            ? tierLeafSections.map((section) => Math.max(1, section.width))
            : undefined;
          const widths = getOverlayFrontWidths(width, requestedFrontCount, options.frontOpeningMode, weights);
          const centers = getOverlayFrontCenters(width, widths, options.frontOpeningMode);
          return widths.map((nominalWidth, index) => {
            const closestSection = tierLeafSections
              .map((section) => ({ section, distance: Math.abs(section.centerX - centers[index]!) }))
              .sort((a, b) => a.distance - b.distance)[0]?.section;
            return {
              nominalWidth: Math.max(60, nominalWidth),
              centerX: centers[index] ?? 0,
              hingeSide: (index % 2 === 0 ? 'left' : 'right') as 'left' | 'right',
              sectionId: sectionBased ? tierLeafSections[index]?.id : closestSection?.id,
            };
          });
        }

        const doorGap = getFrontGaps(options.frontOpeningMode).middle;
        return sectionBased
          ? tierLeafSections.map((section, index) => {
              const span = getSectionInnerSpan(section, thickness);
              return {
                nominalWidth: Math.max(60, span.width - doorGap),
                centerX: span.centerX,
                hingeSide: (index % 2 === 0 ? 'left' : 'right') as 'left' | 'right',
                sectionId: section.id,
              };
            })
          : Array.from({ length: requestedFrontCount }, (_, index) => {
              const nominalWidth = Math.max(60, (innerWidth - doorGap * Math.max(0, requestedFrontCount - 1)) / Math.max(1, requestedFrontCount));
              const startX = -innerWidth / 2 + nominalWidth / 2 + index * (nominalWidth + doorGap);
              const closestSection = tierLeafSections
                .map((section) => ({ section, distance: Math.abs(getSectionInnerSpan(section, thickness).centerX - startX) }))
                .sort((a, b) => a.distance - b.distance)[0]?.section;
              return {
                nominalWidth,
                centerX: startX,
                hingeSide: (index % 2 === 0 ? 'left' : 'right') as 'left' | 'right',
                sectionId: closestSection?.id,
              };
            });
      })();

      sectionFronts.forEach((frontSpec, columnIndex) => {
        const frontZones = [{ id: undefined, frame }];
        frontZones.forEach((zone) => {
          frontIndex += 1;
          const vertical = getFrontVerticalPlacement({
            frontMode,
            clearHeight: zone.frame.clearHeight,
            centerY: zone.frame.centerY,
            endY: zone.frame.endY,
            withPlinth: options.withPlinth,
            isBottomTier: tierIndex === resolved.length - 1,
            isBottomZoneInTier: Math.abs(zone.frame.startY - frame.startY) < 0.001,
            tierIndex,
            tierCount: resolved.length,
            dividerThickness: thickness,
            floorY: position.y,
            frontOpeningMode: options.frontOpeningMode,
          });
          const frontGeometry = getFrontPanelGeometry(frontMode, depth, thickness, position, frontSpec.nominalWidth, vertical.nominalFrontHeight);
          const role = frontSpec.hingeSide === 'left' ? 'front-left' : 'front-right';
          parts.push(
            createPanelPart({
              name: `${name}${NAME_SEP}Front ${frontIndex}`,
              width: frontGeometry.width,
              height: frontGeometry.height,
              thickness,
              position: { x: position.x + frontSpec.centerX, y: vertical.centerY, z: frontGeometry.z },
              meta: { groupId, role, sourceId: makeMainFrontSourceId(tierResolved.tierId, columnIndex, frontSpec.hingeSide, frontSpec.sectionId, zone.id), hingeEdge: frontSpec.hingeSide },
            })
          );
        });
      });
    });
  }

  if (requestedFrontCount === 0 && options.frontTierIds.length > 0) {
    resolved.forEach((tierResolved, tierIndex) => {
      const frame = tierFrames.find((item) => item.tierId === tierResolved.tierId) ?? tierFrames[tierIndex];
      if (!frame) return;
      const tierKey = makeTierFrontKey(tierResolved.tierId);
      if (options.frontTierIds.includes(tierKey)) {
        const doorGap = getFrontGaps(options.frontOpeningMode).middle;
        const nominalDoorWidth = Math.max(60, innerWidth / 2 - doorGap / 2);
        const vertical = getFrontVerticalPlacement({
          frontMode,
          clearHeight: frame.clearHeight,
          centerY: frame.centerY,
          endY: frame.endY,
          withPlinth: options.withPlinth,
          isBottomTier: tierIndex === resolved.length - 1,
          isBottomZoneInTier: true,
          tierIndex,
          tierCount: resolved.length,
          dividerThickness: thickness,
          floorY: position.y,
          frontOpeningMode: options.frontOpeningMode,
        });
        const frontGeometry = getFrontPanelGeometry(frontMode, depth, thickness, position, nominalDoorWidth, vertical.nominalFrontHeight);
        const frontCenterY = vertical.centerY;
        parts.push(
          createPanelPart({
            name: `${name}${NAME_SEP}${roleLabel('front-left')}`,
            width: frontGeometry.width,
            height: frontGeometry.height,
            thickness,
            position: { x: position.x - nominalDoorWidth / 2 - doorGap / 2, y: frontCenterY, z: frontGeometry.z },
            meta: { groupId, role: 'front-left', sourceId: `${tierKey}:left`, hingeEdge: 'left' },
          }),
          createPanelPart({
            name: `${name}${NAME_SEP}${roleLabel('front-right')}`,
            width: frontGeometry.width,
            height: frontGeometry.height,
            thickness,
            position: { x: position.x + nominalDoorWidth / 2 + doorGap / 2, y: frontCenterY, z: frontGeometry.z },
            meta: { groupId, role: 'front-right', sourceId: `${tierKey}:right`, hingeEdge: 'right' },
          })
        );
      }
      tierResolved.resolved.leafSections.forEach((section) => {
        const sectionTierDividers = tierResolved.resolved.tierDividersBySection.get(section.id) ?? [];
        const localZones = getLocalSectionZones(section.id, tierResolved.tierId, tierIndex, frame, thickness, sectionTierDividers);
        const innerSpan = getSectionInnerSpan(section, thickness);
        localZones.forEach((zone) => {
          const zoneKey = makeTierFrontKey(tierResolved.tierId, section.id, zone.id);
          if (!options.frontTierIds.includes(zoneKey)) return;
          const doorGap = getFrontGaps(options.frontOpeningMode).middle;
          const nominalDoorWidth = Math.max(60, innerSpan.width / 2 - doorGap / 2);
          const vertical = getFrontVerticalPlacement({
            frontMode,
            clearHeight: zone.clearHeight,
            centerY: zone.centerY,
            endY: zone.endY,
            withPlinth: options.withPlinth,
            isBottomTier: tierIndex === resolved.length - 1,
            isBottomZoneInTier: Math.abs(zone.startY - frame.startY) < 0.001,
            tierIndex,
            tierCount: resolved.length,
            dividerThickness: thickness,
            floorY: position.y,
            frontOpeningMode: options.frontOpeningMode,
          });
          const frontGeometry = getFrontPanelGeometry(frontMode, depth, thickness, position, nominalDoorWidth, vertical.nominalFrontHeight);
          parts.push(
            createPanelPart({
              name: `${name}${NAME_SEP}${roleLabel('front-left')}`,
              width: frontGeometry.width,
              height: frontGeometry.height,
              thickness,
              position: { x: position.x + innerSpan.centerX - nominalDoorWidth / 2 - doorGap / 2, y: vertical.centerY, z: frontGeometry.z },
              meta: { groupId, role: 'front-left', sourceId: `${zoneKey}:left`, hingeEdge: 'left' },
            }),
            createPanelPart({
              name: `${name}${NAME_SEP}${roleLabel('front-right')}`,
              width: frontGeometry.width,
              height: frontGeometry.height,
              thickness,
              position: { x: position.x + innerSpan.centerX + nominalDoorWidth / 2 + doorGap / 2, y: vertical.centerY, z: frontGeometry.z },
              meta: { groupId, role: 'front-right', sourceId: `${zoneKey}:right`, hingeEdge: 'right' },
            })
          );
        });
      });
    });
  }

  return applyGeneratedJoinery(parts);
}

export function getCabinetModuleState(parts: Part[], groupId: string): CabinetModuleState | null {
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
  const depth = Math.max(left.thickness, top.thickness);
  const thickness = left.width;
  const frontTierIds = Array.from(new Set(
    group
      .filter((part) => part.meta?.role === 'front-left' || part.meta?.role === 'front-right')
      .flatMap((part) => {
        const item = parseTierFrontKey(part.meta?.sourceId);
        return item ? [makeTierFrontKey(item.tierId, item.sectionId, item.zoneId)] : [];
      })
  ));
  const mainFronts = group.filter((part) => (part.meta?.role === 'front-left' || part.meta?.role === 'front-right') && !parseTierFrontKey(part.meta?.sourceId));
  const frontType: CabinetFrontType = mainFronts.length > 0 ? 'double' : 'none';
  const parsedMainFronts = mainFronts
    .map((part) => parseMainFrontSourceId(part.meta?.sourceId))
    .filter((item): item is NonNullable<ReturnType<typeof parseMainFrontSourceId>> => Boolean(item));
  const parsedTierIndexSets = parsedMainFronts.reduce((acc, item) => {
    const tierKey = item.tierId ?? 'root';
    const existing = acc.get(tierKey) ?? new Set<number>();
    existing.add(item.index);
    acc.set(tierKey, existing);
    return acc;
  }, new Map<string, Set<number>>());
  const parsedPerTierCount = parsedTierIndexSets.size > 0
    ? Math.max(...Array.from(parsedTierIndexSets.values()).map((set) => set.size))
    : 0;
  const layoutForFrontCount = getLayoutCarrier(group)?.meta?.cabinetLayout
    ?? createCabinetLayout(
      group.filter((part) => part.meta?.role === 'partition').length,
      group.filter((part) => part.meta?.role === 'shelf').length
    );
  const tierCountForFallback = Math.max(1, getCabinetTierSpecs(layoutForFrontCount).length);
  const fallbackPerTierCount = Math.round(mainFronts.length / tierCountForFallback);
  const frontCount = clampFrontCount(
    parsedPerTierCount > 0
      ? parsedPerTierCount
      : fallbackPerTierCount
  );
  const innerWidth = Math.max(50, width - thickness * 2);
  const innerDepth = Math.max(50, depth - (hasBack ? thickness : 0));
  const detectedTopMode: CabinetTopMode = top.width > innerWidth + 0.001 || top.thickness > innerDepth + 0.001 ? 'overlay' : 'inset';
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
    withTopRails: carrierOptions?.withTopRails ?? Boolean(topRailFront),
    topRailHeight: carrierOptions?.topRailHeight ?? topRailFront?.height ?? DEFAULT_TOP_RAIL_HEIGHT,
    withAprons: carrierOptions?.withAprons ?? Boolean(apronPart),
    withTierDivider: carrierOptions?.withTierDivider ?? group.some((part) => part.meta?.role === 'tier-divider'),
    tierCount: carrierOptions?.tierCount ?? Math.max(1, getCabinetTierSpecs(layout).length),
    tierHeight: carrierOptions?.tierHeight ?? 0,
    backPanelSections: carrierOptions?.backPanelSections ?? sectionBackPanels,
    frontTierIds: carrierOptions?.frontTierIds ?? frontTierIds,
    frontMode: carrierOptions?.frontMode ?? frontModeFromGeometry,
    frontOpeningMode: carrierOptions?.frontOpeningMode ?? 'handleless',
  };
  const normalizedStructure = normalizeBackPanelAprons(hasBack, options);
  const normalizedOptions = normalizedStructure.options;
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
    frontType,
    frontCount,
    frontMode: normalizedOptions.frontMode,
    frontOpeningMode: normalizedOptions.frontOpeningMode,
    topMode: resolveTopMode(detectedTopMode, normalizedOptions.withTopRails),
    withPlinth: normalizedOptions.withPlinth,
    plinthHeight: normalizedOptions.plinthHeight,
    withTopRails: normalizedOptions.withTopRails,
    topRailHeight: normalizedOptions.topRailHeight,
    withAprons: normalizedOptions.withAprons,
    withTierDivider: normalizedOptions.withTierDivider,
    tierCount: normalizedOptions.tierCount,
    tierHeight: tierHeights.heights[0] ?? Math.round(tierHeights.clearTotal / Math.max(1, tierSpecs.length)),
    backPanelSections: normalizedOptions.backPanelSections,
    frontTierIds: normalizedOptions.frontTierIds,
    position,
    layout,
  };
}

export function rebuildCabinetGroup(parts: Part[], groupId: string, draft: Omit<CabinetModuleState, 'groupId'>): Part[] {
  const rebuilt = buildSimpleCabinet({ ...draft, groupId, layout: draft.layout });
  const existingGroup = parts.filter((part) => part.meta?.groupId === groupId);
  const hiddenFrontKeys = new Set(
    existingGroup
      .filter((part) => (part.meta?.role === 'front-left' || part.meta?.role === 'front-right') && part.meta?.hidden)
      .map((part) => {
        const tierFrontKey = parseTierFrontKey(part.meta?.sourceId);
        if (tierFrontKey) return `${part.meta?.role}:tier:${makeTierFrontKey(tierFrontKey.tierId, tierFrontKey.sectionId, tierFrontKey.zoneId)}`;
        const mainFrontKey = parseMainFrontSourceId(part.meta?.sourceId);
        if (mainFrontKey) return `${part.meta?.role}:main:${mainFrontKey.tierId ?? 'root'}:${mainFrontKey.index}`;
        return null;
      })
      .filter((item): item is string => Boolean(item))
  );
  return applyGeneratedJoinery(rebuilt.map((part) => {
    const existing = existingGroup.find((item) =>
      part.meta?.sourceId
        ? item.meta?.sourceId === part.meta.sourceId && item.meta?.role === part.meta?.role
        : item.meta?.role === part.meta?.role
    );
    const nextMeta = existing
      ? {
          ...existing.meta,
          ...part.meta,
          hingeEdge: existing.meta?.hingeEdge ?? part.meta?.hingeEdge,
        }
      : part.meta;
    const tierFrontKey = parseTierFrontKey(part.meta?.sourceId);
    const mainFrontKey = parseMainFrontSourceId(part.meta?.sourceId);
    const hiddenFrontKey = tierFrontKey
      ? `${part.meta?.role}:tier:${makeTierFrontKey(tierFrontKey.tierId, tierFrontKey.sectionId, tierFrontKey.zoneId)}`
      : mainFrontKey
        ? `${part.meta?.role}:main:${mainFrontKey.tierId ?? 'root'}:${mainFrontKey.index}`
        : null;
    return existing
      ? {
          ...part,
          id: existing.id,
          operations: mergeExistingAndBuiltOperations(existing.operations, part.operations),
          meta: hiddenFrontKey && hiddenFrontKeys.has(hiddenFrontKey)
            ? { ...nextMeta, hidden: true }
            : nextMeta,
        }
      : hiddenFrontKey && hiddenFrontKeys.has(hiddenFrontKey)
        ? { ...part, meta: { ...part.meta, hidden: true } }
        : part;
  }));
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

export function upsertDrawerStackInLayoutSection(
  module: CabinetModuleState,
  sectionId: string,
  drawerCount: number,
  runnerType: DrawerRunnerType,
  runnerLength: DrawerRunnerLength,
  tierId?: string,
  zoneId?: string,
  runnerLengthMode: DrawerRunnerLengthMode = 'manual'
) {
  return upsertDrawerStackInSection(module.layout, sectionId, drawerCount, runnerType, runnerLength, tierId, zoneId, runnerLengthMode);
}

export function removeCabinetElementFromLayout(module: CabinetModuleState, selectedPart: Part) {
  if (selectedPart.meta?.role === 'shelf' && selectedPart.meta?.sourceId) {
    return removeShelf(module.layout, selectedPart.meta.sourceId);
  }
  if (selectedPart.meta?.role === 'partition' && selectedPart.meta?.sourceId) {
    return removePartition(module.layout, selectedPart.meta.sourceId);
  }
  if (selectedPart.meta?.role === 'tier-divider' && selectedPart.meta?.sourceId && !selectedPart.meta.sourceId.startsWith('tier-divider:')) {
    return removeSectionTierDivider(module.layout, selectedPart.meta.sourceId);
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

export function updateCabinetSectionWidths(module: CabinetModuleState, widths: number[], sectionId?: string, tierId?: string) {
  return setLeafSectionWidths(module.layout, widths, getCabinetInnerWidth(module), sectionId, tierId);
}

export function addCabinetTierDividerToSection(module: CabinetModuleState, sectionId: string, tierId?: string) {
  return addSectionTierDividerToSection(module.layout, sectionId, tierId);
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

    const dividerCount = (tier.resolved.tierDividersBySection.get(divider.sectionId) ?? []).length;
    const clearSpan = Math.max(20, frame.clearHeight - dividerCount * module.thickness);
    const nextRatio = (nextCenterY - frame.startY - module.thickness / 2) / Math.max(clearSpan, 1);
    return updateSectionTierDividerPosition(module.layout, dividerSourceId, nextRatio);
  }

  return module.layout;
}
