// Цоколь и карниз (верхние царги): их присадка к корпусу.
import type { Part } from '../part';
import { createDrillOperation, getFaceAxis } from '../drill';
import { projectWorldPointToFace, getFacePointWorld } from '../face-coords';
import { resolveCabinetLayout } from '../cabinet-layout';
import { GENERATED_CROWN_SOURCE_PREFIX, GENERATED_PLINTH_SOURCE_PREFIX, MINIFIX_CENTER_OFFSET, MINIFIX_CONNECTOR_CHANNEL_DEPTH, MINIFIX_CONNECTOR_CHANNEL_DIAMETER, MINIFIX_CONNECTOR_PIN_DEPTH, MINIFIX_CONNECTOR_PIN_DIAMETER, PLINTH_DOWEL_DEPTH, PLINTH_DOWEL_DIAMETER, PLINTH_MINIFIX_DOWEL_SPACING, PLINTH_TO_BOTTOM_MAX_DOWEL_SPACING, TOP_RAIL_CONNECTOR_PIN_BOTTOM_OFFSET, TOP_RAIL_MINIFIX_EDGE_OFFSET, TOP_RAIL_MINIFIX_SPACING } from './constants';

function clampMinifixOffset(span: number) {
  return Math.max(9, Math.min(span - 9, MINIFIX_CENTER_OFFSET));
}

export function getTopRailMinifixPositions(frontRailWidth: number, supportRailWidth: number) {
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

export function createCrownMinifixOps(frontRail: Part, supportRail: Part, xOnFront: number, index: number) {
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

export function createPlinthSideDowelOps(sidePart: Part, railPart: Part, side: 'left' | 'right', node: 'front' | 'back') {
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

export function createPlinthBraceMinifixOps(frontRail: Part, backRail: Part, brace: Part) {
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

export function createPlinthToBottomDowelOps(bottom: Part, rail: Part, node: 'front' | 'back') {
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

/**
 * A short plinth brace hangs under the bottom on minifix without dowels (the long front/back rails stay on dowels:
 * a cam 34 mm into a low rail breaks it in transport). Cam in the brace side facing the cabinet center.
 */
export function createPlinthBraceToBottomMinifixOps(bottom: Part, brace: Part, camFace: 'left' | 'right') {
  const source = `${GENERATED_PLINTH_SOURCE_PREFIX}${brace.id}:bottom:minifix`;
  const depthOffsets = getPlinthBottomDowelOffsets(brace.thickness);
  const camY = clampMinifixOffset(brace.height);
  const braceCenterX = brace.width / 2;

  return {
    bottomOps: depthOffsets.map((offset) => {
      const anchor = projectWorldPointToFace(bottom, 'bottom', getFacePointWorld(brace, 'top', { x: braceCenterX, y: offset }));
      return createDrillOperation({
        source,
        face: 'bottom',
        axis: getFaceAxis('bottom'),
        x: anchor.x,
        y: anchor.y,
        diameter: MINIFIX_CONNECTOR_PIN_DIAMETER,
        depth: Math.min(MINIFIX_CONNECTOR_PIN_DEPTH, bottom.height),
        through: false,
        templateName: 'Plinth brace to bottom connector pin',
        feature: 'connector-pin',
      });
    }),
    braceOps: depthOffsets.flatMap((offset) => [
      createDrillOperation({
        source,
        face: camFace,
        axis: getFaceAxis(camFace),
        x: offset,
        y: camY,
        diameter: 15,
        depth: Math.min(12, brace.width),
        through: false,
        templateName: 'Plinth brace to bottom cam housing',
        feature: 'cam-housing',
      }),
      createDrillOperation({
        source,
        face: 'top',
        axis: getFaceAxis('top'),
        x: braceCenterX,
        y: offset,
        diameter: MINIFIX_CONNECTOR_CHANNEL_DIAMETER,
        depth: Math.min(MINIFIX_CONNECTOR_CHANNEL_DEPTH, brace.height),
        through: false,
        templateName: 'Plinth brace to bottom connector channel',
        feature: 'connector-pin',
      }),
    ]),
  };
}

export function getPlinthBraceOffsetX(resolved: ReturnType<typeof resolveCabinetLayout>, partitionId: string) {
  const partitionIndex = resolved.partitions.findIndex((partition) => partition.id === partitionId);
  if (partitionIndex < 0) return 20;

  const leftSection = resolved.leafSections[partitionIndex] ?? null;
  const rightSection = resolved.leafSections[partitionIndex + 1] ?? null;
  const leftRawWidth = leftSection ? leftSection.endX - leftSection.startX : 0;
  const rightRawWidth = rightSection ? rightSection.endX - rightSection.startX : 0;

  if (rightRawWidth >= leftRawWidth) return 20;
  return -20;
}
