// Конфирмат со шкантом — крепёж корпусов эталона Базиса 26163 (верхние модули, антресоли, пеналы).
//
// Стык «торец детали → пласть опоры». В паре конфирмат 7x50: сквозное в опоре и 34 в торце
// (16 + 34 = 50); шкант: 11 в опоре и 22 в торце. Раскладка по длине стыка, от переднего края:
//   - все отверстия на сетке 32 от первого конфирмата в 69 от переда;
//   - последний конфирмат — последний шаг сетки не ближе JOINT_BACK_MIN к задней кромке
//     (319 → 261, царга 250 → 197, цоколь 804 → 741);
//   - промежуточные конфирматы делят сетку поровну вниз (цоколь 804: 69/293/517/741,
//     дно 544: 69/261/453), число промежутков — как у минификса, шаг около 200;
//   - шкант в 32 от конфирмата в сторону середины стыка.
// У корпуса с накладной ХДФ последний конфирмат по глубине отступает ещё на шаг (`jointBackReserve`):
// крыша, дно и перегородки антресолей 544 — 453 (91 от зада), полка в нише пенала без ХДФ — 485 (59).
// Стык «на концах» (перегородка к крыше и дну) — только передняя и задняя пары.
import type { Part, PartFace } from '../part';
import { createDrillOperation, getFaceAxis, type DrillOperation } from '../drill';
import { projectWorldPointToFace } from '../face-coords';
import { type AutoJointRuleDraft, withGeneratedSource } from './core';

const JOINT_FRONT_CONFIRMAT = 69;
const JOINT_GRID_STEP = 32;
const JOINT_BACK_MIN = 53;
const JOINT_PAIR_MAX_STEP = 200;
const CONFIRMAT_HOST_DIAMETER = 7;
const CONFIRMAT_EDGE_DIAMETER = 5;
const CONFIRMAT_EDGE_DEPTH = 34;
const DOWEL_DIAMETER = 8;
const DOWEL_HOST_DEPTH = 11;
const DOWEL_EDGE_DEPTH = 22;

export type ConfirmatDowelSpread = 'spread' | 'ends';
export type ConfirmatDowelPosition = { confirmat: number; dowel: number | null };
export type ConfirmatDowelLayout = {
  spread?: ConfirmatDowelSpread;
  /** Дополнительный отступ последнего крепежа от задней кромки. */
  backReserve?: number;
  /** Передняя пара заменена одним конфирматом на шаг ближе к краю (дно на ножках: там отверстие под ножку). */
  frontSingle?: boolean;
};

/** Положения конфирматов и шкантов вдоль стыка длиной `length`, от переднего края. */
export function getConfirmatDowelPositions(length: number, layout: ConfirmatDowelLayout = {}): ConfirmatDowelPosition[] {
  const lastStep = Math.floor((length - (layout.backReserve ?? 0) - JOINT_BACK_MIN - JOINT_FRONT_CONFIRMAT) / JOINT_GRID_STEP);
  // Короткий стык: один конфирмат посередине, без шканта.
  if (lastStep < 2) return [{ confirmat: length / 2, dowel: null }];
  const gaps = layout.spread === 'ends' ? 1 : Math.max(1, Math.round((lastStep * JOINT_GRID_STEP) / JOINT_PAIR_MAX_STEP));
  const steps = [...new Set(Array.from({ length: gaps + 1 }, (_, index) => Math.floor((lastStep * index) / gaps)))];
  return steps.map((step) => {
    const confirmat = JOINT_FRONT_CONFIRMAT + step * JOINT_GRID_STEP;
    if (step === 0 && layout.frontSingle) return { confirmat: confirmat - JOINT_GRID_STEP, dowel: null };
    return { confirmat, dowel: confirmat + (confirmat < length / 2 ? JOINT_GRID_STEP : -JOINT_GRID_STEP) };
  });
}

type Axis = 'x' | 'y' | 'z';
const sizeAlong = (part: Part, axis: Axis) => (axis === 'x' ? part.width : axis === 'y' ? part.height : part.thickness);
const minAlong = (part: Part, axis: Axis) => part.position[axis] - sizeAlong(part, axis) / 2;
const maxAlong = (part: Part, axis: Axis) => part.position[axis] + sizeAlong(part, axis) / 2;
const FACES: Record<'x' | 'y', { plus: PartFace; minus: PartFace }> = {
  x: { plus: 'right', minus: 'left' },
  y: { plus: 'top', minus: 'bottom' },
};
const TOUCH_TOLERANCE = 0.5;

/** Где торец `edgePart` упирается в пласть `host`: ось касания и грани обеих деталей. */
function findJointFaces(edgePart: Part, host: Part) {
  for (const axis of ['x', 'y'] as const) {
    if (Math.abs(maxAlong(edgePart, axis) - minAlong(host, axis)) < TOUCH_TOLERANCE) {
      return { axis, edgeFace: FACES[axis].plus, hostFace: FACES[axis].minus, plane: maxAlong(edgePart, axis) };
    }
    if (Math.abs(minAlong(edgePart, axis) - maxAlong(host, axis)) < TOUCH_TOLERANCE) {
      return { axis, edgeFace: FACES[axis].minus, hostFace: FACES[axis].plus, plane: minAlong(edgePart, axis) };
    }
  }
  return null;
}

