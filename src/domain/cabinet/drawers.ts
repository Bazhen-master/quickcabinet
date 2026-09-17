// Ящики: геометрия коробов, длина направляющих, присадка стенок и фасадов ящика.
import type { DrawerRunnerLength, CabinetDrawerStackSpec } from '../cabinet-layout';
import type { Part } from '../part';
import { createDrillOperation, getFaceAxis } from '../drill';
import { CONFIRMAT_HEAD_DEPTH, CONFIRMAT_HEAD_DIAMETER, CONFIRMAT_THREAD_DEPTH, CONFIRMAT_THREAD_DIAMETER, DEFAULT_DRAWER_RUNNER_LENGTH, DRAWER_BOX_HEIGHT_REDUCTION, DRAWER_BOX_WIDTH_REDUCTION, DRAWER_FACADE_SIDE_CLEARANCE, DRAWER_FINGER_CLEARANCE, DRAWER_FRONT_BACK_LOWER_BY, DRAWER_RUNNER_AUTO_BACK_CLEARANCE, DRAWER_RUNNER_AUTO_FRONT_CLEARANCE, DRAWER_RUNNER_LENGTHS, GENERATED_DRAWER_SOURCE_PREFIX, HANDLED_FRONT_GAP, MIN_DRAWER_FACADE_HEIGHT } from './constants';
import type { CabinetFrontOpeningMode } from './types';

type DrawerGeometry = {
  facadeWidth: number;
  facadeHeight: number;
  boxWidth: number;
  boxHeight: number;
  boxDepth: number;
  sideHeight: number;
  frontBackHeight: number;
};

export function getDrawerGeometry(sectionWidth: number, tierHeight: number, drawerCount: number, runnerLength: number, frontOpeningMode: CabinetFrontOpeningMode) : DrawerGeometry {
  const slotHeight = tierHeight / Math.max(1, drawerCount);
  const facadeHeight = frontOpeningMode === 'handles'
    ? Math.max(60, (tierHeight - HANDLED_FRONT_GAP * (Math.max(1, drawerCount) + 1)) / Math.max(1, drawerCount))
    : Math.max(60, slotHeight - DRAWER_FINGER_CLEARANCE);
  const boxHeight = Math.max(40, facadeHeight - DRAWER_BOX_HEIGHT_REDUCTION);
  return {
    facadeWidth: Math.max(100, sectionWidth - DRAWER_FACADE_SIDE_CLEARANCE),
    facadeHeight,
    boxWidth: Math.max(80, sectionWidth - DRAWER_BOX_WIDTH_REDUCTION),
    boxHeight,
    boxDepth: runnerLength,
    sideHeight: boxHeight,
    frontBackHeight: Math.max(20, boxHeight - DRAWER_FRONT_BACK_LOWER_BY),
  };
}

export function getAutoDrawerRunnerLength(cabinetDepth: number): DrawerRunnerLength {
  const availableDepth = cabinetDepth - DRAWER_RUNNER_AUTO_FRONT_CLEARANCE - DRAWER_RUNNER_AUTO_BACK_CLEARANCE;
  const fitting = DRAWER_RUNNER_LENGTHS.filter((length) => length <= availableDepth);
  return fitting[fitting.length - 1] ?? DRAWER_RUNNER_LENGTHS[0] ?? DEFAULT_DRAWER_RUNNER_LENGTH;
}

export function getEffectiveDrawerRunnerLength(drawerStack: CabinetDrawerStackSpec, cabinetDepth: number): DrawerRunnerLength {
  return drawerStack.runnerLengthMode === 'auto'
    ? getAutoDrawerRunnerLength(cabinetDepth)
    : drawerStack.runnerLength;
}

export function getMaxDrawerCountForClearHeight(clearHeight: number) {
  return Math.max(0, Math.floor(clearHeight / (MIN_DRAWER_FACADE_HEIGHT + DRAWER_FINGER_CLEARANCE)));
}

