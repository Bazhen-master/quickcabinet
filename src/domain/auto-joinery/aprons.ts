// Царги: крепёж к хозяину (крыше/полке) и к боковинам.
import type { JoineryType } from '../joinery';
import type { Part } from '../part';
import { projectWorldPointToFace } from '../face-coords';
import { createDrillOperation, getFaceAxis } from '../drill';
import { APRON_PARTITION_CENTER_SHIFT, APRON_SIDE_Y_SHIFT, CONFIRMAT_HEAD_DEPTH, CONFIRMAT_HEAD_DIAMETER, CONFIRMAT_THREAD_DEPTH, CONFIRMAT_THREAD_DIAMETER, RAFIX_CENTER_FROM_EDGE, RAFIX_HOUSING_DEPTH, RAFIX_HOUSING_DIAMETER, RAFIX_MATE_DEPTH, RAFIX_MATE_DIAMETER, type SectionSupport, debugJoineryPair, getApronRafixMateWorldPoint, getCamCenterOffsetFromBottomEdge, getCamCenterOffsetFromMountingEdge, getCamCenterOffsetFromTopEdge, getFaceMaxDepth, getSideInnerFaceWorldX, getWorldAnchorPosition, withGeneratedSource } from './core';

function normalizeApronJoinery(joinery: JoineryType): 'none' | 'confirmat' | 'minifix-dowel' | 'rafix' {
  if (joinery === 'rafix') return 'rafix';
  if (joinery === 'minifix-dowel') return 'minifix-dowel';
  if (joinery === 'confirmat') return 'confirmat';
  return 'none';
}

function getApronVerticalOffsets(apron: Part) {
  return [apron.height / 3, apron.height * 2 / 3];
}

function getApronShiftedVerticalOffsets(apron: Part, shift: number) {
  const minY = 9;
  const maxY = Math.max(minY, apron.height - 9);
  const clampY = (value: number) => Math.max(minY, Math.min(maxY, value));
  return getApronVerticalOffsets(apron)
    .map((offset) => clampY(offset + shift))
    .filter((value, index, array) => array.findIndex((item) => Math.abs(item - value) < 0.001) === index);
}

function getApronSideYOffset(sideKey: 'left' | 'right') {
  return sideKey === 'left' ? -APRON_SIDE_Y_SHIFT : APRON_SIDE_Y_SHIFT;
}

function getApronSupportLocalY(apron: Part, supportPart: Part, yOnApron: number) {
  const globalY = apron.position.y + apron.height / 2 - yOnApron;
  return supportPart.height / 2 - (globalY - supportPart.position.y);
}

function getApronSupportLocalX(apron: Part, support: SectionSupport) {
  const worldAnchor = getWorldAnchorPosition(apron, support.sectionSide, {
    x: apron.thickness / 2,
    y: apron.height / 2,
  });
  return projectWorldPointToFace(support.supportPart, support.supportFace, {
    x: getSideInnerFaceWorldX(support),
    y: worldAnchor.y,
    z: worldAnchor.z,
  }).x;
}

function shiftApronPartitionAnchorTowardCenter(supportPart: Part, x: number) {
  if (supportPart.meta?.role !== 'partition') return x;
  const thickness = Math.max(0, supportPart.thickness);
  const center = thickness / 2;
  const clampedOffset = Math.max(0, Math.min(APRON_PARTITION_CENTER_SHIFT, center));
  const frontTarget = clampedOffset;
  const backTarget = Math.max(frontTarget, thickness - clampedOffset);
  const clampedX = Math.max(0, Math.min(thickness, x));
  return clampedX <= center ? frontTarget : backTarget;
}

export function getApronHostJoinery(apron: Part, hostRole: string): 'none' | 'confirmat' | 'minifix-dowel' | 'rafix' {
  const face = hostRole === 'bottom' ? 'bottom' : 'top';
  const explicit = apron.meta?.joinery?.[face];
  if (explicit === 'rafix') return 'rafix';
  if (explicit === 'minifix-dowel') return 'minifix-dowel';
  if (explicit === 'confirmat') return 'confirmat';
  return apron.meta?.joinery ? 'none' : 'confirmat';
}

