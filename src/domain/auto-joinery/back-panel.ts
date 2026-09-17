// Крепёж задней стенки из плиты к крыше, дну и боковинам.
import type { Part, PartFace } from '../part';
import { projectWorldPointToFace, getFacePointWorld } from '../face-coords';
import { createDrillOperation, getFaceAxis, isDrillOperation } from '../drill';
import { type AutoJointRuleDraft, CONFIRMAT_HEAD_DEPTH, CONFIRMAT_HEAD_DIAMETER, CONFIRMAT_THREAD_DEPTH, CONFIRMAT_THREAD_DIAMETER, MINIFIX_CONNECTOR_CHANNEL_HOLE_DIAMETER, RAFIX_CENTER_FROM_EDGE, RAFIX_MATE_DEPTH, RAFIX_MATE_DIAMETER, camCenterOffsetFromEdge, createBackPanelRafixHousingOps, getBackPanelDistributedOffsets, getBackPanelRearInset, getCamCenterOffsetFromMountingEdge, getCamCenterOffsetFromTopEdge, getFaceMaxDepth, getWorldAnchorPosition, shiftRafixMateTowardCenter, withGeneratedSource } from './core';

export function createBackPanelTopConfirmatOps(topPart: Part, backPanel: Part) {
  const source = withGeneratedSource(topPart, 'back-panel', 'top-back-confirmat');
  const offsets = getBackPanelDistributedOffsets(backPanel.width);
  const backEdgeY = Math.max(9, Math.min(topPart.thickness - 9, topPart.thickness - 9));
  return {
    topOps: offsets.map((offset) => {
      const backWorld = getWorldAnchorPosition(backPanel, 'top', { x: offset, y: 0 });
      const topAnchor = projectWorldPointToFace(topPart, 'top', backWorld);
      return createDrillOperation({
        source,
        face: 'top',
        axis: getFaceAxis('top'),
        x: topAnchor.x,
        y: topAnchor.y,
        diameter: CONFIRMAT_HEAD_DIAMETER,
        depth: Math.min(CONFIRMAT_HEAD_DEPTH, topPart.height),
        through: false,
        templateName: 'Back panel top confirmat',
        feature: 'confirmat',
      });
    }),
    backOps: offsets.map((offset) => {
      const backAnchor = { x: offset, y: 0 };
      return createDrillOperation({
        source,
        face: 'top',
        axis: getFaceAxis('top'),
        x: backAnchor.x,
        y: backAnchor.y,
        diameter: CONFIRMAT_THREAD_DIAMETER,
        depth: Math.min(CONFIRMAT_THREAD_DEPTH, backPanel.height),
        through: false,
        templateName: 'Back panel top confirmat',
        feature: 'confirmat',
      });
    }),
  };
}

export function createBackPanelTopMinifixOps(topPart: Part, backPanel: Part, rules: AutoJointRuleDraft) {
  const source = withGeneratedSource(topPart, 'back-panel', 'top-back-minifix-dowel');
  const offsets = getBackPanelDistributedOffsets(backPanel.width);
  const carrierCenterY = getCamCenterOffsetFromTopEdge(backPanel.height);
  const backPanelRearInset = getBackPanelRearInset(backPanel);

  return {
    topOps: offsets.flatMap((offset) => {
      const backWorld = getWorldAnchorPosition(backPanel, 'top', { x: offset, y: backPanelRearInset });
      const connectorAnchor = projectWorldPointToFace(topPart, 'bottom', backWorld);
      return [
        createDrillOperation({
          source,
          face: 'bottom',
          axis: getFaceAxis('bottom'),
          x: connectorAnchor.x,
          y: connectorAnchor.y,
          diameter: 5,
          depth: Math.min(12, topPart.height),
          through: false,
          templateName: 'Back panel connector pin',
          feature: 'connector-pin',
        }),
      ];
    }),
    backOps: offsets.flatMap((offset) => {
      const connectorWorld = getWorldAnchorPosition(backPanel, 'top', { x: offset, y: backPanelRearInset });
      const camAnchor = projectWorldPointToFace(backPanel, 'front', {
        x: connectorWorld.x,
        y: backPanel.position.y + backPanel.height / 2 - carrierCenterY,
        z: backPanel.position.z + backPanel.thickness / 2,
      });
      const connectorAnchor = { x: offset, y: backPanelRearInset };
      return [
        createDrillOperation({
          source,
          face: 'front',
          axis: getFaceAxis('front'),
          x: camAnchor.x,
          y: camAnchor.y,
          diameter: 15,
          depth: Math.min(12, backPanel.thickness),
          through: false,
          templateName: 'Back panel cam housing',
          feature: 'cam-housing',
        }),
        createDrillOperation({
          source,
          face: 'top',
          axis: getFaceAxis('top'),
          x: connectorAnchor.x,
          y: connectorAnchor.y,
          diameter: 8,
          depth: Math.min(30, backPanel.height),
          through: false,
          templateName: 'Back panel connector pin',
          feature: 'connector-pin',
        }),
      ];
    }),
  };
}

