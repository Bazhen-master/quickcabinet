// Горизонтальные детали: полки, дно, перегородки снизу, полкодержатели, выбор опор.
import type { Part } from '../part';
import { createDrillOperation, getFaceAxis, type DrillOperation } from '../drill';
import { projectWorldPointToFace } from '../face-coords';
import type { JoineryType } from '../joinery';
import type { CabinetSection } from '../cabinet-layout';
import { type AutoJointRuleDraft, CONFIRMAT_HEAD_DEPTH, CONFIRMAT_HEAD_DIAMETER, CONFIRMAT_THREAD_DEPTH, CONFIRMAT_THREAD_DIAMETER, RAFIX_CENTER_FROM_EDGE, RAFIX_HOUSING_DEPTH, RAFIX_HOUSING_DIAMETER, RAFIX_MATE_DEPTH, RAFIX_MATE_DIAMETER, type ResolvedShelfSideJoinery, SHELF_JOINERY_REBUILD_STAGE, type SectionSupport, type ShelfSidePipelineStat, camFaceByPartRole, createShelfSideSourceKey, getCamCenterOffsetFromBottomEdge, getCamCenterOffsetFromMountingEdge, getCamDowelPairs, getFaceMaxDepth, getHorizontalCenterY, getHorizontalOffsets, getHorizontalSideLocalX, getPartitionBottomCamFace, getShelfCamDowelPairs, getShelfDepthOffsets, getSupportCenterX, getSupportFaceLocalX, getSupportFaceWorldX, getVerticalLocalY, getWorldAnchorPosition, shelfPinFlexibleStep, shouldDebugJoinery, withGeneratedSource } from './core';
import { createPartitionTopMinifixDowelOps, createPartitionTopRafixOps, createTopConfirmatOps, createTopMinifixDowelOps } from './top';
import { createHorizontalConfirmatDowelOps } from './confirmat-dowel';

function createHorizontalConfirmatOps(horizontalPart: Part, support: SectionSupport, sideKey: string, rules: AutoJointRuleDraft) {
  const source = withGeneratedSource(horizontalPart, sideKey, 'confirmat');
  const offsets = horizontalPart.meta?.role === 'shelf'
    ? getShelfDepthOffsets(horizontalPart, rules, support.sectionSide)
    : getHorizontalOffsets(horizontalPart, rules);
  return {
    horizontalOps: offsets.map((offset) =>
      createDrillOperation({
        source,
        face: support.sectionSide,
        axis: getFaceAxis(support.sectionSide),
        x: getHorizontalSideLocalX(horizontalPart, support.sectionSide, offset),
        y: getHorizontalCenterY(horizontalPart),
        diameter: CONFIRMAT_THREAD_DIAMETER,
        depth: Math.min(CONFIRMAT_THREAD_DEPTH, horizontalPart.width),
        through: false,
        templateName: 'Confirmat',
        feature: 'confirmat',
      })
    ),
    supportOps: offsets.map((offset) =>
      createDrillOperation({
        source,
        face: support.supportFace,
        axis: getFaceAxis(support.supportFace),
        x: getSupportFaceLocalX(support.supportPart, support.supportFace, offset),
        y: getVerticalLocalY(horizontalPart, support.supportPart),
        diameter: CONFIRMAT_HEAD_DIAMETER,
        depth: Math.min(CONFIRMAT_HEAD_DEPTH, support.supportPart.width),
        through: false,
        templateName: 'Confirmat',
        feature: 'confirmat',
      })
    ),
  };
}