function getDrawerJoineryVerticalOffsets(height: number) {
  const clampY = (value: number) => Math.max(18, Math.min(height - 18, value));
  if (height <= 80) return [height / 2];
  return [clampY(height / 3), clampY(height * 2 / 3)];
}

export function createDrawerWallConfirmatOps(
  sidePart: Part,
  wallPart: Part,
  side: 'left' | 'right',
  wallKey: 'back' | 'inner-front'
) {
  const source = `${GENERATED_DRAWER_SOURCE_PREFIX}${sidePart.id}:${wallKey}-confirmat:${side}`;
  const yOffsets = getDrawerJoineryVerticalOffsets(wallPart.height);
  const sideFace = side === 'left' ? 'left' : 'right';
  const wallFace = side === 'left' ? 'left' : 'right';
  const sideX = wallKey === 'back'
    ? Math.max(9, sidePart.thickness - wallPart.thickness / 2)
    : Math.max(9, wallPart.thickness / 2);
  const wallX = wallPart.thickness / 2;
  const templateName = wallKey === 'back' ? 'Drawer back confirmat' : 'Drawer inner front confirmat';
  return {
    sideOps: yOffsets.map((offset) =>
      createDrillOperation({
        source,
        face: sideFace,
        axis: getFaceAxis(sideFace),
        x: sideX,
        y: sidePart.height / 2 - (wallPart.position.y + wallPart.height / 2 - offset - sidePart.position.y),
        diameter: CONFIRMAT_HEAD_DIAMETER,
        depth: Math.min(CONFIRMAT_HEAD_DEPTH, sidePart.width),
        through: false,
        templateName,
        feature: 'confirmat',
      })
    ),
    wallOps: yOffsets.map((offset) =>
      createDrillOperation({
        source,
        face: wallFace,
        axis: getFaceAxis(wallFace),
        x: wallX,
        y: offset,
        diameter: CONFIRMAT_THREAD_DIAMETER,
        depth: Math.min(CONFIRMAT_THREAD_DEPTH, wallPart.width),
        through: false,
        templateName,
        feature: 'confirmat',
      })
    ),
  };
}

export function createDrawerFacadeMinifixOps(facadePart: Part, sidePart: Part, side: 'left' | 'right', withMinifix: boolean) {
  const source = `${GENERATED_DRAWER_SOURCE_PREFIX}${facadePart.id}:facade-minifix:${side}`;
  const sideFace = side === 'left' ? 'left' as const : 'right' as const;
  const localYOnSide = Math.max(18, Math.min(sidePart.height - 18, 20));
  const projectSideWorldXToFacadeX = (worldX: number) => {
    const facadeLocalX = worldX - (facadePart.position.x - facadePart.width / 2);
    return Math.max(8, Math.min(facadePart.width - 8, facadeLocalX));
  };
  const xOnFacade = projectSideWorldXToFacadeX(sidePart.position.x);
  const projectSideLocalYToFacadeY = (sideLocalY: number) => {
    const worldY = sidePart.position.y + sidePart.height / 2 - sideLocalY;
    const facadeLocalY = facadePart.position.y + facadePart.height / 2 - worldY;
    return Math.max(18, Math.min(facadePart.height - 18, facadeLocalY));
  };
  const referenceFacadeY = projectSideLocalYToFacadeY(localYOnSide);
  const connectorPinYOnFacade = referenceFacadeY;
  const dowelYOnSide = Math.max(18, Math.min(sidePart.height - 18, localYOnSide + 32));
  const dowelYOnFacade = projectSideLocalYToFacadeY(dowelYOnSide);
  const sideX = Math.max(9, Math.min(sidePart.thickness - 9, 32));
  return {
    facadeOps: [
      ...(withMinifix
        ? [createDrillOperation({
            source,
            face: 'back',
            axis: getFaceAxis('back'),
            x: xOnFacade,
            y: connectorPinYOnFacade,
            diameter: 5,
            depth: Math.min(12, facadePart.thickness),
            through: false,
            templateName: 'Drawer facade connector pin',
            feature: 'connector-pin',
          })]
        : []),
      createDrillOperation({
        source,
        face: 'back',
        axis: getFaceAxis('back'),
        x: xOnFacade,
        y: dowelYOnFacade,
        diameter: 8,
        depth: Math.min(12, facadePart.thickness),
        through: false,
        templateName: 'Drawer facade dowel',
        feature: 'dowel',
      }),
    ],
    sideOps: [
      ...(withMinifix
        ? [
            createDrillOperation({
              source,
              face: sideFace,
              axis: getFaceAxis(sideFace),
              x: sideX,
              y: localYOnSide,
              diameter: 15,
              depth: Math.min(12, sidePart.width),
              through: false,
              templateName: 'Drawer facade cam housing',
              feature: 'cam-housing',
            }),
            createDrillOperation({
              source,
              face: 'front',
              axis: getFaceAxis('front'),
              x: sidePart.width / 2,
              y: localYOnSide,
              diameter: 8,
              depth: Math.min(30, sidePart.thickness),
              through: false,
              templateName: 'Top connector pin',
              feature: 'connector-pin',
            }),
          ]
        : []),
      createDrillOperation({
        source,
        face: 'front',
        axis: getFaceAxis('front'),
        x: sidePart.width / 2,
        y: dowelYOnSide,
        diameter: 8,
        depth: Math.min(12, sidePart.thickness),
        through: false,
        templateName: 'Drawer facade dowel',
        feature: 'dowel',
      }),
    ],
  };
}

