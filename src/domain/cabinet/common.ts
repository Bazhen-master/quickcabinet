// Общие габариты корпуса: внутренние размеры, глубина за задней стенкой, опции по умолчанию, геометрия крыши и боковин.
import type { Part } from '../part';
import type { MachiningOperation } from '../drill';
import { type CabinetLayout, getCabinetTierSpecs } from '../cabinet-layout';
import { DEFAULT_PLINTH_HEIGHT, DEFAULT_TOP_RAIL_HEIGHT, GENERATED_CROWN_SOURCE_PREFIX, GENERATED_DRAWER_SOURCE_PREFIX, GENERATED_BACK_RAIL_SOURCE_PREFIX, GENERATED_GROOVE_SOURCE_PREFIX, GENERATED_PLINTH_SOURCE_PREFIX, HDF_GROOVE_BACK_OFFSET, HDF_GROOVE_WIDTH, INSET_FRONT_INTERNAL_RECESS } from './constants';
import type { CabinetBackPanelKind, CabinetBuildInput, CabinetFrontMode, CabinetModuleState, CabinetOptions, CabinetTopMode } from './types';

export function resolveTopMode(topMode: CabinetTopMode, withTopRails: boolean): CabinetTopMode {
  return withTopRails ? 'inset' : topMode;
}

export function roleLabel(role: string, index?: number) {
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
    case 'drawer-column': return `Drawer column divider ${index ?? 1}`;
    case 'drawer-false-panel': return `Drawer false panel ${index ?? 1}`;
    case 'partition': return `Partition ${index ?? 1}`;
    case 'apron': return `Apron ${index ?? 1}`;
    case 'back-rail': return `Back rail ${index ?? 1}`;
    case 'back-panel': return 'Back panel';
    case 'front-left': return 'Front left';
    case 'front-right': return 'Front right';
    case 'front-flap': return 'Front flap';
    case 'plinth-front': return 'Plinth front';
    case 'plinth-back': return 'Plinth back';
    case 'plinth-brace': return `Plinth brace ${index ?? 1}`;
    case 'top-rail-front': return 'Top rail front';
    case 'top-rail-support': return 'Top rail support';
    default: return 'Panel';
  }
}

export function getLayoutCarrier(parts: Part[]) {
  return parts.find((part) => part.meta?.role === 'left-side' && part.meta?.cabinetLayout);
}

export function getCabinetOptionsCarrier(parts: Part[]) {
  return parts.find((part) => part.meta?.role === 'left-side' && part.meta?.cabinetOptions);
}

function isBuilderGeneratedOp(source?: string) {
  return typeof source === 'string' && (source.startsWith(GENERATED_GROOVE_SOURCE_PREFIX) || source.startsWith(GENERATED_CROWN_SOURCE_PREFIX) || source.startsWith(GENERATED_PLINTH_SOURCE_PREFIX) || source.startsWith(GENERATED_DRAWER_SOURCE_PREFIX) || source.startsWith(GENERATED_BACK_RAIL_SOURCE_PREFIX));
}

export function mergeExistingAndBuiltOperations(existing: MachiningOperation[], built: MachiningOperation[]) {
  return [...existing.filter((op) => !isBuilderGeneratedOp(op.source)), ...built];
}

export function withDefaultSectionWidths(layout: CabinetLayout, innerWidth: number, thickness: number): CabinetLayout {
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

/** Сколько глубины забирает задняя стенка сзади: плита — свою толщину, ХДФ — до передней кромки паза, накладная ХДФ — ничего. */
export function getBackInset(thickness: number, withBackPanel: boolean, kind: CabinetBackPanelKind) {
  if (!withBackPanel || kind === 'hdf-overlay') return 0;
  return kind === 'hdf' ? HDF_GROOVE_BACK_OFFSET + HDF_GROOVE_WIDTH / 2 : thickness;
}

export function getInnerDepth(depth: number, backInset: number) {
  return Math.max(50, depth - backInset);
}

export function getBodyBaseY(baseY: number, options: Omit<CabinetOptions, 'backPanelKind' | 'withHangers' | 'plinthKind' | 'backRailElevations'>) {
  return baseY + (options.withPlinth ? options.plinthHeight : 0);
}

export function getBodyTopY(bodyBaseY: number, bodyHeight: number) {
  return bodyBaseY + bodyHeight;
}

export function getCabinetCenterY(bodyBaseY: number, bodyHeight: number) {
  return bodyBaseY + bodyHeight / 2;
}

export function getDefaultCabinetOptions(input: Pick<CabinetBuildInput, 'backPanelKind' | 'withHangers' | 'withPlinth' | 'plinthHeight' | 'plinthKind' | 'backRailElevations' | 'withTopRails' | 'topRailHeight' | 'withAprons' | 'withTierDivider' | 'tierCount' | 'tierHeight' | 'backPanelSections' | 'frontMode' | 'frontOpeningMode' | 'topOverFronts'>): CabinetOptions {
  const tierCount = Math.max(1, Math.round(input.tierCount ?? (input.withTierDivider ? 2 : 1)));
  return {
    withPlinth: input.withPlinth ?? false,
    plinthHeight: Math.max(40, input.plinthHeight ?? DEFAULT_PLINTH_HEIGHT),
    plinthKind: input.plinthKind ?? 'frame',
    backRailElevations: (input.backRailElevations ?? []).filter((value) => Number.isFinite(value) && value >= 0),
    withTopRails: input.withTopRails ?? false,
    topRailHeight: Math.max(20, input.topRailHeight ?? DEFAULT_TOP_RAIL_HEIGHT),
    withAprons: input.withAprons ?? false,
    withTierDivider: tierCount > 1,
    tierCount,
    tierHeight: Math.max(0, input.tierHeight ?? 0),
    backPanelSections: [...(input.backPanelSections ?? [])],
    backPanelKind: input.backPanelKind ?? 'panel',
    withHangers: input.withHangers ?? false,
    frontMode: (input as CabinetBuildInput).frontMode ?? 'overlay',
    frontOpeningMode: input.frontOpeningMode ?? 'handleless',
    // Top rails need an inset top, so they rule out a top over the fronts.
    topOverFronts: Boolean(input.topOverFronts) && !input.withTopRails,
  };
}

export function getInsetAdjustedDepth(depthValue: number, frontMode: CabinetFrontMode) {
  return frontMode === 'inset'
    ? Math.max(50, depthValue - INSET_FRONT_INTERNAL_RECESS)
    : depthValue;
}

export function getInsetAdjustedCenterZ(baseCenterZ: number, frontMode: CabinetFrontMode) {
  return frontMode === 'inset'
    ? baseCenterZ - INSET_FRONT_INTERNAL_RECESS / 2
    : baseCenterZ;
}

export function getTopPanelGeometry(
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

export function getSidePanelGeometry(
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
