// Шаг сборки: наполнение ярусов — перегородки, полки, блоки ящиков, делители.
import { type Part, createPanelPart, roundDownToMillimeter } from '../part';
import { NAME_SEP, DRAWER_BOX_BACK_OFFSET, HANDLED_FRONT_GAP, OVERLAY_FRONT_MIDDLE_GAP, DRAWER_BOTTOM_FACADE_MIN_CLEARANCE, DRAWER_BOX_LIFT_RELATIVE_TO_FACADE, DRAWER_BOX_HEIGHT_REDUCTION, DRAWER_FRONT_BACK_LOWER_BY, DRAWER_SIDE_BOTTOM_OVERHANG, DRAWER_BACK_LIFT, DRAWER_BOX_WALL_TOP_EXTENSION, DRAWER_FRONT_PANEL_MIN_FACADE_HEIGHT, DRAWER_BOTTOM_EXTRA_DEPTH } from './constants';
import { roleLabel, getInsetAdjustedDepth, getInsetAdjustedCenterZ } from './common';
import { getResolvedSectionDividers, getLocalSectionZones, getDrawerBlockZones, getSortedSectionTierDividers, getLocalSectionDividerCenters, getTierDividerDepth, getTierDividerCenterZ } from './frames';
import { getSectionInnerSpan, MAX_DRAWER_BLOCK_COLUMNS, OPENING_EDGE_BOTTOM, OPENING_EDGE_TOP } from '../cabinet-layout';
import { makeSectionBackPanelKey } from './back-panel';
import { createEmptySideJoinery } from '../joinery';
import { getEffectiveDrawerRunnerLength, getDrawerGeometry, createDrawerWallConfirmatOps, createDrawerFacadeMinifixOps, createDrawerBottomFacadeMinifixOps, createDrawerWallBottomConfirmatOps, createDrawerSideBottomConfirmatOps } from './drawers';
import { type CabinetOpening, getFrontRect } from './fronts';
import { getFloorClearance } from './build-fronts';
import type { CabinetCarcass } from './build';
import type { CabinetBuildContext } from './build-context';