export function getApronSideJoinery(apron: Part, side: 'left' | 'right'): 'none' | 'confirmat' | 'minifix-dowel' | 'rafix' {
  const explicit = apron.meta?.joinery?.[side];
  if (explicit === 'confirmat' || explicit === 'minifix-dowel' || explicit === 'rafix') return explicit;
  if (apron.meta?.joinery) return 'none';
  return 'confirmat';
}

export function createApronToHostConfirmatOps(apron: Part, host: Part, sourceKey: string, hostFace: 'top' | 'bottom', apronFace: 'top' | 'bottom') {
  const source = withGeneratedSource(apron, sourceKey, 'apron-confirmat');
  const offsets = [apron.width / 3, apron.width * 2 / 3];
  const hostXBase = apron.position.x - host.position.x + host.width / 2;
  const hostY = Math.max(9, Math.min(host.thickness - 9, host.thickness - 9));
  const apronY = apron.thickness / 2;
  return {
    apronOps: offsets.map((offset) =>
      createDrillOperation({
        source,
        face: apronFace,
        axis: getFaceAxis(apronFace),
        x: offset,
        y: apronY,
        diameter: CONFIRMAT_THREAD_DIAMETER,
        depth: Math.min(CONFIRMAT_THREAD_DEPTH, apron.height),
        through: false,
        templateName: 'Apron confirmat',
        feature: 'confirmat',
      })
    ),
    hostOps: offsets.map((offset) =>
      createDrillOperation({
        source,
        face: hostFace,
        axis: getFaceAxis(hostFace),
        x: hostXBase - apron.width / 2 + offset,
        y: hostY,
        diameter: CONFIRMAT_HEAD_DIAMETER,
        depth: Math.min(CONFIRMAT_HEAD_DEPTH, host.height),
        through: false,
        templateName: 'Apron confirmat',
        feature: 'confirmat',
      })
    ),
  };
}

export function createApronToHostMinifixOps(apron: Part, host: Part, sourceKey: string, hostFace: 'top' | 'bottom', apronFace: 'top' | 'bottom') {
  const source = withGeneratedSource(apron, sourceKey, `apron-host-minifix-${hostFace}`);
  const offsets = [apron.width / 3, apron.width * 2 / 3];
  const carrierCenterY = apronFace === 'top'
    ? getCamCenterOffsetFromTopEdge(apron.height)
    : getCamCenterOffsetFromBottomEdge(apron.height);
  const hostDepthX = apron.thickness / 2;
  return {
    apronOps: offsets.flatMap((offset) => [
      createDrillOperation({
        source,
        face: 'front',
        axis: getFaceAxis('front'),
        x: offset,
        y: carrierCenterY,
        diameter: 15,
        depth: Math.min(12, apron.thickness),
        through: false,
        templateName: 'Apron cam housing',
        feature: 'cam-housing',
      }),
      createDrillOperation({
        source,
        face: apronFace,
        axis: getFaceAxis(apronFace),
        x: offset,
        y: apron.thickness / 2,
        diameter: 8,
        depth: Math.min(30, apron.height),
        through: false,
        templateName: 'Apron connector pin',
        feature: 'connector-pin',
      }),
    ]),
    hostOps: offsets.map((offset) => {
      const connectorWorld = getWorldAnchorPosition(apron, apronFace, {
        x: offset,
        y: apron.thickness / 2,
      });
      const hostAnchor = projectWorldPointToFace(host, hostFace, connectorWorld);
      return createDrillOperation({
        source,
        face: hostFace,
        axis: getFaceAxis(hostFace),
        x: hostAnchor.x,
        y: hostAnchor.y,
        diameter: 5,
        depth: Math.min(12, getFaceMaxDepth(host, hostFace)),
        through: false,
        templateName: 'Apron connector pin',
        feature: 'connector-pin',
      });
    }),
  };
}