/**
 * Fastener spots along a back panel's bottom edge, stepped off holes the host already has from its under face (the plinth
 * back rail's dowels sit right under the back panel): holes drilled there from both faces would meet through the host.
 */
function getBackPanelBottomOffsets(backPanel: Part, host: Part, yOnPanelEdge: number, holeDiameter: number) {
  const blockers = host.operations
    .filter(isDrillOperation)
    .filter((op) => op.face === 'bottom')
    .map((op) => ({ point: getFacePointWorld(host, op.face, op), diameter: op.diameter }));
  const clampOffset = (value: number) => Math.max(24, Math.min(backPanel.width - 24, value));
  return getBackPanelDistributedOffsets(backPanel.width).map((offset) => {
    for (const shift of [0, 32, -32, 64, -64]) {
      const candidate = clampOffset(offset + shift);
      const world = getWorldAnchorPosition(backPanel, 'bottom', { x: candidate, y: yOnPanelEdge });
      const clear = blockers.every(({ point, diameter }) => Math.hypot(point.x - world.x, point.z - world.z) >= (diameter + holeDiameter) / 2 + 1);
      if (clear) return candidate;
    }
    return offset;
  });
}

export function createBackPanelBottomMinifixOps(bottomPart: Part, backPanel: Part, rules: AutoJointRuleDraft) {
  const source = withGeneratedSource(bottomPart, 'back-panel-bottom', 'bottom-back-minifix-dowel');
  const backPanelRearInset = getBackPanelRearInset(backPanel);
  const offsets = getBackPanelBottomOffsets(backPanel, bottomPart, backPanelRearInset, MINIFIX_CONNECTOR_CHANNEL_HOLE_DIAMETER);
  const carrierCenterY = Math.max(9, Math.min(backPanel.height - 9, backPanel.height - camCenterOffsetFromEdge));

  return {
    bottomOps: offsets.flatMap((offset) => {
      const backWorld = getWorldAnchorPosition(backPanel, 'bottom', { x: offset, y: backPanelRearInset });
      const connectorAnchor = projectWorldPointToFace(bottomPart, 'top', backWorld);
      return [
        createDrillOperation({
          source,
          face: 'top',
          axis: getFaceAxis('top'),
          x: connectorAnchor.x,
          y: connectorAnchor.y,
          diameter: 5,
          depth: Math.min(12, bottomPart.height),
          through: false,
          templateName: 'Back panel connector pin',
          feature: 'connector-pin',
        }),
      ];
    }),
    backOps: offsets.flatMap((offset) => {
      const connectorWorld = getWorldAnchorPosition(backPanel, 'bottom', { x: offset, y: backPanelRearInset });
      const camAnchor = projectWorldPointToFace(backPanel, 'front', {
        x: connectorWorld.x,
        y: backPanel.position.y + backPanel.height / 2 - carrierCenterY,
        z: backPanel.position.z + backPanel.thickness / 2,
      });
      const connectorAnchor = { x: offset, y: backPanelRearInset };
      return [
        createDrillOperation({
          source,
          face: 'front',
          axis: getFaceAxis('front'),
          x: camAnchor.x,
          y: camAnchor.y,
          diameter: 15,
          depth: Math.min(12, backPanel.thickness),
          through: false,
          templateName: 'Back panel cam housing',
          feature: 'cam-housing',
        }),
        createDrillOperation({
          source,
          face: 'bottom',
          axis: getFaceAxis('bottom'),
          x: connectorAnchor.x,
          y: connectorAnchor.y,
          diameter: 8,
          depth: Math.min(30, backPanel.height),
          through: false,
          templateName: 'Back panel connector pin',
          feature: 'connector-pin',
        }),
      ];
    }),
  };
}