export function createDrawerBottomFacadeMinifixOps(facadePart: Part, bottomPart: Part) {
  const source = `${GENERATED_DRAWER_SOURCE_PREFIX}${facadePart.id}:bottom-facade-minifix`;
  const commonWidth = Math.min(facadePart.width, bottomPart.width);
  const worldXOffsets = [
    facadePart.position.x - commonWidth / 4,
    facadePart.position.x + commonWidth / 4,
  ];
  const xOffsets = worldXOffsets.map((worldX) =>
    Math.max(34, Math.min(facadePart.width - 34, worldX - (facadePart.position.x - facadePart.width / 2)))
  );
  const bottomXOffsets = worldXOffsets.map((worldX) =>
    Math.max(34, Math.min(bottomPart.width - 34, worldX - (bottomPart.position.x - bottomPart.width / 2)))
  );
  // The bottom's connector line measured down the facade, so an overlay facade reaching past the box still lines up.
  const yOnFacade = Math.max(18, Math.min(facadePart.height - 18, facadePart.position.y + facadePart.height / 2 - bottomPart.position.y));
  return {
    facadeOps: xOffsets.map((x) =>
      createDrillOperation({
        source,
        face: 'back',
        axis: getFaceAxis('back'),
        x,
        y: yOnFacade,
        diameter: 5,
        depth: Math.min(12, facadePart.thickness),
        through: false,
        templateName: 'Drawer bottom connector pin',
        feature: 'connector-pin',
      })
    ),
    bottomOps: bottomXOffsets.map((x) =>
      createDrillOperation({
        source,
        face: 'bottom',
        axis: getFaceAxis('bottom'),
        x,
        y: Math.max(34, Math.min(bottomPart.thickness - 34, 34)),
        diameter: 15,
        depth: Math.min(12, bottomPart.height),
        through: false,
        templateName: 'Drawer bottom cam housing',
        feature: 'cam-housing',
      })
    ).concat(
      bottomXOffsets.map((x) =>
        createDrillOperation({
          source,
          face: 'front',
          axis: getFaceAxis('front'),
          x,
          y: bottomPart.height / 2,
          diameter: 8,
          depth: Math.min(30, bottomPart.thickness),
          through: false,
          templateName: 'Drawer bottom connector pin',
          feature: 'connector-pin',
        })
      )
    ),
  };
}

