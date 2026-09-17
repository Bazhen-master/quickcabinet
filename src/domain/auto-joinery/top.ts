// Крепёж крыши: к боковинам и перегородкам, вкладной и накладной.
import type { Part } from '../part';
import { createDrillOperation, getFaceAxis } from '../drill';
import { projectWorldPointToFace } from '../face-coords';
import { type AutoJointRuleDraft, CONFIRMAT_HEAD_DEPTH, CONFIRMAT_HEAD_DIAMETER, CONFIRMAT_THREAD_DEPTH, CONFIRMAT_THREAD_DIAMETER, EDGE_DOWEL_DEPTH, EDGE_DOWEL_DIAMETER, MINIFIX_BOLT_DEPTH, MINIFIX_BOLT_DIAMETER, RAFIX_CENTER_FROM_EDGE, RAFIX_HOUSING_DEPTH, RAFIX_HOUSING_DIAMETER, RAFIX_MATE_DEPTH, RAFIX_MATE_DIAMETER, type SectionSupport, camFaceByPartRole, debugJoineryPair, getCamCenterOffsetFromMountingEdge, getCamCenterOffsetFromTopEdge, getCamDowelPairs, getFaceMaxDepth, getHorizontalCenterY, getHorizontalOffsets, getPartitionTopCamFace, getSideInnerFaceWorldX, getSupportCenterX, getTopSupportLocalX, getTopSupportLocalY, getVerticalLocalY, getWorldAnchorPosition, withGeneratedSource } from './core';

export function createTopConfirmatOps(horizontalPart: Part, support: SectionSupport, sideKey: string, rules: AutoJointRuleDraft) {
  const source = withGeneratedSource(horizontalPart, sideKey, 'confirmat');
  const offsets = getHorizontalOffsets(horizontalPart, rules);
  if (support.supportFace !== 'top') {
    return {
      horizontalOps: offsets.map((offset) =>
        createDrillOperation({
          source,
          face: support.sectionSide,
          axis: getFaceAxis(support.sectionSide),
          x: offset,
          y: getHorizontalCenterY(horizontalPart),
          diameter: CONFIRMAT_THREAD_DIAMETER,
          depth: Math.min(CONFIRMAT_THREAD_DEPTH, horizontalPart.width),
          through: false,
          templateName: 'Top confirmat',
          feature: 'confirmat',
        })
      ),
      supportOps: offsets.map((offset) =>
        createDrillOperation({
          source,
          face: support.supportFace,
          axis: getFaceAxis(support.supportFace),
          x: offset,
          y: getVerticalLocalY(horizontalPart, support.supportPart),
          diameter: CONFIRMAT_HEAD_DIAMETER,
          depth: Math.min(CONFIRMAT_HEAD_DEPTH, support.supportPart.width),
          through: false,
          templateName: 'Top confirmat',
          feature: 'confirmat',
        })
      ),
    };
  }

  return {
    horizontalOps: offsets.map((offset) =>
      createDrillOperation({
        source,
        face: 'top',
        axis: getFaceAxis('top'),
        x: getSupportCenterX(horizontalPart, support.supportPart),
        y: offset,
        diameter: CONFIRMAT_HEAD_DIAMETER,
        depth: Math.min(CONFIRMAT_HEAD_DEPTH, horizontalPart.height),
        through: false,
        templateName: 'Top confirmat',
        feature: 'confirmat',
      })
    ),
    supportOps: offsets.map((offset) =>
      createDrillOperation({
        source,
        face: support.supportFace,
        axis: getFaceAxis(support.supportFace),
        x: getTopSupportLocalX(horizontalPart, support, offset),
        y: getTopSupportLocalY(horizontalPart, support, offset),
        diameter: CONFIRMAT_THREAD_DIAMETER,
        depth: Math.min(CONFIRMAT_THREAD_DEPTH, support.supportPart.height),
        through: false,
        templateName: support.supportPart.meta?.role === 'partition' ? 'Confirmat' : 'Top confirmat',
        feature: 'confirmat',
      })
    ),
  };
}