function createHorizontalMinifixDowelOps(horizontalPart: Part, support: SectionSupport, sideKey: string, rules: AutoJointRuleDraft) {
  const source = withGeneratedSource(horizontalPart, sideKey, 'minifix-dowel');
  const pairs = horizontalPart.meta?.role === 'shelf'
    ? getShelfCamDowelPairs(horizontalPart, rules, support.sectionSide)
    : getCamDowelPairs(horizontalPart.thickness, rules);
  const camFace = camFaceByPartRole(horizontalPart);
  const camCenterX = getCamCenterOffsetFromMountingEdge(horizontalPart.width, support.sectionSide);
  const sideY = getVerticalLocalY(horizontalPart, support.supportPart);

  return {
    horizontalOps: pairs.flatMap((pair) => [
      createDrillOperation({
        source,
        face: camFace,
        axis: getFaceAxis(camFace),
        x: camCenterX,
        y: pair.camX,
        diameter: 15,
        depth: Math.min(12, horizontalPart.height),
        through: false,
        templateName: 'Cam housing',
        feature: 'cam-housing',
      }),
      createDrillOperation({
        source,
        face: support.sectionSide,
        axis: getFaceAxis(support.sectionSide),
        x: getHorizontalSideLocalX(horizontalPart, support.sectionSide, pair.camX),
        y: getHorizontalCenterY(horizontalPart),
        diameter: 8,
        depth: Math.min(30, horizontalPart.width),
        through: false,
        templateName: 'Connector pin',
        feature: 'connector-pin',
      }),
      createDrillOperation({
        source,
        face: support.sectionSide,
        axis: getFaceAxis(support.sectionSide),
        x: getHorizontalSideLocalX(horizontalPart, support.sectionSide, pair.dowelX),
        y: getHorizontalCenterY(horizontalPart),
        diameter: 8,
        depth: Math.min(12, horizontalPart.width),
        through: false,
        templateName: 'Dowel',
        feature: 'dowel',
      }),
    ]),
    supportOps: pairs.flatMap((pair) => [
      createDrillOperation({
        source,
        face: support.supportFace,
        axis: getFaceAxis(support.supportFace),
        x: getSupportFaceLocalX(support.supportPart, support.supportFace, pair.camX),
        y: sideY,
        diameter: 5,
        depth: Math.min(12, support.supportPart.width),
        through: false,
        templateName: 'Connector pin',
        feature: 'connector-pin',
      }),
      createDrillOperation({
        source,
        face: support.supportFace,
        axis: getFaceAxis(support.supportFace),
        x: getSupportFaceLocalX(support.supportPart, support.supportFace, pair.dowelX),
        y: sideY,
        diameter: 8,
        depth: Math.min(12, support.supportPart.width),
        through: false,
        templateName: 'Dowel',
        feature: 'dowel',
      }),
    ]),
  };
}

export function createBottomPartitionConfirmatOps(bottomPart: Part, support: SectionSupport, sideKey: string, rules: AutoJointRuleDraft) {
  const source = withGeneratedSource(bottomPart, sideKey, 'partition-bottom-confirmat');
  const offsets = getHorizontalOffsets(bottomPart, rules);
  const partitionCenterX = getSupportCenterX(bottomPart, support.supportPart);
  return {
    horizontalOps: offsets.map((offset) =>
      // Head is drilled from the outer (under) face; the partition stands on the top face.
      createDrillOperation({
        source,
        face: 'bottom',
        axis: getFaceAxis('bottom'),
        x: partitionCenterX,
        y: offset,
        diameter: CONFIRMAT_HEAD_DIAMETER,
        depth: Math.min(CONFIRMAT_HEAD_DEPTH, bottomPart.height),
        through: false,
        templateName: 'Partition bottom confirmat',
        feature: 'confirmat',
      })
    ),
    supportOps: offsets.map((offset) =>
      createDrillOperation({
        source,
        face: 'bottom',
        axis: getFaceAxis('bottom'),
        x: support.supportPart.width / 2,
        y: offset,
        diameter: CONFIRMAT_THREAD_DIAMETER,
        depth: Math.min(CONFIRMAT_THREAD_DEPTH, support.supportPart.height),
        through: false,
        templateName: 'Partition bottom confirmat',
        feature: 'confirmat',
      })
    ),
  };
}