export function createDrawerWallBottomConfirmatOps(wallPart: Part, bottomPart: Part, wallKey: 'back' | 'inner-front') {
  const source = `${GENERATED_DRAWER_SOURCE_PREFIX}${wallPart.id}:bottom-confirmat`;
  const xOffsets = [wallPart.width / 4, wallPart.width * 3 / 4];
  const wallCenterLocalZOnBottom = wallPart.position.z - bottomPart.position.z;
  const yOnBottom = Math.max(
    8,
    Math.min(bottomPart.thickness - 8, bottomPart.thickness / 2 - wallCenterLocalZOnBottom)
  );
  const templateName = wallKey === 'back' ? 'Drawer back bottom confirmat' : 'Drawer inner front bottom confirmat';
  return {
    bottomOps: xOffsets.map((x) =>
      createDrillOperation({
        source,
        face: 'bottom',
        axis: getFaceAxis('bottom'),
        x: Math.max(8, Math.min(bottomPart.width - 8, x)),
        y: yOnBottom,
        diameter: CONFIRMAT_HEAD_DIAMETER,
        depth: Math.min(CONFIRMAT_HEAD_DEPTH, bottomPart.height),
        through: false,
        templateName,
        feature: 'confirmat',
      })
    ),
    backOps: xOffsets.map((x) =>
      createDrillOperation({
        source,
        face: 'bottom',
        axis: getFaceAxis('bottom'),
        x: Math.max(8, Math.min(wallPart.width - 8, x)),
        y: wallPart.thickness / 2,
        diameter: CONFIRMAT_THREAD_DIAMETER,
        depth: Math.min(CONFIRMAT_THREAD_DEPTH, wallPart.height),
        through: false,
        templateName,
        feature: 'confirmat',
      })
    ),
  };
}

export function createDrawerSideBottomConfirmatOps(sidePart: Part, bottomPart: Part, side: 'left' | 'right') {
  const source = `${GENERATED_DRAWER_SOURCE_PREFIX}${sidePart.id}:bottom-confirmat`;
  const sideFace = side === 'left' ? 'left' as const : 'right' as const;
  const bottomFace = side === 'left' ? 'left' as const : 'right' as const;
  const xOffsets = [sidePart.thickness / 4, sidePart.thickness * 3 / 4];
  const sideY = Math.max(
    8,
    Math.min(sidePart.height - 8, sidePart.height / 2 - (bottomPart.position.y - sidePart.position.y))
  );
  const projectSideDepthToBottomDepth = (xOnSide: number) => {
    const worldZ = sidePart.position.z + sidePart.thickness / 2 - xOnSide;
    return Math.max(
      8,
      Math.min(bottomPart.thickness - 8, bottomPart.thickness / 2 - (worldZ - bottomPart.position.z))
    );
  };
  const templateName = 'Drawer side bottom confirmat';
  return {
    sideOps: xOffsets.map((x) =>
      createDrillOperation({
        source,
        face: sideFace,
        axis: getFaceAxis(sideFace),
        x: Math.max(8, Math.min(sidePart.thickness - 8, x)),
        y: sideY,
        diameter: CONFIRMAT_HEAD_DIAMETER,
        depth: Math.min(CONFIRMAT_HEAD_DEPTH, sidePart.width),
        through: false,
        templateName,
        feature: 'confirmat',
      })
    ),
    bottomOps: xOffsets.map((x) =>
      createDrillOperation({
        source,
        face: bottomFace,
        axis: getFaceAxis(bottomFace),
        x: projectSideDepthToBottomDepth(x),
        y: bottomPart.height / 2,
        diameter: CONFIRMAT_THREAD_DIAMETER,
        depth: Math.min(CONFIRMAT_THREAD_DEPTH, bottomPart.width),
        through: false,
        templateName,
        feature: 'confirmat',
      })
    ),
  };
}