export function createBackPanelBottomConfirmatOps(bottomPart: Part, backPanel: Part) {
  const source = withGeneratedSource(bottomPart, 'back-panel-bottom', 'bottom-back-confirmat');
  const offsets = getBackPanelBottomOffsets(backPanel, bottomPart, 0, CONFIRMAT_HEAD_DIAMETER);
  const backEdgeY = Math.max(9, Math.min(bottomPart.thickness - 9, bottomPart.thickness - 9));
  return {
    bottomOps: offsets.map((offset) =>
      {
        const backWorld = getWorldAnchorPosition(backPanel, 'bottom', { x: offset, y: 0 });
        const bottomAnchor = projectWorldPointToFace(bottomPart, 'top', backWorld);
        return createDrillOperation({
          source,
          face: 'top',
          axis: getFaceAxis('top'),
          x: bottomAnchor.x,
          y: bottomAnchor.y,
          diameter: CONFIRMAT_HEAD_DIAMETER,
          depth: Math.min(CONFIRMAT_HEAD_DEPTH, bottomPart.height),
          through: false,
          templateName: 'Back panel bottom confirmat',
          feature: 'confirmat',
        });
      }
    ),
    backOps: offsets.map((offset) => {
      const anchor = { x: offset, y: 0 };
      return createDrillOperation({
        source,
        face: 'bottom',
        axis: getFaceAxis('bottom'),
        x: anchor.x,
        y: anchor.y,
        diameter: CONFIRMAT_THREAD_DIAMETER,
        depth: Math.min(CONFIRMAT_THREAD_DEPTH, backPanel.height),
        through: false,
        templateName: 'Back panel bottom confirmat',
        feature: 'confirmat',
      });
    }),
  };
}

export function createBackPanelTopToBottomFaceConfirmatOps(hostPart: Part, backPanel: Part) {
  const source = withGeneratedSource(hostPart, 'back-panel-top-bottom-face', 'top-back-confirmat');
  const offsets = getBackPanelDistributedOffsets(backPanel.width);
  return {
    hostOps: offsets.map((offset) => {
      const backWorld = getWorldAnchorPosition(backPanel, 'top', { x: offset, y: 0 });
      const hostAnchor = projectWorldPointToFace(hostPart, 'bottom', backWorld);
      return createDrillOperation({
        source,
        face: 'bottom',
        axis: getFaceAxis('bottom'),
        x: hostAnchor.x,
        y: hostAnchor.y,
        diameter: CONFIRMAT_HEAD_DIAMETER,
        depth: Math.min(CONFIRMAT_HEAD_DEPTH, hostPart.height),
        through: false,
        templateName: 'Back panel top confirmat',
        feature: 'confirmat',
      });
    }),
    backOps: offsets.map((offset) =>
      createDrillOperation({
        source,
        face: 'top',
        axis: getFaceAxis('top'),
        x: offset,
        y: 0,
        diameter: CONFIRMAT_THREAD_DIAMETER,
        depth: Math.min(CONFIRMAT_THREAD_DEPTH, backPanel.height),
        through: false,
        templateName: 'Back panel top confirmat',
        feature: 'confirmat',
      })
    ),
  };
}

/** Fastener heights along a back panel edge, optionally shifted (see BACK_PANEL_STAGGER). */
function getBackPanelEdgeOffsets(panelHeight: number, shift = 0) {
  return getBackPanelDistributedOffsets(panelHeight).map((offset) => Math.max(24, Math.min(panelHeight - 24, offset + shift)));
}