export function createApronToHostRafixOps(apron: Part, host: Part, sourceKey: string, hostFace: 'top' | 'bottom', apronFace: 'top' | 'bottom') {
  const source = withGeneratedSource(apron, sourceKey, `apron-host-rafix-${hostFace}`);
  const offsets = [apron.width / 3, apron.width * 2 / 3];
  const carrierCenterY = apronFace === 'top'
    ? RAFIX_CENTER_FROM_EDGE
    : Math.max(RAFIX_CENTER_FROM_EDGE, apron.height - RAFIX_CENTER_FROM_EDGE);
  return {
    apronOps: offsets.map((offset) =>
      createDrillOperation({
        source,
        face: 'front',
        axis: getFaceAxis('front'),
        x: offset,
        y: carrierCenterY,
        diameter: RAFIX_HOUSING_DIAMETER,
        depth: Math.min(RAFIX_HOUSING_DEPTH, getFaceMaxDepth(apron, 'front')),
        through: false,
        templateName: 'Apron Rafix housing',
        feature: 'cam-housing',
      })
    ),
    hostOps: offsets.map((offset) => {
      const housingWorld = getApronRafixMateWorldPoint(
        apron,
        offset,
        apron.position.y + apron.height / 2 - carrierCenterY
      );
      const hostAnchor = projectWorldPointToFace(host, hostFace, housingWorld);
      return createDrillOperation({
        source,
        face: hostFace,
        axis: getFaceAxis(hostFace),
        x: hostAnchor.x,
        y: hostAnchor.y,
        diameter: RAFIX_MATE_DIAMETER,
        depth: Math.min(RAFIX_MATE_DEPTH, getFaceMaxDepth(host, hostFace)),
        through: false,
        templateName: 'Apron Rafix mate',
        feature: 'connector-pin',
      });
    }),
  };
}

export function createApronSideConfirmatOps(apron: Part, support: SectionSupport, sideKey: 'left' | 'right') {
  const source = withGeneratedSource(apron, sideKey, 'apron-side-confirmat');
  const offsets = getApronShiftedVerticalOffsets(apron, getApronSideYOffset(sideKey));
  const supportX = apron.thickness / 2;
  return {
    apronOps: offsets.map((offset) =>
      createDrillOperation({
        source,
        face: sideKey,
        axis: getFaceAxis(sideKey),
        x: supportX,
        y: offset,
        diameter: CONFIRMAT_THREAD_DIAMETER,
        depth: Math.min(CONFIRMAT_THREAD_DEPTH, apron.width),
        through: false,
        templateName: 'Apron side confirmat',
        feature: 'confirmat',
      })
    ),
    supportOps: offsets.map((offset) =>
      {
        const sourceAnchor = { x: supportX, y: offset };
        const sourceWorld = getWorldAnchorPosition(apron, sideKey, sourceAnchor);
        const targetAnchor = {
          ...projectWorldPointToFace(support.supportPart, support.supportFace, {
            x: getSideInnerFaceWorldX(support),
            y: sourceWorld.y,
            z: sourceWorld.z,
          }),
        };
        targetAnchor.x = shiftApronPartitionAnchorTowardCenter(support.supportPart, targetAnchor.x);
        debugJoineryPair(
          'rear-rail-to-side-confirmat',
          apron,
          support.supportPart,
          sideKey,
          support.supportFace,
          sourceAnchor,
          targetAnchor
        );
        return createDrillOperation({
          source,
          face: support.supportFace,
          axis: getFaceAxis(support.supportFace),
          x: targetAnchor.x,
          y: targetAnchor.y,
          diameter: CONFIRMAT_HEAD_DIAMETER,
          depth: Math.min(CONFIRMAT_HEAD_DEPTH, support.supportPart.width),
          through: false,
          templateName: 'Apron side confirmat',
          feature: 'confirmat',
        });
      }
    ),
  };
}

