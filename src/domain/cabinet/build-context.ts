// Контекст сборки: опции, габариты, раскладка и ярусы, общие для всех шагов.
import type { CabinetBuildInput } from './types';
import { getDefaultCabinetOptions, getBackInset, resolveTopMode, getBodyBaseY, getCabinetBodyHeight, getBodyTopY, getCabinetInnerWidth, withDefaultSectionWidths, getCabinetInnerHeight, getInnerDepth, getCabinetCenterY, getTopPanelGeometry, getSidePanelGeometry } from './common';
import { createId } from '../../shared/ids';
import { createCabinetLayout, setCabinetTierCount, ensureTieredCabinetLayout, collapseTieredCabinetLayout, resolveCabinetTierLayouts, resolveCabinetLayout } from '../cabinet-layout';
import { applyTierHeightToLayout, getTierVerticalFrames } from './frames';
import { withDefaultFronts } from './fronts';
import { BACK_PANEL_SPLIT_THRESHOLD } from './constants';

/** Всё, что шаги сборки берут из входа: опции, габариты, раскладка, ярусы. */
export function createCabinetBuildContext(input: CabinetBuildInput) {
  const {
    width,
    height,
    depth,
    thickness,
    shelfCount,
    partitionCount = 0,
    withBackPanel = false,
    frontMode = 'overlay',
    topMode = 'overlay',
    position = { x: 0, y: 0, z: 0 },
    name = 'Cabinet',
  } = input;

  const options = getDefaultCabinetOptions(input);
  const effectiveWithBackPanel = withBackPanel;
  const hdfBack = effectiveWithBackPanel && options.backPanelKind === 'hdf';
  const hdfOverlayBack = effectiveWithBackPanel && options.backPanelKind === 'hdf-overlay';
  const backInset = getBackInset(thickness, effectiveWithBackPanel, options.backPanelKind);
  const effectiveTopMode = resolveTopMode(topMode, options.withTopRails);
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
  const tieredLayout = shouldApplyTierHeightPreset
    ? applyTierHeightToLayout(baseLayout, innerHeight, thickness, options.tierHeight)
    : baseLayout;
  const layout = input.withFronts && !input.layout ? withDefaultFronts(tieredLayout, innerWidth, thickness) : tieredLayout;
  const innerDepth = getInnerDepth(depth, backInset);
  const cabinetCenterY = getCabinetCenterY(bodyBaseY, bodyHeight);
  const topPanel = getTopPanelGeometry(width, depth, thickness, effectiveWithBackPanel, effectiveTopMode, position, innerWidth, innerDepth, bodyHeight, bodyBaseY);
  const sidePanel = getSidePanelGeometry(height, thickness, effectiveTopMode, position);
  const resolved = resolveCabinetTierLayouts(layout, innerWidth, thickness);
  const bottomTierResolved = resolved[resolved.length - 1]?.resolved ?? resolveCabinetLayout(layout, innerWidth, thickness);
  // ХДФ всегда одним листом: перегородки стоят перед ней, а не делят её.
  const usesSingleBackPanel =
    effectiveWithBackPanel
    && (hdfBack
      || hdfOverlayBack
      || innerWidth <= BACK_PANEL_SPLIT_THRESHOLD
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
  return { backInset, bodyBaseY, bottomTierResolved, cabinetCenterY, depth, effectiveTopMode, effectiveWithBackPanel, frontMode, groupId, hdfBack, hdfOverlayBack, height, innerDepth, innerHeight, innerWidth, layout, name, options, position, resolved, sidePanel, thickness, tierFrames, topPanel, usesSingleBackPanel, width };
}

export type CabinetBuildContext = ReturnType<typeof createCabinetBuildContext>;
