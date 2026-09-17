// buildSimpleCabinet — сборка деталей корпуса по шагам (без автоприсадки): корпус здесь, остальное в build-*.ts.
import { type Part, createPanelPart } from '../part';
import { NAME_SEP } from './constants';
import { roleLabel } from './common';
import { getResolvedTierHeights } from './frames';
import { createEmptySideJoinery } from '../joinery';
import type { CabinetBuildInput } from './types';
import { buildApronParts, buildBackPanelParts } from './build-back-panels';
import { type CabinetBuildContext, createCabinetBuildContext } from './build-context';
import { buildFrontParts } from './build-fronts';
import { buildInteriorParts } from './build-interior';
import { buildPlinthParts, buildTopRailParts } from './build-plinth-rails';
import { buildBackRailParts } from './kitchen-plinth';

/** Боковины, дно и крыша. */
export function buildCarcassParts(ctx: CabinetBuildContext, parts: Part[]) {
  const { bodyBaseY, depth, effectiveTopMode, frontMode, groupId, height, innerWidth, layout, name, options, position, sidePanel, thickness, topPanel, width } = ctx;

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
  // A top over the fronts reaches forward by a front's thickness; overlay fronts then stop under it (see getFrontRect).
  const topFrontOverhang = options.topOverFronts && frontMode === 'overlay' && effectiveTopMode === 'overlay' ? thickness : 0;
  const top = createPanelPart({
    name: `${name}${NAME_SEP}${roleLabel('top')}`,
    width: topPanel.width,
    height: thickness,
    thickness: topPanel.depth + topFrontOverhang,
    position: { x: position.x, y: topPanel.y, z: topPanel.z + topFrontOverhang / 2 },
    // Always written (0 when off), so a rebuild never keeps a stale overhang from the old part.
    meta: { groupId, role: 'top', joinery: createEmptySideJoinery(), frontOverhang: topFrontOverhang },
  });

  parts.push(leftSide, rightSide, bottom, top);
  return { bottom, leftSide, rightSide, top, topFrontOverhang };
}

export type CabinetCarcass = ReturnType<typeof buildCarcassParts>;

export function buildSimpleCabinet(input: CabinetBuildInput): Part[] {
  const ctx = createCabinetBuildContext(input);
  const parts: Part[] = [];
  const full = { ...ctx, ...buildCarcassParts(ctx, parts) };
  buildInteriorParts(full, parts);
  buildBackPanelParts(full, parts);
  buildApronParts(full, parts);
  buildPlinthParts(full, parts);
  buildBackRailParts(full, parts);
  buildTopRailParts(full, parts);
  buildFrontParts(full, parts);
  // Auto joinery is applied once by the caller (rebuildCabinetGroup or the store), with the user's rules.
  return parts;
}