export function createBottomPartitionMinifixDowelOps(bottomPart: Part, support: SectionSupport, sideKey: string, rules: AutoJointRuleDraft) {
  const source = withGeneratedSource(bottomPart, sideKey, 'partition-bottom-minifix-dowel');
  const pairs = getCamDowelPairs(bottomPart.thickness, rules);
  const partitionCenterX = getSupportCenterX(bottomPart, support.supportPart);
  const sideY = getVerticalLocalY(bottomPart, support.supportPart);
  const partitionFace = getPartitionBottomCamFace(bottomPart, support.supportPart);
  const carrierCenterY = getCamCenterOffsetFromBottomEdge(support.supportPart.height);

  return {
    horizontalOps: pairs.flatMap((pair) => [
      createDrillOperation({
        source,
        face: 'top',
        axis: getFaceAxis('top'),
        x: partitionCenterX,
        y: pair.camX,
        diameter: 5,
        depth: Math.min(12, bottomPart.height),
        through: false,
        templateName: 'Partition bottom connector pin',
        feature: 'connector-pin',
      }),
      createDrillOperation({
        source,
        face: 'top',
        axis: getFaceAxis('top'),
        x: partitionCenterX,
        y: pair.dowelX,
        diameter: 8,
        depth: Math.min(12, bottomPart.height),
        through: false,
        templateName: 'Partition bottom dowel',
        feature: 'dowel',
      }),
    ]),
    supportOps: pairs.flatMap((pair) => {
      const connectorWorld = getWorldAnchorPosition(bottomPart, 'top', { x: partitionCenterX, y: pair.camX });
      const dowelWorld = getWorldAnchorPosition(bottomPart, 'top', { x: partitionCenterX, y: pair.dowelX });
      const faceWorldX =
        partitionFace === 'right'
          ? support.supportPart.position.x + support.supportPart.width / 2
          : support.supportPart.position.x - support.supportPart.width / 2;
      const carrierAnchor = projectWorldPointToFace(support.supportPart, partitionFace, {
        x: faceWorldX,
        y: support.supportPart.position.y + support.supportPart.height / 2 - carrierCenterY,
        z: connectorWorld.z,
      });
      const carrierDowelAnchor = projectWorldPointToFace(support.supportPart, partitionFace, {
        x: faceWorldX,
        y: support.supportPart.position.y + support.supportPart.height / 2 - carrierCenterY,
        z: dowelWorld.z,
      });
      return [
        createDrillOperation({
          source,
          face: partitionFace,
          axis: getFaceAxis(partitionFace),
          x: carrierAnchor.x,
          y: carrierAnchor.y,
          diameter: 15,
          depth: Math.min(12, support.supportPart.width),
          through: false,
          templateName: 'Partition bottom cam housing',
          feature: 'cam-housing',
        }),
        createDrillOperation({
          source,
          face: 'bottom',
          axis: getFaceAxis('bottom'),
          x: support.supportPart.width / 2,
          y: carrierAnchor.x,
          diameter: 8,
          depth: Math.min(30, support.supportPart.height),
          through: false,
          templateName: 'Partition bottom connector pin',
          feature: 'connector-pin',
        }),
        createDrillOperation({
          source,
          face: 'bottom',
          axis: getFaceAxis('bottom'),
          x: support.supportPart.width / 2,
          y: carrierDowelAnchor.x,
          diameter: 8,
          depth: Math.min(12, support.supportPart.height),
          through: false,
          templateName: 'Partition bottom dowel',
          feature: 'dowel',
        }),
      ];
    }),
  };
}