/** Вдоль какой оси идёт стык и от какого конца отсчитывается: по умолчанию по глубине от переда. */
export type JointDirection = { axis: Axis; fromMax: boolean };
const FROM_FRONT: JointDirection = { axis: 'z', fromMax: true };

/**
 * Конфирматы и шканты в заданных точках стыка торца `edgePart` с пластью `host`: общий участок
 * деталей вдоль `direction`, отверстия по середине толщины `edgePart`. `source` — метка операций.
 */
export function createConfirmatDowelPointOps(edgePart: Part, host: Part, source: string, positions: (length: number) => ConfirmatDowelPosition[], direction: JointDirection = FROM_FRONT) {
  const joint = findJointFaces(edgePart, host);
  if (!joint) return { edgeOps: [] as DrillOperation[], hostOps: [] as DrillOperation[] };
  const across = (['x', 'y', 'z'] as const).find((axis) => axis !== joint.axis && axis !== direction.axis)!;
  const high = Math.min(maxAlong(edgePart, direction.axis), maxAlong(host, direction.axis));
  const low = Math.max(minAlong(edgePart, direction.axis), minAlong(host, direction.axis));
  const hostThickness = sizeAlong(host, joint.axis);
  const edgeOps: DrillOperation[] = [];
  const hostOps: DrillOperation[] = [];

  const drill = (position: number, kind: 'confirmat' | 'dowel') => {
    const world = { x: 0, y: 0, z: 0 };
    world[joint.axis] = joint.plane;
    world[direction.axis] = direction.fromMax ? high - position : low + position;
    world[across] = edgePart.position[across];
    const onEdge = projectWorldPointToFace(edgePart, joint.edgeFace, world);
    const onHost = projectWorldPointToFace(host, joint.hostFace, world);
    const confirmat = kind === 'confirmat';
    edgeOps.push(createDrillOperation({
      source, face: joint.edgeFace, axis: getFaceAxis(joint.edgeFace), x: onEdge.x, y: onEdge.y,
      diameter: confirmat ? CONFIRMAT_EDGE_DIAMETER : DOWEL_DIAMETER,
      depth: Math.min(confirmat ? CONFIRMAT_EDGE_DEPTH : DOWEL_EDGE_DEPTH, sizeAlong(edgePart, joint.axis)),
      through: false, templateName: confirmat ? 'Confirmat' : 'Dowel', feature: kind,
    }));
    hostOps.push(createDrillOperation({
      source, face: joint.hostFace, axis: getFaceAxis(joint.hostFace), x: onHost.x, y: onHost.y,
      diameter: confirmat ? CONFIRMAT_HOST_DIAMETER : DOWEL_DIAMETER,
      depth: confirmat ? hostThickness : Math.min(DOWEL_HOST_DEPTH, hostThickness),
      through: confirmat, templateName: confirmat ? 'Confirmat' : 'Dowel', feature: kind,
    }));
  };

  for (const { confirmat, dowel } of positions(high - low)) {
    drill(confirmat, 'confirmat');
    if (dowel !== null) drill(dowel, 'dowel');
  }
  return { edgeOps, hostOps };
}

/** Стык торца `edgePart` с пластью `host` на конфирматах со шкантами по правилам раскладки. */
export function createConfirmatDowelJointOps(edgePart: Part, host: Part, source: string, layout: ConfirmatDowelLayout = {}, direction: JointDirection = FROM_FRONT) {
  return createConfirmatDowelPointOps(edgePart, host, source, (length) => getConfirmatDowelPositions(length, layout), direction);
}

/** Горизонталь к опоре (боковине, перегородке) или перегородка к горизонтали — в раскладке `horizontalOps`/`supportOps`. */
export function createHorizontalConfirmatDowelOps(horizontalPart: Part, supportPart: Part, sideKey: string, rules: AutoJointRuleDraft) {
  const backReserve = rules.jointBackReserve ?? 0;
  // Торцом упирается та деталь, что длиннее вдоль оси касания (перегородка стоит на дне, полка — у перегородки).
  const joint = findJointFaces(supportPart, horizontalPart);
  if (joint && sizeAlong(supportPart, joint.axis) > sizeAlong(horizontalPart, joint.axis)) {
    const source = withGeneratedSource(supportPart, sideKey, 'confirmat-dowel');
    const { edgeOps, hostOps } = createConfirmatDowelJointOps(supportPart, horizontalPart, source, { spread: 'ends', backReserve });
    return { horizontalOps: hostOps, supportOps: edgeOps };
  }
  const source = withGeneratedSource(horizontalPart, sideKey, 'confirmat-dowel');
  const frontSingle = horizontalPart.meta?.role === 'bottom' && Boolean(rules.jointBottomFrontSingle);
  const { edgeOps, hostOps } = createConfirmatDowelJointOps(horizontalPart, supportPart, source, { backReserve, frontSingle });
  return { horizontalOps: edgeOps, supportOps: hostOps };
}
