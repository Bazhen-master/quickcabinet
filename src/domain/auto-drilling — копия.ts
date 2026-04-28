import { resolveCabinetLayout, type CabinetSection } from './cabinet-layout';
import { createDrillOperation, getFaceAxis, type DrillOperation } from './drill';
import { createEmptySideJoinery, type JoineryType } from './joinery';
import type { Part, PartFace } from './part';

export type AutoJointRuleDraft = {
  frontOffset: number;
  backOffset: number;
  shelfPinDiameter: number;
  camDowelSpacing: number;
};

type SectionSupport = {
  supportPart: Part;
  sectionSide: 'left' | 'right';
  supportFace: PartFace;
};

type JoineryDebugAnchor = {
  x: number;
  y: number;
};

const GENERATED_SOURCE_PREFIX = 'generated-joinery:';
const camCenterOffsetFromEdge = 34;
const shouldDebugJoinery = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

function isPlinthEnabled(groupParts: Part[]) {
  return groupParts.some((part) => part.meta?.role === 'plinth-front' || part.meta?.role === 'plinth-back');
}

function isOverlayTop(top: Part, bottom: Part) {
  return top.width > bottom.width + 0.001 || top.thickness > bottom.thickness + 0.001;
}

export function getDefaultAutoJointRules(): AutoJointRuleDraft {
  return {
    frontOffset: 37,
    backOffset: 37,
    shelfPinDiameter: 5,
    camDowelSpacing: 32,
  };
}

function withGeneratedSource(part: Part, side: string, joinery: string) {
  return `${GENERATED_SOURCE_PREFIX}${part.id}:${side}:${joinery}`;
}

function isGeneratedSource(source?: string) {
  return typeof source === 'string' && source.startsWith(GENERATED_SOURCE_PREFIX);
}

function withoutGeneratedOps(part: Part): Part {
  return {
    ...part,
    operations: part.operations.filter((op) => !isGeneratedSource(op.source)),
  };
}

function clampOffsets(depth: number, frontOffset: number, backOffset: number) {
  const front = Math.max(9, Math.min(depth - 9, frontOffset));
  const back = Math.max(front, Math.min(depth - 9, depth - backOffset));
  return [front, back] as const;
}

function appendOps(target: Map<string, DrillOperation[]>, partId: string, ops: DrillOperation[]) {
  if (ops.length === 0) return;
  target.set(partId, [...(target.get(partId) ?? []), ...ops]);
}

function getHorizontalOffsets(part: Part, rules: AutoJointRuleDraft) {
  return clampOffsets(part.thickness, rules.frontOffset, rules.backOffset);
}

function getSupportCenterX(horizontalPart: Part, supportPart: Part) {
  return supportPart.position.x - horizontalPart.position.x + horizontalPart.width / 2;
}

function getHorizontalCenterY(horizontalPart: Part) {
  return horizontalPart.height / 2;
}

function getVerticalLocalY(horizontalPart: Part, supportPart: Part) {
  return supportPart.height / 2 - (horizontalPart.position.y - supportPart.position.y);
}

function getTopSupportLocalX(horizontalPart: Part, support: SectionSupport, offset: number) {
  return support.supportFace === 'top' ? support.supportPart.width / 2 : offset;
}

function getSupportFaceLocalX(supportPart: Part, supportFace: PartFace, offset: number) {
  if (supportFace === 'left' || supportFace === 'right') {
    return Math.max(0, Math.min(supportPart.thickness, offset));
  }
  return Math.max(0, Math.min(supportPart.width, offset));
}

function getTopSupportLocalY(horizontalPart: Part, support: SectionSupport, offset: number) {
  return support.supportFace === 'top'
    ? offset
    : getVerticalLocalY(horizontalPart, support.supportPart);
}

function camFaceByPartRole(part: Part): PartFace {
  return part.meta?.role === 'bottom' ? 'top' : 'bottom';
}

function getCamCenterOffsetFromMountingEdge(width: number, sideKey: 'left' | 'right') {
  const clamped = Math.max(9, Math.min(width - 9, camCenterOffsetFromEdge));
  return sideKey === 'left' ? clamped : Math.max(9, width - clamped);
}