export function createTopMinifixDowelOps(horizontalPart: Part, support: SectionSupport, sideKey: string, rules: AutoJointRuleDraft) {
  const source = withGeneratedSource(horizontalPart, sideKey, 'minifix-dowel');
  const pairs = getCamDowelPairs(horizontalPart.thickness, rules);
  const camFace = camFaceByPartRole(horizontalPart);
  const camCenterX = getCamCenterOffsetFromMountingEdge(horizontalPart.width, sideKey === 'left' ? 'left' : 'right');

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
        templateName: 'Top cam housing',
        feature: 'cam-housing',
      }),
      createDrillOperation({
        source,
        face: sideKey === 'left' ? 'left' : 'right',
        axis: getFaceAxis(sideKey === 'left' ? 'left' : 'right'),
        x: pair.camX,
        y: getHorizontalCenterY(horizontalPart),
        diameter: 8,
        depth: Math.min(30, horizontalPart.width),
        through: false,
        templateName: 'Top connector pin',
        feature: 'connector-pin',
      }),
      createDrillOperation({
        source,
        face: sideKey === 'left' ? 'left' : 'right',
        axis: getFaceAxis(sideKey === 'left' ? 'left' : 'right'),
        x: pair.dowelX,
        y: getHorizontalCenterY(horizontalPart),
        diameter: 8,
        depth: Math.min(12, horizontalPart.width),
        through: false,
        templateName: 'Top dowel',
        feature: 'dowel',
      }),
    ]),
    supportOps: pairs.flatMap((pair) => [
      createDrillOperation({
        source,
        face: support.supportFace,
        axis: getFaceAxis(support.supportFace),
        x: getTopSupportLocalX(horizontalPart, support, pair.camX),
        y: getTopSupportLocalY(horizontalPart, support, pair.camX),
        diameter: MINIFIX_BOLT_DIAMETER,
        depth: Math.min(MINIFIX_BOLT_DEPTH, getFaceMaxDepth(support.supportPart, support.supportFace)),
        through: false,
        templateName: 'Top connector pin',
        feature: 'connector-pin',
      }),
      createDrillOperation({
        source,
        face: support.supportFace,
        axis: getFaceAxis(support.supportFace),
        x: getTopSupportLocalX(horizontalPart, support, pair.dowelX),
        y: getTopSupportLocalY(horizontalPart, support, pair.dowelX),
        diameter: EDGE_DOWEL_DIAMETER,
        depth: Math.min(EDGE_DOWEL_DEPTH, getFaceMaxDepth(support.supportPart, support.supportFace)),
        through: false,
        templateName: 'Top dowel',
        feature: 'dowel',
      }),
    ]),
  };
}

export function createPartitionTopMinifixDowelOps(horizontalPart: Part, support: SectionSupport, sideKey: string, rules: AutoJointRuleDraft) {
  const source = withGeneratedSource(horizontalPart, sideKey, 'partition-top-minifix-dowel');
  const pairs = getCamDowelPairs(horizontalPart.thickness, rules);
  const partitionCenterX = getSupportCenterX(horizontalPart, support.supportPart);
  const partitionFace = getPartitionTopCamFace(horizontalPart, support.supportPart);
  const carrierCenterY = getCamCenterOffsetFromTopEdge(support.supportPart.height);

  return {
    horizontalOps: pairs.flatMap((pair) => [
      createDrillOperation({
        source,
        face: 'bottom',
        axis: getFaceAxis('bottom'),
        x: partitionCenterX,
        y: pair.camX,
        diameter: 5,
        depth: Math.min(12, horizontalPart.height),
        through: false,
        templateName: 'Partition top connector pin',
        feature: 'connector-pin',
      }),
      createDrillOperation({
        source,
        face: 'bottom',
        axis: getFaceAxis('bottom'),
        x: partitionCenterX,
        y: pair.dowelX,
        diameter: 8,
        depth: Math.min(12, horizontalPart.height),
        through: false,
        templateName: 'Partition top dowel',
        feature: 'dowel',
      }),
    ]),
    supportOps: pairs.flatMap((pair) => {
      const connectorWorld = getWorldAnchorPosition(horizontalPart, 'bottom', { x: partitionCenterX, y: pair.camX });
      const dowelWorld = getWorldAnchorPosition(horizontalPart, 'bottom', { x: partitionCenterX, y: pair.dowelX });
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
          templateName: 'Partition top cam housing',
          feature: 'cam-housing',
        }),
        createDrillOperation({
          source,
          face: 'top',
          axis: getFaceAxis('top'),
          x: support.supportPart.width / 2,
          y: carrierAnchor.x,
          diameter: 8,
          depth: Math.min(30, support.supportPart.height),
          through: false,
          templateName: 'Partition top connector pin',
          feature: 'connector-pin',
        }),
        createDrillOperation({
          source,
          face: 'top',
          axis: getFaceAxis('top'),
          x: support.supportPart.width / 2,
          y: carrierDowelAnchor.x,
          diameter: 8,
          depth: Math.min(12, support.supportPart.height),
          through: false,
          templateName: 'Partition top dowel',
          feature: 'dowel',
        }),
      ];
    }),
  };
}