export function createApronSideMinifixOps(apron: Part, support: SectionSupport, sideKey: 'left' | 'right') {
  const source = withGeneratedSource(apron, sideKey, 'apron-side-minifix');
  const offsets = getApronShiftedVerticalOffsets(apron, getApronSideYOffset(sideKey));
  const face = sideKey;
  const supportX = apron.thickness / 2;
  const camOffset = getCamCenterOffsetFromMountingEdge(apron.width, sideKey);
  return {
    apronOps: offsets.flatMap((offset) => [
      createDrillOperation({
        source,
        face: 'front',
        axis: getFaceAxis('front'),
        x: camOffset,
        y: offset,
        diameter: 15,
        depth: Math.min(12, apron.thickness),
        through: false,
        templateName: 'Apron cam housing',
        feature: 'cam-housing',
      }),
      createDrillOperation({
        source,
        face,
        axis: getFaceAxis(face),
        x: supportX,
        y: offset,
        diameter: 8,
        depth: Math.min(30, apron.width),
        through: false,
        templateName: 'Apron connector pin',
        feature: 'connector-pin',
      }),
    ]),
    supportOps: offsets.map((offset) =>
      {
        const sourceAnchor = { x: supportX, y: offset };
        const sourceWorld = getWorldAnchorPosition(apron, face, sourceAnchor);
        const targetAnchor = {
          ...projectWorldPointToFace(support.supportPart, support.supportFace, {
            x: getSideInnerFaceWorldX(support),
            y: sourceWorld.y,
            z: sourceWorld.z,
          }),
        };
        targetAnchor.x = shiftApronPartitionAnchorTowardCenter(support.supportPart, targetAnchor.x);
        debugJoineryPair(
          'rear-rail-to-side-minifix',
          apron,
          support.supportPart,
          face,
          support.supportFace,
          { x: supportX, y: offset },
          targetAnchor
        );
        return createDrillOperation({
          source,
          face: support.supportFace,
          axis: getFaceAxis(support.supportFace),
          x: targetAnchor.x,
          y: targetAnchor.y,
          diameter: 5,
          depth: Math.min(12, support.supportPart.width),
          through: false,
          templateName: 'Apron connector pin',
          feature: 'connector-pin',
        });
      }
    ),
  };
}

export function createApronSideRafixOps(apron: Part, support: SectionSupport, sideKey: 'left' | 'right') {
  const source = withGeneratedSource(apron, sideKey, 'apron-side-rafix');
  const offsets = getApronShiftedVerticalOffsets(apron, getApronSideYOffset(sideKey));
  const face = sideKey;
  const supportX = apron.thickness / 2;
  // Rafix housing breaks through the mounting edge (9.5 mm), unlike a minifix cam set 34 mm in.
  const housingX = sideKey === 'left' ? RAFIX_CENTER_FROM_EDGE : Math.max(0, apron.width - RAFIX_CENTER_FROM_EDGE);
  return {
    apronOps: offsets.map((offset) =>
      createDrillOperation({
        source,
        face: 'front',
        axis: getFaceAxis('front'),
        x: housingX,
        y: offset,
        diameter: RAFIX_HOUSING_DIAMETER,
        depth: Math.min(RAFIX_HOUSING_DEPTH, getFaceMaxDepth(apron, 'front')),
        through: false,
        templateName: 'Apron Rafix housing',
        feature: 'cam-housing',
      })
    ),
    supportOps: offsets.map((offset) => {
      const sourceWorld = getApronRafixMateWorldPoint(
        apron,
        housingX,
        apron.position.y + apron.height / 2 - offset
      );
      const targetAnchor = projectWorldPointToFace(support.supportPart, support.supportFace, {
        x: getSideInnerFaceWorldX(support),
        y: sourceWorld.y,
        z: sourceWorld.z,
      });
      return createDrillOperation({
        source,
        face: support.supportFace,
        axis: getFaceAxis(support.supportFace),
        x: targetAnchor.x,
        y: targetAnchor.y,
        diameter: RAFIX_MATE_DIAMETER,
        depth: Math.min(RAFIX_MATE_DEPTH, getFaceMaxDepth(support.supportPart, support.supportFace)),
        through: false,
        templateName: 'Apron Rafix mate',
        feature: 'connector-pin',
      });
    }),
  };
}