export function createBackPanelSideConfirmatOps(backPanel: Part, sidePart: Part, side: 'left' | 'right', shift = 0) {
  const source = withGeneratedSource(backPanel, side, 'back-panel-side-confirmat');
  const offsets = getBackPanelEdgeOffsets(backPanel.height, shift);
  const panelFace = side;
  const panelX = backPanel.thickness / 2;
  const supportFace = side;
  return {
    backOps: offsets.map((offset) =>
      createDrillOperation({
        source,
        face: panelFace,
        axis: getFaceAxis(panelFace),
        x: panelX,
        y: offset,
        diameter: CONFIRMAT_THREAD_DIAMETER,
        depth: Math.min(CONFIRMAT_THREAD_DEPTH, backPanel.width),
        through: false,
        templateName: 'Back panel side confirmat',
        feature: 'confirmat',
      })
    ),
    sideOps: offsets.map((offset) => {
      const world = getWorldAnchorPosition(backPanel, panelFace, { x: panelX, y: offset });
      const anchor = projectWorldPointToFace(sidePart, supportFace, {
        x: side === 'left'
          ? sidePart.position.x - sidePart.width / 2
          : sidePart.position.x + sidePart.width / 2,
        y: world.y,
        z: world.z,
      });
      return createDrillOperation({
        source,
        face: supportFace,
        axis: getFaceAxis(supportFace),
        x: anchor.x,
        y: anchor.y,
        diameter: CONFIRMAT_HEAD_DIAMETER,
        depth: Math.min(CONFIRMAT_HEAD_DEPTH, sidePart.width),
        through: false,
        templateName: 'Back panel side confirmat',
        feature: 'confirmat',
      });
    }),
  };
}

export function createBackPanelSideMinifixOps(backPanel: Part, sidePart: Part, side: 'left' | 'right', rules: AutoJointRuleDraft, shift = 0) {
  const source = withGeneratedSource(backPanel, side, 'back-panel-side-minifix-dowel');
  const offsets = getBackPanelEdgeOffsets(backPanel.height, shift);
  const panelFace: PartFace = side;
  const mateFace: PartFace = side === 'left' ? 'right' : 'left';
  const edgeX = backPanel.thickness / 2;
  const camOffset = getCamCenterOffsetFromMountingEdge(backPanel.width, side);
  return {
    backOps: offsets.flatMap((offset) => {
      return [
        createDrillOperation({
          source,
          face: 'front',
          axis: getFaceAxis('front'),
          x: camOffset,
          y: offset,
          diameter: 15,
          depth: Math.min(12, backPanel.thickness),
          through: false,
          templateName: 'Back panel cam housing',
          feature: 'cam-housing',
        }),
        createDrillOperation({
          source,
          face: panelFace,
          axis: getFaceAxis(panelFace),
          x: edgeX,
          y: offset,
          diameter: 8,
          depth: Math.min(30, backPanel.width),
          through: false,
          templateName: 'Back panel connector pin',
          feature: 'connector-pin',
        }),
      ];
    }),
    sideOps: offsets.flatMap((offset) => {
      const connectorWorld = getWorldAnchorPosition(backPanel, panelFace, { x: edgeX, y: offset });
      const connectorAnchor = projectWorldPointToFace(sidePart, mateFace, {
        x: mateFace === 'left' ? sidePart.position.x - sidePart.width / 2 : sidePart.position.x + sidePart.width / 2,
        y: connectorWorld.y,
        z: connectorWorld.z,
      });
      return [
        createDrillOperation({
          source,
          face: mateFace,
          axis: getFaceAxis(mateFace),
          x: connectorAnchor.x,
          y: connectorAnchor.y,
          diameter: 5,
          depth: Math.min(12, sidePart.width),
          through: false,
          templateName: 'Back panel connector pin',
          feature: 'connector-pin',
        }),
      ];
    }),
  };
}