function getCamDowelPairs(depth: number, rules: AutoJointRuleDraft) {
  const [frontCenter, backCenter] = clampOffsets(depth, rules.frontOffset, rules.backOffset);
  const halfSpacing = Math.max(8, rules.camDowelSpacing / 2);
  const clampX = (value: number) => Math.max(9, Math.min(depth - 9, value));
  const detailCenter = depth / 2;
  return [frontCenter, backCenter].map((center) => {
    const dowelTowardCenter = center <= detailCenter;
    return {
      camX: clampX(center + (dowelTowardCenter ? -halfSpacing : halfSpacing)),
      dowelX: clampX(center + (dowelTowardCenter ? halfSpacing : -halfSpacing)),
    };
  });
}

function getWorldAnchorPosition(part: Part, face: PartFace, anchor: JoineryDebugAnchor) {
  switch (face) {
    case 'front':
      return {
        x: part.position.x - part.width / 2 + anchor.x,
        y: part.position.y + part.height / 2 - anchor.y,
        z: part.position.z + part.thickness / 2,
      };
    case 'back':
      return {
        x: part.position.x - part.width / 2 + anchor.x,
        y: part.position.y + part.height / 2 - anchor.y,
        z: part.position.z - part.thickness / 2,
      };
    case 'top':
      return {
        x: part.position.x - part.width / 2 + anchor.x,
        y: part.position.y + part.height / 2,
        z: part.position.z + part.thickness / 2 - anchor.y,
      };
    case 'bottom':
      return {
        x: part.position.x - part.width / 2 + anchor.x,
        y: part.position.y - part.height / 2,
        z: part.position.z + part.thickness / 2 - anchor.y,
      };
    case 'left':
      return {
        x: part.position.x - part.width / 2,
        y: part.position.y + part.height / 2 - anchor.y,
        z: part.position.z + part.thickness / 2 - anchor.x,
      };
    case 'right':
      return {
        x: part.position.x + part.width / 2,
        y: part.position.y + part.height / 2 - anchor.y,
        z: part.position.z + part.thickness / 2 - anchor.x,
      };
  }
}

function debugJoineryPair(
  joineryCase: string,
  sourcePart: Part,
  targetPart: Part,
  sourceFace: PartFace,
  targetFace: PartFace,
  sourceAnchor: JoineryDebugAnchor,
  targetAnchor: JoineryDebugAnchor
) {
  if (!shouldDebugJoinery) return;
  console.debug('[joinery-debug]', {
    joineryCase,
    sourcePart: { id: sourcePart.id, name: sourcePart.name, role: sourcePart.meta?.role },
    targetPart: { id: targetPart.id, name: targetPart.name, role: targetPart.meta?.role },
    sourceFace,
    targetFace,
    sourceAnchorLocal: sourceAnchor,
    targetAnchorLocal: targetAnchor,
    sourceAnchorWorld: getWorldAnchorPosition(sourcePart, sourceFace, sourceAnchor),
    targetAnchorWorld: getWorldAnchorPosition(targetPart, targetFace, targetAnchor),
  });
}

function createTopConfirmatOps(horizontalPart: Part, support: SectionSupport, sideKey: string, rules: AutoJointRuleDraft) {
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
          diameter: 7,
          depth: Math.min(50, horizontalPart.width),
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
          diameter: 7,
          depth: Math.min(12, support.supportPart.width),
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
        diameter: 7,
        depth: Math.min(14, horizontalPart.height),
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
        diameter: 7,
        depth: Math.min(50, support.supportPart.width),
        through: false,
        templateName: 'Top confirmat',
        feature: 'confirmat',
      })
    ),
  };
}

function createTopMinifixDowelOps(horizontalPart: Part, support: SectionSupport, sideKey: string, rules: AutoJointRuleDraft) {
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
        diameter: 5,
        depth: Math.min(12, support.supportPart.width),
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
        diameter: 8,
        depth: Math.min(12, support.supportPart.width),
        through: false,
        templateName: 'Top dowel',
        feature: 'dowel',
      }),
    ]),
  };
}

function createOverlayTopConfirmatOps(horizontalPart: Part, supportPart: Part, sideKey: string, rules: AutoJointRuleDraft) {
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
        diameter: 7,
        depth: Math.min(14, horizontalPart.height),
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
        diameter: 7,
        depth: Math.min(50, supportPart.height),
        through: false,
        templateName: 'Overlay top confirmat',
        feature: 'confirmat',
      })
    ),
  };
}