export function createBottomPartitionRafixOps(bottomPart: Part, support: SectionSupport, sideKey: string, rules: AutoJointRuleDraft) {
  const source = withGeneratedSource(bottomPart, sideKey, 'partition-bottom-rafix');
  const offsets = getHorizontalOffsets(bottomPart, rules);
  const partitionCenterX = getSupportCenterX(bottomPart, support.supportPart);
  const partitionFace = getPartitionBottomCamFace(bottomPart, support.supportPart);
  const housingCenterY = Math.max(9, Math.min(support.supportPart.height - 9, support.supportPart.height - RAFIX_CENTER_FROM_EDGE));
  return {
    horizontalOps: offsets.map((offset) =>
      createDrillOperation({
        source,
        face: 'top',
        axis: getFaceAxis('top'),
        x: partitionCenterX,
        y: offset,
        diameter: RAFIX_MATE_DIAMETER,
        depth: Math.min(RAFIX_MATE_DEPTH, getFaceMaxDepth(bottomPart, 'top')),
        through: false,
        templateName: 'Partition bottom Rafix mate',
        feature: 'connector-pin',
      })
    ),
    supportOps: offsets.map((offset) => {
      const mateWorld = getWorldAnchorPosition(bottomPart, 'top', { x: partitionCenterX, y: offset });
      const faceWorldX = partitionFace === 'right'
        ? support.supportPart.position.x + support.supportPart.width / 2
        : support.supportPart.position.x - support.supportPart.width / 2;
      const housingAnchor = projectWorldPointToFace(support.supportPart, partitionFace, {
        x: faceWorldX,
        y: support.supportPart.position.y + support.supportPart.height / 2 - housingCenterY,
        z: mateWorld.z,
      });
      return createDrillOperation({
        source,
        face: partitionFace,
        axis: getFaceAxis(partitionFace),
        x: housingAnchor.x,
        y: housingAnchor.y,
        diameter: RAFIX_HOUSING_DIAMETER,
        depth: Math.min(RAFIX_HOUSING_DEPTH, getFaceMaxDepth(support.supportPart, partitionFace)),
        through: false,
        templateName: 'Partition bottom Rafix housing',
        feature: 'cam-housing',
      });
    }),
  };
}

function createShelfPinOps(horizontalPart: Part, support: SectionSupport, sideKey: string, rules: AutoJointRuleDraft) {
  const source = withGeneratedSource(horizontalPart, sideKey, 'shelf_pin');
  const offsets = getShelfDepthOffsets(horizontalPart, rules, support.sectionSide);
  const clampVertical = (value: number) => Math.max(9, Math.min(support.supportPart.height - 9, value));
  return {
    horizontalOps: [] as DrillOperation[],
    supportOps: offsets.flatMap((offset) => {
      const baseY = getVerticalLocalY(horizontalPart, support.supportPart) + 10;
      const flexibleYPositions = [
        clampVertical(baseY - shelfPinFlexibleStep),
        clampVertical(baseY),
        clampVertical(baseY + shelfPinFlexibleStep),
      ].filter((value, index, array) => array.findIndex((item) => Math.abs(item - value) < 0.001) === index);

      return flexibleYPositions.map((y, positionIndex) =>
        createDrillOperation({
          source,
          face: support.supportFace,
          axis: getFaceAxis(support.supportFace),
          x: getSupportFaceLocalX(support.supportPart, support.supportFace, offset),
          y,
          diameter: rules.shelfPinDiameter,
          depth: Math.min(12, support.supportPart.width),
          through: false,
          templateName: positionIndex === 1 ? 'Shelf pin' : 'Shelf pin flexible',
          feature: 'shelf-pin',
        })
      );
    }),
  };
}

export function createHorizontalJoineryOps(horizontalPart: Part, support: SectionSupport, sideKey: string, joinery: JoineryType, rules: AutoJointRuleDraft) {
  if (horizontalPart.meta?.role === 'shelf') {
    return { horizontalOps: [] as DrillOperation[], supportOps: [] as DrillOperation[] };
  }
  if (joinery === 'none') return { horizontalOps: [] as DrillOperation[], supportOps: [] as DrillOperation[] };
  if (joinery === 'confirmat') return createHorizontalConfirmatOps(horizontalPart, support, sideKey, rules);
  if (joinery === 'confirmat-dowel') return createHorizontalConfirmatDowelOps(horizontalPart, support.supportPart, sideKey, rules);
  if (joinery === 'minifix-dowel') return createHorizontalMinifixDowelOps(horizontalPart, support, sideKey, rules);
  return { horizontalOps: [] as DrillOperation[], supportOps: [] as DrillOperation[] };
}