/** Наполнение ярусов: перегородки, полки, ящики, делители. */
export function buildInteriorParts(ctx: CabinetBuildContext & CabinetCarcass, parts: Part[]) {
  const { backInset, bottom, depth, effectiveWithBackPanel, frontMode, groupId, height, innerDepth, innerWidth, leftSide, name, options, position, resolved, rightSide, thickness, tierFrames, topFrontOverhang, usesSingleBackPanel } = ctx;
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
          z: usesSingleBackPanel ? position.z + backInset / 2 : position.z,
        },
        meta: { groupId, role: 'partition', sourceId: partition.id },
      });
      parts.push(partitionPart);
      tierPartitionPartIdByX.set(partition.x.toFixed(3), partitionPart.id);
    });

    tierResolved.resolved.leafSections.forEach((section) => {
      const shelves = tierResolved.resolved.shelvesBySection.get(section.id) ?? [];
      const drawerStacks = tierResolved.resolved.drawersBySection.get(section.id) ?? [];
      const sectionTierDividers = getResolvedSectionDividers(tierResolved.resolved, section.id, frame, thickness);
      const innerSpan = getSectionInnerSpan(section, thickness);
      const localZones = getLocalSectionZones(section.id, tierResolved.tierId, tierIndex, frame, thickness, sectionTierDividers);
      const blockZones = getDrawerBlockZones(localZones, sectionTierDividers, drawerStacks);
      // Shelves never land in a drawer block: unknown/blocked zones fall back to the topmost free zone.
      const shelfFallbackZoneId = [...localZones].reverse().find((zone) => !blockZones.has(zone.id))?.id ?? localZones[localZones.length - 1]?.id ?? '';
      const leftSupportPartId = section.leftBoundary === 'outer'
        ? leftSide.id
        : tierPartitionPartIdByX.get(section.startX.toFixed(3));
      const rightSupportPartId = section.rightBoundary === 'outer'
        ? rightSide.id
        : tierPartitionPartIdByX.get(section.endX.toFixed(3));
      localZones.forEach((zone) => {
        const zoneShelves = shelves.filter((shelf) => {
          const shelfZoneId = shelf.zoneId && localZones.some((item) => item.id === shelf.zoneId) && !blockZones.has(shelf.zoneId)
            ? shelf.zoneId
            : shelfFallbackZoneId;
          return shelfZoneId === zone.id;
        });
        const drawerStack = blockZones.get(zone.id)
          ?? drawerStacks.find((item) => !item.block && (item.zoneId ?? localZones[0]?.id ?? '') === zone.id)
          ?? null;
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
                y: Number.isFinite(shelf.elevation)
                  ? Math.max(zone.startY + thickness / 2, Math.min(zone.startY + zone.clearHeight - thickness / 2, position.y + shelf.elevation!))
                  : zone.startY + step * (idx + 1),
                z: getInsetAdjustedCenterZ(position.z + backInset / 2, frontMode),
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
        const columnCount = drawerStack.block ? Math.max(1, Math.min(MAX_DRAWER_BLOCK_COLUMNS, drawerStack.block.columns)) : 1;
        const columnWidth = Math.max(20, (innerSpan.width - (columnCount - 1) * thickness) / columnCount);
        const zoneHasOwnBackPanel = !effectiveWithBackPanel && (
          Boolean(drawerStack.block?.withBackPanel)
          || options.backPanelSections.includes(makeSectionBackPanelKey(tierResolved.tierId, section.id))
          || options.backPanelSections.includes(makeSectionBackPanelKey(tierResolved.tierId, section.id, zone.id))
        );
        for (let column = 1; column < columnCount; column += 1) {
          parts.push(
            createPanelPart({
              name: `${name}${NAME_SEP}${roleLabel('drawer-column', column)}`,
              width: thickness,
              height: zone.clearHeight,
              // A back panel inside the section (the block's own, or a section/zone one) takes the rear strip.
              thickness: (usesSingleBackPanel ? innerDepth : (effectiveWithBackPanel ? depth : innerDepth)) - (zoneHasOwnBackPanel ? thickness : 0),
              position: {
                x: position.x + innerSpan.startX + column * columnWidth + (column - 1) * thickness + thickness / 2,
                y: zone.centerY,
                z: (usesSingleBackPanel ? position.z + backInset / 2 : position.z) + (zoneHasOwnBackPanel ? thickness / 2 : 0),
              },
              // Default joinery for a new column; rebuilds keep whatever the user picks.
              meta: { groupId, role: 'drawer-column', sourceId: `${drawerStack.id}:column:${column}`, joinery: { ...createEmptySideJoinery(), top: 'confirmat', bottom: 'confirmat' } },
            })
          );
        }
        const effectiveRunnerLength = getEffectiveDrawerRunnerLength(drawerStack, depth);
        const drawerGeometry = getDrawerGeometry(columnWidth, zone.clearHeight, drawerStack.drawerCount, effectiveRunnerLength, options.frontOpeningMode);
        const boxBottomInset = 24;
        // An overlay drawer front sits in front of the carcass, so the box comes up to the carcass front edge.
        const boxDepthCenterZ = position.z + depth / 2 - drawerGeometry.boxDepth / 2 - (frontMode === 'overlay' ? 0 : DRAWER_BOX_BACK_OFFSET);
        // Overlay drawer fronts: each column of the block's zone is an opening (same gap rules as doors), its drawers share its height.
        // Between drawer fronts the gap is the doors' middle gap (26163 pencil: 4 between drawer fronts, as between doors).
        const overlayFacadeGap = options.frontOpeningMode === 'handles' ? HANDLED_FRONT_GAP : OVERLAY_FRONT_MIDDLE_GAP;
        const getOverlayDrawerFacade = (column: number, stackIndexFromBottom: number) => {
          const cellStartX = position.x + innerSpan.startX + column * (columnWidth + thickness);
          const zoneCell: CabinetOpening = {
            tierId: tierResolved.tierId,
            sectionId: section.id,
            tierIndex,
            bottomBoundaryId: Math.abs(zone.startY - frame.startY) < 0.5 ? OPENING_EDGE_BOTTOM : 'local-divider',
            topBoundaryId: Math.abs(zone.endY - frame.endY) < 0.5 ? OPENING_EDGE_TOP : 'local-divider',
            startX: cellStartX,
            endX: cellStartX + columnWidth,
            startY: zone.startY,
            endY: zone.endY,
            bottomHalf: thickness / 2,
            topHalf: thickness / 2,
            leftOuter: column === 0 && section.leftBoundary === 'outer',
            rightOuter: column === columnCount - 1 && section.rightBoundary === 'outer',
            isBottomTier: tierIndex === resolved.length - 1,
            isTopTier: tierIndex === 0,
            hasDrawers: true,
          };
          const rect = getFrontRect(zoneCell, zoneCell, { name, groupId, thickness, depth, position, frontMode, frontOpeningMode: options.frontOpeningMode, topOverFronts: topFrontOverhang > 0, floorClearance: getFloorClearance(options) });
          const count = Math.max(1, drawerStack.drawerCount);
          // Whole millimetres from the bottom up: the gaps stay exact and the remainder goes under the top edge.
          const height = Math.max(40, roundDownToMillimeter((rect.top - rect.bottom - overlayFacadeGap * (count - 1)) / count));
          const bottom = rect.bottom + stackIndexFromBottom * (height + overlayFacadeGap);
          return { width: rect.right - rect.left, height, position: { x: (rect.left + rect.right) / 2, y: bottom + height / 2, z: rect.z } };
        };
        const totalFacadeHeight = drawerGeometry.facadeHeight * drawerStack.drawerCount;
        const bottomFacadeGap = options.frontOpeningMode === 'handles' ? HANDLED_FRONT_GAP : DRAWER_BOTTOM_FACADE_MIN_CLEARANCE;
        const sharedFacadeGap = Math.max(
          0,
          (zone.clearHeight - totalFacadeHeight - bottomFacadeGap) / Math.max(1, drawerStack.drawerCount)
        );
        for (let column = 0; column < columnCount; column += 1) {
        const columnCenterX = innerSpan.startX + column * (columnWidth + thickness) + columnWidth / 2;
        for (let idx = 0; idx < drawerStack.drawerCount; idx += 1) {
          drawerIndex += 1;
          const stackIndexFromBottom = drawerStack.drawerCount - 1 - idx;
          const insetFacadeBottomY = zone.startY + bottomFacadeGap + stackIndexFromBottom * (drawerGeometry.facadeHeight + sharedFacadeGap);
          const overlayFacade = frontMode === 'overlay' ? getOverlayDrawerFacade(column, stackIndexFromBottom) : null;
          const facadeBottomY = overlayFacade ? overlayFacade.position.y - overlayFacade.height / 2 : insetFacadeBottomY;
          const facadeTopY = overlayFacade ? overlayFacade.position.y + overlayFacade.height / 2 : insetFacadeBottomY + drawerGeometry.facadeHeight;
          const facadeCenterY = (facadeBottomY + facadeTopY) / 2;
          // The box follows its front (for an inset front this is exactly the slot geometry), but never sinks below the slot floor —
          // an overlay front may reach over the bottom panel or the plinth — and shrinks to end under the front's top.
          const boxBottomY = Math.max(facadeBottomY, zone.startY + bottomFacadeGap) + boxBottomInset + DRAWER_BOX_LIFT_RELATIVE_TO_FACADE;
          const boxHeight = Math.max(40, facadeTopY - boxBottomY - (DRAWER_BOX_HEIGHT_REDUCTION - boxBottomInset - DRAWER_BOX_LIFT_RELATIVE_TO_FACADE));
          const frontBackHeight = Math.max(20, boxHeight - DRAWER_FRONT_BACK_LOWER_BY);
          const frontWallCenterY = boxBottomY + DRAWER_SIDE_BOTTOM_OVERHANG + frontBackHeight / 2;
          const backWallCenterY = frontWallCenterY + DRAWER_BACK_LIFT;
          const sideBottomY = boxBottomY - DRAWER_SIDE_BOTTOM_OVERHANG;
          const bottomCenterY = boxBottomY + thickness / 2;
          const frontFaceZ = position.z + depth / 2 - thickness / 2;
          const boxCenterX = position.x + columnCenterX;
          // Column 0 keeps the legacy source ids so existing drawers keep their identity.
          const drawerSourceBase = column === 0 ? `${drawerStack.id}:${idx}` : `${drawerStack.id}:c${column}:${idx}`;
          const drawerSideHeight = boxHeight + DRAWER_BOX_WALL_TOP_EXTENSION;
          const drawerBackHeight = frontBackHeight + DRAWER_BOX_WALL_TOP_EXTENSION;
          const drawerSideCenterY = sideBottomY + boxHeight / 2 + DRAWER_BOX_WALL_TOP_EXTENSION / 2;
          const drawerBackCenterY = backWallCenterY + DRAWER_BOX_WALL_TOP_EXTENSION / 2;
          const facadePart = createPanelPart({
            name: `${name}${NAME_SEP}${roleLabel('drawer-front', drawerIndex)}`,
            width: overlayFacade?.width ?? drawerGeometry.facadeWidth,
            height: overlayFacade?.height ?? drawerGeometry.facadeHeight,
            thickness,
            position: overlayFacade?.position ?? { x: boxCenterX, y: facadeCenterY, z: frontFaceZ },
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
              height: Math.max(20, frontBackHeight - 20),
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
            thickness: getTierDividerDepth(depth, backInset, frontMode),
            position: {
              x: position.x + innerSpan.centerX,
              y: dividerCenters[dividerIndex] ?? frame.centerY,
              z: getTierDividerCenterZ(position.z, backInset, frontMode),
            },
            meta: {
              groupId,
              role: 'tier-divider',
              sourceId: divider.id,
              leftSupportPartId,
              rightSupportPartId,
              // A drawer block's divider comes pre-joined to the section walls; rebuilds keep the user's later choice.
              joinery: drawerStacks.some((stack) => stack.block?.dividerId === divider.id || stack.block?.baseDividerId === divider.id)
                ? { ...createEmptySideJoinery(), left: 'confirmat', right: 'confirmat' }
                : createEmptySideJoinery(),
            },
          })
        );
      });
    });
  });

    tierFrames.slice(0, -1).forEach((frame, idx) => {
      const tierDividerDepth = getTierDividerDepth(depth, backInset, frontMode);
      parts.push(
        createPanelPart({
          name: `${name}${NAME_SEP}Tier divider ${idx + 1}`,
          width: innerWidth,
          height: thickness,
          thickness: tierDividerDepth,
          position: {
            x: position.x,
            y: frame.startY - thickness / 2,
            z: getTierDividerCenterZ(position.z, backInset, frontMode),
          },
          meta: { groupId, role: 'tier-divider', sourceId: `tier-divider:${frame.tierId}`, joinery: createEmptySideJoinery() },
        })
      );
  });
}