export function createPartitionTopRafixOps(horizontalPart: Part, support: SectionSupport, sideKey: string, rules: AutoJointRuleDraft) {
  const source = withGeneratedSource(horizontalPart, sideKey, 'partition-top-rafix');
  const offsets = getHorizontalOffsets(horizontalPart, rules);
  const partitionCenterX = getSupportCenterX(horizontalPart, support.supportPart);
  const partitionFace = getPartitionTopCamFace(horizontalPart, support.supportPart);
  const housingCenterY = Math.max(9, Math.min(support.supportPart.height - 9, RAFIX_CENTER_FROM_EDGE));
  return {
    horizontalOps: offsets.map((offset) =>
      createDrillOperation({
        source,
        face: 'bottom',
        axis: getFaceAxis('bottom'),
        x: partitionCenterX,
        y: offset,
        diameter: RAFIX_MATE_DIAMETER,
        depth: Math.min(RAFIX_MATE_DEPTH, getFaceMaxDepth(horizontalPart, 'bottom')),
        through: false,
        templateName: 'Partition top Rafix mate',
        feature: 'connector-pin',
      })
    ),
    supportOps: offsets.map((offset) => {
      const mateWorld = getWorldAnchorPosition(horizontalPart, 'bottom', { x: partitionCenterX, y: offset });
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
        templateName: 'Partition top Rafix housing',
        feature: 'cam-housing',
      });
    }),
  };
}

export function createOverlayTopConfirmatOps(horizontalPart: Part, supportPart: Part, sideKey: string, rules: AutoJointRuleDraft) {
  const source = withGeneratedSource(horizontalPart, sideKey, 'overlay-confirmat');
  const offsets = getHorizontalOffsets(horizontalPart, rules);
  return {
    horizontalOps: offsets.map((offset) =>
      createDrillOperation({
        source,
        face: 'top',
        axis: getFaceAxis('top'),
        x: getSupportCenterX(horizontalPart, supportPart),
        y: offset,
        diameter: CONFIRMAT_HEAD_DIAMETER,
        depth: Math.min(CONFIRMAT_HEAD_DEPTH, horizontalPart.height),
        through: false,
        templateName: 'Overlay top confirmat',
        feature: 'confirmat',
      })
    ),
    supportOps: offsets.map((offset) =>
      createDrillOperation({
        source,
        face: 'top',
        axis: getFaceAxis('top'),
        x: supportPart.width / 2,
        y: offset,
        diameter: CONFIRMAT_THREAD_DIAMETER,
        depth: Math.min(CONFIRMAT_THREAD_DEPTH, supportPart.height),
        through: false,
        templateName: 'Overlay top confirmat',
        feature: 'confirmat',
      })
    ),
  };
}