/** Rafix under a shelf end: housing in the under face breaking through the end edge, bolt in the support at mid shelf thickness. */
function createShelfRafixOps(shelfPart: Part, support: SectionSupport, side: 'left' | 'right', rules: AutoJointRuleDraft) {
  const source = withGeneratedSource(shelfPart, side, 'rafix');
  const offsets = getShelfDepthOffsets(shelfPart, rules, side);
  const housingX = side === 'left' ? RAFIX_CENTER_FROM_EDGE : Math.max(0, shelfPart.width - RAFIX_CENTER_FROM_EDGE);
  return {
    horizontalOps: offsets.map((offset) =>
      createDrillOperation({
        source,
        face: 'bottom',
        axis: getFaceAxis('bottom'),
        x: housingX,
        y: offset,
        diameter: RAFIX_HOUSING_DIAMETER,
        depth: Math.min(RAFIX_HOUSING_DEPTH, getFaceMaxDepth(shelfPart, 'bottom')),
        through: false,
        templateName: 'Shelf Rafix housing',
        feature: 'cam-housing',
      })
    ),
    supportOps: offsets.map((offset) => {
      const housingWorld = getWorldAnchorPosition(shelfPart, 'bottom', { x: housingX, y: offset });
      const anchor = projectWorldPointToFace(support.supportPart, support.supportFace, {
        x: getSupportFaceWorldX(support),
        y: shelfPart.position.y,
        z: housingWorld.z,
      });
      return createDrillOperation({
        source,
        face: support.supportFace,
        axis: getFaceAxis(support.supportFace),
        x: anchor.x,
        y: anchor.y,
        diameter: RAFIX_MATE_DIAMETER,
        depth: Math.min(RAFIX_MATE_DEPTH, getFaceMaxDepth(support.supportPart, support.supportFace)),
        through: false,
        templateName: 'Shelf Rafix mate',
        feature: 'connector-pin',
      });
    }),
  };
}

export function createShelfSideJoineryOps(shelfPart: Part, support: SectionSupport, side: 'left' | 'right', joinery: JoineryType, rules: AutoJointRuleDraft) {
  if (joinery === 'rafix') return createShelfRafixOps(shelfPart, support, side, rules);
  if (joinery === 'confirmat') return createHorizontalConfirmatOps(shelfPart, support, side, rules);
  if (joinery === 'minifix-dowel') return createHorizontalMinifixDowelOps(shelfPart, support, side, rules);
  if (joinery === 'shelf_pin') return createShelfPinOps(shelfPart, support, side, rules);
  return { horizontalOps: [] as DrillOperation[], supportOps: [] as DrillOperation[] };
}

export function createTopJoineryOps(horizontalPart: Part, support: SectionSupport, sideKey: string, joinery: JoineryType, rules: AutoJointRuleDraft) {
  if (joinery === 'none') return { horizontalOps: [] as DrillOperation[], supportOps: [] as DrillOperation[] };
  if (joinery === 'confirmat') return createTopConfirmatOps(horizontalPart, support, sideKey, rules);
  if (joinery === 'confirmat-dowel') return createHorizontalConfirmatDowelOps(horizontalPart, support.supportPart, sideKey, rules);
  const supportIsVerticalDivider = support.supportPart.meta?.role === 'partition' || support.supportPart.meta?.role === 'drawer-column';
  if (joinery === 'minifix-dowel' && supportIsVerticalDivider && support.supportFace === 'top') {
    return createPartitionTopMinifixDowelOps(horizontalPart, support, sideKey, rules);
  }
  if (joinery === 'rafix' && supportIsVerticalDivider && support.supportFace === 'top') {
    return createPartitionTopRafixOps(horizontalPart, support, sideKey, rules);
  }
  if (joinery === 'minifix-dowel') return createTopMinifixDowelOps(horizontalPart, support, sideKey, rules);
  return { horizontalOps: [] as DrillOperation[], supportOps: [] as DrillOperation[] };
}