function createOverlayTopMinifixOps(horizontalPart: Part, support: SectionSupport, rules: AutoJointRuleDraft) {
  const supportPart = support.supportPart;
  const sideKey = support.sectionSide;
  const source = withGeneratedSource(horizontalPart, sideKey, 'overlay-minifix-dowel');
  const pairs = getCamDowelPairs(horizontalPart.thickness, rules);
  const supportFace = support.supportFace;
  const supportY = getVerticalLocalY(horizontalPart, supportPart);
  return {
    horizontalOps: pairs.flatMap((pair) => {
      const mateCenterX = getSupportCenterX(horizontalPart, supportPart);
      debugJoineryPair(
        'roof-to-side-minifix',
        horizontalPart,
        supportPart,
        'bottom',
        supportFace,
        { x: mateCenterX, y: pair.camX },
        { x: getSupportFaceLocalX(supportPart, supportFace, pair.camX), y: supportY }
      );
      return [
        createDrillOperation({
          source,
          face: 'bottom',
          axis: getFaceAxis('bottom'),
          x: mateCenterX,
          y: pair.camX,
          diameter: 8,
          depth: Math.min(30, horizontalPart.height),
          through: false,
          templateName: 'Overlay top connector pin',
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
      createDrillOperation({
        source,
        face: supportFace,
        axis: getFaceAxis(supportFace),
        x: getSupportFaceLocalX(supportPart, supportFace, pair.camX),
        y: supportY,
        diameter: 15,
        depth: Math.min(12, supportPart.width),
        through: false,
        templateName: 'Overlay top cam housing',
        feature: 'cam-housing',
      })
    ),
  };
}

function createHorizontalConfirmatOps(horizontalPart: Part, support: SectionSupport, sideKey: string, rules: AutoJointRuleDraft) {
  const source = withGeneratedSource(horizontalPart, sideKey, 'confirmat');
  const offsets = getHorizontalOffsets(horizontalPart, rules);
  return {
    horizontalOps: offsets.map((offset) =>
      createDrillOperation({
        source,
        face: support.sectionSide,
        axis: getFaceAxis(support.sectionSide),
        x: offset,
        y: getHorizontalCenterY(horizontalPart),
        diameter: 7,
        depth: Math.min(50, horizontalPart.width),
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
        diameter: 7,
        depth: Math.min(12, support.supportPart.width),
        through: false,
        templateName: 'Confirmat',
        feature: 'confirmat',
      })
    ),
  };
}

function createHorizontalMinifixDowelOps(horizontalPart: Part, support: SectionSupport, sideKey: string, rules: AutoJointRuleDraft) {
  const source = withGeneratedSource(horizontalPart, sideKey, 'minifix-dowel');
  const pairs = getCamDowelPairs(horizontalPart.thickness, rules);
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
        x: pair.camX,
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
        x: pair.dowelX,
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

function createShelfPinOps(horizontalPart: Part, support: SectionSupport, sideKey: string, rules: AutoJointRuleDraft) {
  const source = withGeneratedSource(horizontalPart, sideKey, 'shelf_pin');
  const offsets = getHorizontalOffsets(horizontalPart, rules);
  return {
    horizontalOps: [] as DrillOperation[],
    supportOps: offsets.map((offset) =>
      createDrillOperation({
        source,
        face: support.supportFace,
        axis: getFaceAxis(support.supportFace),
        x: getSupportFaceLocalX(support.supportPart, support.supportFace, offset),
        y: getVerticalLocalY(horizontalPart, support.supportPart) + 10,
        diameter: rules.shelfPinDiameter,
        depth: Math.min(12, support.supportPart.width),
        through: false,
        templateName: 'Shelf pin',
        feature: 'shelf-pin',
      })
    ),
  };
}

function createHorizontalJoineryOps(horizontalPart: Part, support: SectionSupport, sideKey: string, joinery: JoineryType, rules: AutoJointRuleDraft) {
  if (joinery === 'none') return { horizontalOps: [] as DrillOperation[], supportOps: [] as DrillOperation[] };
  if (joinery === 'confirmat') return createHorizontalConfirmatOps(horizontalPart, support, sideKey, rules);
  if (joinery === 'minifix-dowel') return createHorizontalMinifixDowelOps(horizontalPart, support, sideKey, rules);
  if (joinery === 'shelf_pin' && horizontalPart.meta?.role === 'shelf') return createShelfPinOps(horizontalPart, support, sideKey, rules);
  return { horizontalOps: [] as DrillOperation[], supportOps: [] as DrillOperation[] };
}

function createTopJoineryOps(horizontalPart: Part, support: SectionSupport, sideKey: string, joinery: JoineryType, rules: AutoJointRuleDraft) {
  if (joinery === 'none') return { horizontalOps: [] as DrillOperation[], supportOps: [] as DrillOperation[] };
  if (joinery === 'confirmat') return createTopConfirmatOps(horizontalPart, support, sideKey, rules);
  if (joinery === 'minifix-dowel') return createTopMinifixDowelOps(horizontalPart, support, sideKey, rules);
  return { horizontalOps: [] as DrillOperation[], supportOps: [] as DrillOperation[] };
}

function normalizeApronJoinery(joinery: JoineryType): 'none' | 'confirmat' | 'minifix-dowel' {
  if (joinery === 'minifix-dowel') return 'minifix-dowel';
  if (joinery === 'confirmat') return 'confirmat';
  return 'none';
}

function getApronVerticalOffsets(apron: Part) {
  return [apron.height / 3, apron.height * 2 / 3];
}

function getApronSupportLocalY(apron: Part, supportPart: Part, yOnApron: number) {
  const globalY = apron.position.y + apron.height / 2 - yOnApron;
  return supportPart.height / 2 - (globalY - supportPart.position.y);
}

function getApronSupportLocalX(apron: Part, support: SectionSupport) {
  const localZ = apron.position.z - support.supportPart.position.z;
  return getSupportFaceLocalX(support.supportPart, support.supportFace, support.supportPart.thickness / 2 - localZ);
}

function createApronToHostConfirmatOps(apron: Part, host: Part, sourceKey: string, hostFace: 'top' | 'bottom', apronFace: 'top' | 'bottom') {
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
        diameter: 7,
        depth: Math.min(50, apron.height),
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
        diameter: 7,
        depth: Math.min(12, host.height),
        through: false,
        templateName: 'Apron confirmat',
        feature: 'confirmat',
      })
    ),
  };
}

function createApronSideConfirmatOps(apron: Part, support: SectionSupport, sideKey: 'left' | 'right') {
  const source = withGeneratedSource(apron, sideKey, 'apron-side-confirmat');
  const offsets = getApronVerticalOffsets(apron);
  const supportX = apron.thickness / 2;
  return {
    apronOps: offsets.map((offset) =>
      createDrillOperation({
        source,
        face: sideKey,
        axis: getFaceAxis(sideKey),
        x: supportX,
        y: offset,
        diameter: 7,
        depth: Math.min(50, apron.width),
        through: false,
        templateName: 'Apron side confirmat',
        feature: 'confirmat',
      })
    ),
    supportOps: offsets.map((offset) =>
      {
        const targetAnchor = {
          x: getApronSupportLocalX(apron, support),
          y: getApronSupportLocalY(apron, support.supportPart, offset),
        };
        debugJoineryPair(
          'rear-rail-to-side-confirmat',
          apron,
          support.supportPart,
          sideKey,
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
          diameter: 7,
          depth: Math.min(12, support.supportPart.width),
          through: false,
          templateName: 'Apron side confirmat',
          feature: 'confirmat',
        });
      }
    ),
  };
}