export function createOverlayTopMinifixOps(horizontalPart: Part, support: SectionSupport, rules: AutoJointRuleDraft) {
  const supportPart = support.supportPart;
  const sideKey = support.sectionSide;
  const source = withGeneratedSource(horizontalPart, sideKey, 'overlay-minifix-dowel');
  const pairs = getCamDowelPairs(horizontalPart.thickness, rules);
  const supportFace = support.supportFace;
  const carrierCenterY = getCamCenterOffsetFromTopEdge(supportPart.height);
  return {
    horizontalOps: pairs.flatMap((pair) => {
      const mateCenterX = getSupportCenterX(horizontalPart, supportPart);
      const connectorWorld = getWorldAnchorPosition(horizontalPart, 'bottom', { x: mateCenterX, y: pair.camX });
      const dowelWorld = getWorldAnchorPosition(horizontalPart, 'bottom', { x: mateCenterX, y: pair.dowelX });
      const carrierConnectorAnchor = projectWorldPointToFace(supportPart, supportFace, {
        x: getSideInnerFaceWorldX(support),
        y: supportPart.position.y + supportPart.height / 2 - carrierCenterY,
        z: connectorWorld.z,
      });
      const carrierDowelAnchor = projectWorldPointToFace(supportPart, supportFace, {
        x: getSideInnerFaceWorldX(support),
        y: supportPart.position.y + supportPart.height / 2 - carrierCenterY,
        z: dowelWorld.z,
      });
      debugJoineryPair(
        'roof-to-side-minifix',
        horizontalPart,
        supportPart,
        'bottom',
        supportFace,
        { x: mateCenterX, y: pair.camX },
        carrierConnectorAnchor
      );
      return [
        createDrillOperation({
          source,
          face: 'bottom',
          axis: getFaceAxis('bottom'),
          x: mateCenterX,
          y: pair.camX,
          diameter: 5,
          depth: Math.min(12, horizontalPart.height),
          through: false,
          templateName: 'Connector pin',
          feature: 'connector-pin',
        }),
        createDrillOperation({
          source,
          face: 'bottom',
          axis: getFaceAxis('bottom'),
          x: mateCenterX,
          y: pair.dowelX,
          diameter: 8,
          depth: Math.min(12, horizontalPart.height),
          through: false,
          templateName: 'Overlay top dowel',
          feature: 'dowel',
        }),
      ];
    }),
    supportOps: pairs.map((pair) =>
      {
        const connectorWorld = getWorldAnchorPosition(horizontalPart, 'bottom', {
          x: getSupportCenterX(horizontalPart, supportPart),
          y: pair.camX,
        });
        const carrierAnchor = projectWorldPointToFace(supportPart, supportFace, {
          x: getSideInnerFaceWorldX(support),
          y: supportPart.position.y + supportPart.height / 2 - carrierCenterY,
          z: connectorWorld.z,
        });
        const dowelWorld = getWorldAnchorPosition(horizontalPart, 'bottom', {
          x: getSupportCenterX(horizontalPart, supportPart),
          y: pair.dowelX,
        });
        const carrierDowelAnchor = projectWorldPointToFace(supportPart, supportFace, {
          x: getSideInnerFaceWorldX(support),
          y: supportPart.position.y + supportPart.height / 2 - carrierCenterY,
          z: dowelWorld.z,
        });
        return [
          createDrillOperation({
            source,
            face: supportFace,
            axis: getFaceAxis(supportFace),
            x: carrierAnchor.x,
            y: carrierAnchor.y,
            diameter: 15,
            depth: Math.min(12, supportPart.width),
            through: false,
            templateName: 'Overlay top cam housing',
            feature: 'cam-housing',
          }),
          createDrillOperation({
            source,
            face: 'top',
            axis: getFaceAxis('top'),
            x: supportPart.width / 2,
            y: carrierAnchor.x,
            diameter: MINIFIX_BOLT_DIAMETER,
            depth: Math.min(MINIFIX_BOLT_DEPTH, supportPart.height),
            through: false,
            templateName: 'Overlay top connector pin',
            feature: 'connector-pin',
          }),
          createDrillOperation({
            source,
            face: 'top',
            axis: getFaceAxis('top'),
            x: supportPart.width / 2,
            y: carrierDowelAnchor.x,
            diameter: EDGE_DOWEL_DIAMETER,
            depth: Math.min(EDGE_DOWEL_DEPTH, supportPart.height),
            through: false,
            templateName: 'Overlay top dowel',
            feature: 'dowel',
          }),
        ];
      }
    ).flat(),
  };
}