export function findSectionSupport(
  groupParts: Part[],
  section: CabinetSection,
  side: 'left' | 'right',
  partitionsByX: Map<string, Part>
): SectionSupport | null {
  const sidePanelRole = side === 'left' ? 'left-side' : 'right-side';
  const outerSupportFace = side === 'left' ? 'right' : 'left';
  const partitionSupportFace = side === 'left' ? 'right' : 'left';
  const boundaryKind = side === 'left' ? section.leftBoundary : section.rightBoundary;
  const boundaryX = side === 'left' ? section.startX : section.endX;

  if (boundaryKind === 'outer') {
    const supportPart = groupParts.find((part) => part.meta?.role === sidePanelRole);
    return supportPart ? { supportPart, sectionSide: side, supportFace: outerSupportFace } : null;
  }

  const key = boundaryX.toFixed(3);
  const supportPart = partitionsByX.get(key) ?? null;
  return supportPart ? { supportPart, sectionSide: side, supportFace: partitionSupportFace } : null;
}

export function getBottomSideJoinery(bottomPart: Part, side: 'left' | 'right'): JoineryType {
  return side === 'left'
    ? (bottomPart.meta?.joinery?.left ?? 'none')
    : (bottomPart.meta?.joinery?.right ?? 'none');
}

export function findPartitionPartBySourceId(groupParts: Part[], partitionSourceId: string) {
  return groupParts.find((part) => part.meta?.role === 'partition' && part.meta?.sourceId === partitionSourceId) ?? null;
}

export function resolveShelfSideJoinery(
  shelfPart: Part,
  parentSectionId: string | null,
  side: 'left' | 'right',
  joinery: JoineryType,
  support: SectionSupport | null
): ResolvedShelfSideJoinery {
  return {
    shelfId: shelfPart.id,
    parentSectionId,
    side,
    joinery,
    supportPartId: support?.supportPart.id ?? null,
    supportPartType: support?.supportPart.meta?.role ?? null,
    support,
    resolver: 'section-boundary',
    generator: 'shelf-side-generator',
    sourceKey: joinery === 'none' ? null : createShelfSideSourceKey(shelfPart, side, joinery),
  };
}

export function debugShelfJoineryDump(stats: ShelfSidePipelineStat[]) {
  if (!shouldDebugJoinery) return;
  const rows = stats.map((decision) => ({
    stage: SHELF_JOINERY_REBUILD_STAGE,
    shelfId: decision.shelfId,
    parentSectionId: decision.parentSectionId ?? 'none',
    side: decision.side,
    joinery: decision.joinery,
    supportPartId: decision.supportPartId ?? 'none',
    supportPartType: decision.supportPartType ?? 'none',
    resolver: decision.resolver,
    generator: decision.generator,
    adjacencyValid: decision.adjacencyValid,
    sourceKey: decision.sourceKey ?? 'none',
    removedOldOps: decision.removedOldOps,
    generatedOps: decision.generatedOps,
    finalStoredOps: decision.finalStoredOps,
    renderedMarkers: decision.renderedMarkers,
  }));
  console.groupCollapsed('[shelf-joinery-debug] shelf side pipeline stats');
  console.table(rows);
  rows
    .filter((row) => row.finalStoredOps > row.generatedOps || !row.adjacencyValid)
    .forEach((row) => {
      console.warn('[shelf-joinery-debug][invariant-failed]', row);
    });
  console.groupEnd();
}