function createApronSideMinifixOps(apron: Part, support: SectionSupport, sideKey: 'left' | 'right') {
  const source = withGeneratedSource(apron, sideKey, 'apron-side-minifix');
  const offsets = getApronVerticalOffsets(apron);
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
        const targetAnchor = {
          x: getApronSupportLocalX(apron, support),
          y: getApronSupportLocalY(apron, support.supportPart, offset),
        };
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

function findSectionSupport(
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

function getBottomInheritedJoinery(
  supportPartId: string,
  candidates: Map<string, { joinery: JoineryType; y: number }[]>
): JoineryType {
  const items = (candidates.get(supportPartId) ?? []).filter((item) => item.joinery === 'confirmat' || item.joinery === 'minifix-dowel');
  if (items.length === 0) return 'confirmat';
  items.sort((a, b) => a.y - b.y);
  return items[0]!.joinery;
}

export function applyGeneratedJoinery(parts: Part[], rules: AutoJointRuleDraft = getDefaultAutoJointRules()): Part[] {
  const cleaned = parts.map(withoutGeneratedOps);
  const updates = new Map<string, DrillOperation[]>();
  const byGroup = new Map<string, Part[]>();

  cleaned.forEach((part) => {
    const groupId = part.meta?.groupId;
    if (!groupId) return;
    byGroup.set(groupId, [...(byGroup.get(groupId) ?? []), part]);
  });

  byGroup.forEach((groupParts) => {
    const leftSide = groupParts.find((part) => part.meta?.role === 'left-side');
    const rightSide = groupParts.find((part) => part.meta?.role === 'right-side');
    const top = groupParts.find((part) => part.meta?.role === 'top');
    const bottom = groupParts.find((part) => part.meta?.role === 'bottom');
    const layoutCarrier = groupParts.find((part) => part.meta?.role === 'left-side' && part.meta?.cabinetLayout);
    if (!leftSide || !rightSide || !top || !bottom || !layoutCarrier?.meta?.cabinetLayout) return;

    const resolved = resolveCabinetLayout(layoutCarrier.meta.cabinetLayout, bottom.width);
    const partitionsByX = new Map<string, Part>();
    const plinthEnabled = isPlinthEnabled(groupParts);
    const overlayTop = isOverlayTop(top, bottom);
    resolved.partitions.forEach((partition) => {
      const supportPart = groupParts.find((part) => part.meta?.role === 'partition' && part.meta?.sourceId === partition.id);
      if (supportPart) partitionsByX.set(partition.x.toFixed(3), supportPart);
    });

    const supportCandidates = new Map<string, { joinery: JoineryType; y: number }[]>();
    const topJoinery = top.meta?.joinery ?? createEmptySideJoinery();

    const sectionByShelfId = new Map(
      layoutCarrier.meta.cabinetLayout.shelves.map((shelf) => [shelf.id, shelf.sectionId])
    );

    const topSupports: SectionSupport[] = overlayTop
      ? [
          {
            supportPart: leftSide,
            sectionSide: 'left',
            supportFace: topJoinery.left === 'minifix-dowel' ? 'right' : 'top',
          },
          {
            supportPart: rightSide,
            sectionSide: 'right',
            supportFace: topJoinery.right === 'minifix-dowel' ? 'left' : 'top',
          },
        ]
      : plinthEnabled
        ? [
            { supportPart: leftSide, sectionSide: 'left', supportFace: 'right' },
            { supportPart: rightSide, sectionSide: 'right', supportFace: 'left' },
          ]
        : [
            { supportPart: leftSide, sectionSide: 'left', supportFace: 'right' },
            { supportPart: rightSide, sectionSide: 'right', supportFace: 'left' },
            ...groupParts
              .filter((part) => part.meta?.role === 'partition')
              .map((supportPart) => ({ supportPart, sectionSide: 'right' as const, supportFace: 'top' as const })),
          ];

    if (overlayTop) {
      topSupports.forEach((support) => {
        const sideKey = support.sectionSide;
        const joinery = support.supportPart.meta?.role === 'left-side'
          ? topJoinery.left
          : topJoinery.right;
        const ops = joinery === 'minifix-dowel'
          ? createOverlayTopMinifixOps(top, support, rules)
          : joinery === 'confirmat'
            ? createOverlayTopConfirmatOps(top, support.supportPart, sideKey, rules)
            : { horizontalOps: [] as DrillOperation[], supportOps: [] as DrillOperation[] };
        appendOps(updates, top.id, ops.horizontalOps);
        appendOps(updates, support.supportPart.id, ops.supportOps);
      });
    } else {
      topSupports.forEach((support, idx) => {
        const sideKey = support.sectionSide === 'left' ? 'left' : 'right';
        const joinery =
          support.supportPart.meta?.role === 'left-side'
            ? topJoinery.left
            : support.supportPart.meta?.role === 'right-side'
              ? topJoinery.right
              : (plinthEnabled ? 'minifix-dowel' : 'confirmat') satisfies JoineryType;
        const ops = createTopJoineryOps(top, support, support.supportPart.meta?.role === 'partition' ? `top-${idx}` : sideKey, joinery, rules);
        appendOps(updates, top.id, ops.horizontalOps);
        appendOps(updates, support.supportPart.id, ops.supportOps);
      });
    }

    groupParts
      .filter((part) => part.meta?.role === 'shelf' && part.meta?.sourceId)
      .forEach((shelfPart) => {
        const sectionId = sectionByShelfId.get(shelfPart.meta?.sourceId ?? '');
        const section = resolved.leafSections.find((item) => item.id === sectionId);
        if (!section) return;
        const leftSupport = findSectionSupport(groupParts, section, 'left', partitionsByX);
        const rightSupport = findSectionSupport(groupParts, section, 'right', partitionsByX);
        const joinery = shelfPart.meta?.joinery ?? createEmptySideJoinery();

        if (leftSupport) {
          const ops = createHorizontalJoineryOps(shelfPart, leftSupport, 'left', joinery.left, rules);
          appendOps(updates, shelfPart.id, ops.horizontalOps);
          appendOps(updates, leftSupport.supportPart.id, ops.supportOps);
          supportCandidates.set(leftSupport.supportPart.id, [...(supportCandidates.get(leftSupport.supportPart.id) ?? []), { joinery: joinery.left, y: shelfPart.position.y }]);
        }
        if (rightSupport) {
          const ops = createHorizontalJoineryOps(shelfPart, rightSupport, 'right', joinery.right, rules);
          appendOps(updates, shelfPart.id, ops.horizontalOps);
          appendOps(updates, rightSupport.supportPart.id, ops.supportOps);
          supportCandidates.set(rightSupport.supportPart.id, [...(supportCandidates.get(rightSupport.supportPart.id) ?? []), { joinery: joinery.right, y: shelfPart.position.y }]);
        }
      });

    groupParts
      .filter((part) => part.meta?.role === 'apron' && part.meta?.sourceId)
      .forEach((apronPart) => {
        const [hostRole, sectionId, hostSourceId] = (apronPart.meta?.sourceId ?? '').split(':');
        const section = resolved.leafSections.find((item) => item.id === sectionId);
        if (!section) return;
        const leftSupport = findSectionSupport(groupParts, section, 'left', partitionsByX);
        const rightSupport = findSectionSupport(groupParts, section, 'right', partitionsByX);
        const hostPart =
          hostRole === 'top'
            ? top
            : hostRole === 'bottom'
              ? bottom
              : groupParts.find((part) => part.meta?.role === 'shelf' && part.meta?.sourceId === hostSourceId) ?? null;
        if (!hostPart) return;

        const hostJoinery = hostPart.meta?.joinery ?? createEmptySideJoinery();
        const hostOps = hostRole === 'bottom'
          ? createApronToHostConfirmatOps(apronPart, hostPart, `apron-host-${sectionId}`, 'top', 'bottom')
          : createApronToHostConfirmatOps(apronPart, hostPart, `apron-host-${sectionId}`, 'bottom', 'top');
        appendOps(updates, apronPart.id, hostOps.apronOps);
        appendOps(updates, hostPart.id, hostOps.hostOps);

        if (leftSupport) {
          const leftJoinery = normalizeApronJoinery(
            hostRole === 'bottom'
              ? getBottomInheritedJoinery(leftSupport.supportPart.id, supportCandidates)
              : hostJoinery.left
          );
          if (leftJoinery !== 'none') {
            const ops = leftJoinery === 'minifix-dowel'
              ? createApronSideMinifixOps(apronPart, leftSupport, 'left')
              : createApronSideConfirmatOps(apronPart, leftSupport, 'left');
            appendOps(updates, apronPart.id, ops.apronOps);
            appendOps(updates, leftSupport.supportPart.id, ops.supportOps);
          }
        }
        if (rightSupport) {
          const rightJoinery = normalizeApronJoinery(
            hostRole === 'bottom'
              ? getBottomInheritedJoinery(rightSupport.supportPart.id, supportCandidates)
              : hostJoinery.right
          );
          if (rightJoinery !== 'none') {
            const ops = rightJoinery === 'minifix-dowel'
              ? createApronSideMinifixOps(apronPart, rightSupport, 'right')
              : createApronSideConfirmatOps(apronPart, rightSupport, 'right');
            appendOps(updates, apronPart.id, ops.apronOps);
            appendOps(updates, rightSupport.supportPart.id, ops.supportOps);
          }
        }
      });

    const bottomSupports: SectionSupport[] = [
      { supportPart: leftSide, sectionSide: 'left', supportFace: 'right' },
      ...groupParts
        .filter((part) => part.meta?.role === 'partition')
        .map((supportPart) => ({ supportPart, sectionSide: 'right' as const, supportFace: 'left' as const })),
      { supportPart: rightSide, sectionSide: 'right', supportFace: 'left' },
    ];

    bottomSupports.forEach((support, idx) => {
      const joinery = getBottomInheritedJoinery(support.supportPart.id, supportCandidates);
      const ops = createHorizontalJoineryOps(bottom, support, `bottom-${idx}`, joinery, rules);
      appendOps(updates, bottom.id, ops.horizontalOps);
      appendOps(updates, support.supportPart.id, ops.supportOps);
    });
  });

  return cleaned.map((part) =>
    updates.has(part.id)
      ? { ...part, operations: [...part.operations, ...(updates.get(part.id) ?? [])] }
      : part
  );
}