export function createBackPanelTopRafixOps(hostPart: Part, backPanel: Part, hostFace: 'bottom' | 'top') {
  const source = withGeneratedSource(hostPart, 'back-panel', `top-back-rafix-${hostFace}`);
  const offsets = getBackPanelDistributedOffsets(backPanel.width);
  return {
    hostOps: offsets.map((offset) => {
      const housingWorld = getWorldAnchorPosition(backPanel, 'back', { x: offset, y: RAFIX_CENTER_FROM_EDGE });
      const hostAnchor = shiftRafixMateTowardCenter(hostPart, hostFace, projectWorldPointToFace(hostPart, hostFace, housingWorld));
      return createDrillOperation({
        source,
        face: hostFace,
        axis: getFaceAxis(hostFace),
        x: hostAnchor.x,
        y: hostAnchor.y,
        diameter: RAFIX_MATE_DIAMETER,
        depth: Math.min(RAFIX_MATE_DEPTH, getFaceMaxDepth(hostPart, hostFace)),
        through: false,
        templateName: 'Back panel Rafix mate',
        feature: 'connector-pin',
      });
    }),
    backOps: offsets.flatMap((offset) => createBackPanelRafixHousingOps(source, backPanel, offset, RAFIX_CENTER_FROM_EDGE)),
  };
}

export function createBackPanelBottomRafixOps(hostPart: Part, backPanel: Part) {
  const source = withGeneratedSource(hostPart, 'back-panel-bottom', 'bottom-back-rafix');
  const offsets = getBackPanelBottomOffsets(backPanel, hostPart, getBackPanelRearInset(backPanel), RAFIX_MATE_DIAMETER);
  return {
    hostOps: offsets.map((offset) => {
      const housingWorld = getWorldAnchorPosition(backPanel, 'back', { x: offset, y: backPanel.height - RAFIX_CENTER_FROM_EDGE });
      const hostAnchor = shiftRafixMateTowardCenter(hostPart, 'top', projectWorldPointToFace(hostPart, 'top', housingWorld));
      return createDrillOperation({
        source,
        face: 'top',
        axis: getFaceAxis('top'),
        x: hostAnchor.x,
        y: hostAnchor.y,
        diameter: RAFIX_MATE_DIAMETER,
        depth: Math.min(RAFIX_MATE_DEPTH, getFaceMaxDepth(hostPart, 'top')),
        through: false,
        templateName: 'Back panel Rafix mate',
        feature: 'connector-pin',
      });
    }),
    backOps: offsets.flatMap((offset) => createBackPanelRafixHousingOps(source, backPanel, offset, backPanel.height - RAFIX_CENTER_FROM_EDGE)),
  };
}

export function createBackPanelSideRafixOps(backPanel: Part, sidePart: Part, side: 'left' | 'right', shift = 0) {
  const source = withGeneratedSource(backPanel, side, 'back-panel-side-rafix');
  const offsets = getBackPanelEdgeOffsets(backPanel.height, shift);
  const panelX = side === 'left' ? RAFIX_CENTER_FROM_EDGE : backPanel.width - RAFIX_CENTER_FROM_EDGE;
  const mateFace: PartFace = side === 'left' ? 'right' : 'left';
  return {
    backOps: offsets.flatMap((offset) => createBackPanelRafixHousingOps(source, backPanel, panelX, offset)),
    sideOps: offsets.map((offset) => {
      const housingWorld = getWorldAnchorPosition(backPanel, 'back', { x: panelX, y: offset });
      const anchor = shiftRafixMateTowardCenter(
        sidePart,
        mateFace,
        projectWorldPointToFace(sidePart, mateFace, {
          x: mateFace === 'left'
            ? sidePart.position.x - sidePart.width / 2
            : sidePart.position.x + sidePart.width / 2,
          y: housingWorld.y,
          z: housingWorld.z,
        })
      );
      return createDrillOperation({
        source,
        face: mateFace,
        axis: getFaceAxis(mateFace),
        x: anchor.x,
        y: anchor.y,
        diameter: RAFIX_MATE_DIAMETER,
        depth: Math.min(RAFIX_MATE_DEPTH, getFaceMaxDepth(sidePart, mateFace)),
        through: false,
        templateName: 'Back panel Rafix mate',
        feature: 'connector-pin',
      });
    }),
  };
}
