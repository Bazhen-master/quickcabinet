// Кухонный цоколь на ножках и задние царги — по пеналу эталона Базиса 26163 (2_02, 836x2230x544).
//
// Цоколь — одна планка между боковинами, отступает от переда на 8. К боковине — один конфирмат
// на 50 от пола, к дну — конфирматы со шкантами по сетке от правого конца (804: 69/293/517/741).
// Ножки: сквозные отверстия в дне на 80 от переда и 50 от зада, в 20 от боковин; на внутренних
// пластях боковин напротив — пары меток глубиной 1 через 32 на высоте 11.
// Фасады у пола не останавливаются на дне, а опускаются до 30 от пола (см. getFrontRect).
// Задние царги 250 — вровень с задней кромкой, на высотах из опции корпуса, к боковинам на
// конфирматах со шкантами (снизу 69/101, сверху 197/165).
import { type Part, type PartFace, createPanelPart } from '../part';
import { createDrillOperation, getFaceAxis, type DrillOperation } from '../drill';
import { projectWorldPointToFace } from '../face-coords';
import { createConfirmatDowelJointOps, createConfirmatDowelPointOps } from '../auto-joinery/confirmat-dowel';
import { GENERATED_BACK_RAIL_SOURCE_PREFIX, GENERATED_PLINTH_SOURCE_PREFIX, NAME_SEP } from './constants';
import { roleLabel } from './common';
import type { CabinetCarcass } from './build';
import type { CabinetBuildContext } from './build-context';

const KITCHEN_PLINTH_SETBACK = 8;
const KITCHEN_PLINTH_SIDE_CONFIRMAT_HEIGHT = 50;
export const KITCHEN_FRONT_FLOOR_CLEARANCE = 30;
const LEG_FROM_FRONT = 80;
const LEG_FROM_BACK = 50;
const LEG_HOLE_FROM_SIDE = 20;
// Диаметр из выгрузки не виден (T6 сверлит всё сквозное) — берём 8.
const LEG_HOLE_DIAMETER = 8;
const LEG_MARK_HEIGHT = 11;
const LEG_MARK_SPACING = 32;
const LEG_MARK_DEPTH = 1;
const LEG_MARK_DIAMETER = 3;
export const BACK_RAIL_HEIGHT = 250;

function appendOps(parts: Part[], part: Part, ops: DrillOperation[]) {
  const index = parts.findIndex((item) => item.id === part.id);
  if (index >= 0) parts[index] = { ...parts[index]!, operations: [...parts[index]!.operations, ...ops] };
}

/** Цоколь на ножках: планка, крепёж к боковинам и дну, отверстия и метки под ножки. */
export function buildKitchenPlinthParts(ctx: CabinetBuildContext & CabinetCarcass, parts: Part[]) {
  const { bottom, depth, groupId, innerWidth, leftSide, name, options, position, rightSide, thickness } = ctx;
  const front = position.z + depth / 2;
  const back = position.z - depth / 2;
  const plinth = createPanelPart({
    name: `${name}${NAME_SEP}${roleLabel('plinth-front')}`,
    width: innerWidth,
    height: options.plinthHeight,
    thickness,
    position: { x: position.x, y: position.y + options.plinthHeight / 2, z: front - KITCHEN_PLINTH_SETBACK - thickness / 2 },
    meta: { groupId, role: 'plinth-front' },
  });
  const source = (node: string) => `${GENERATED_PLINTH_SOURCE_PREFIX}${plinth.id}:${node}`;
  const plinthOps: DrillOperation[] = [];

  for (const [side, node] of [[leftSide, 'left'], [rightSide, 'right']] as const) {
    const joint = createConfirmatDowelPointOps(plinth, side, source(node), () => [{ confirmat: KITCHEN_PLINTH_SIDE_CONFIRMAT_HEIGHT, dowel: null }], { axis: 'y', fromMax: false });
    plinthOps.push(...joint.edgeOps);
    appendOps(parts, side, joint.hostOps);
  }
  const bottomJoint = createConfirmatDowelJointOps(plinth, bottom, source('bottom'), {}, { axis: 'x', fromMax: true });
  plinthOps.push(...bottomJoint.edgeOps);

  const legSource = source('legs');
  const legDepths = [front - LEG_FROM_FRONT, back + LEG_FROM_BACK];
  const bottomLeft = bottom.position.x - bottom.width / 2;
  const bottomRight = bottom.position.x + bottom.width / 2;
  const legHoles = legDepths.flatMap((z) => [bottomLeft + LEG_HOLE_FROM_SIDE, bottomRight - LEG_HOLE_FROM_SIDE].map((x) => {
    const point = projectWorldPointToFace(bottom, 'bottom', { x, y: bottom.position.y - bottom.height / 2, z });
    return createDrillOperation({
      source: legSource, face: 'bottom', axis: getFaceAxis('bottom'), x: point.x, y: point.y,
      diameter: LEG_HOLE_DIAMETER, depth: bottom.height, through: true, templateName: 'Leg',
    });
  }));
  appendOps(parts, bottom, [...bottomJoint.hostOps, ...legHoles]);

  for (const [side, face] of [[leftSide, 'right'], [rightSide, 'left']] as const satisfies ReadonlyArray<readonly [Part, PartFace]>) {
    const faceX = side.position.x + (face === 'right' ? side.width / 2 : -side.width / 2);
    const marks = legDepths.flatMap((z) => [z + LEG_MARK_SPACING / 2, z - LEG_MARK_SPACING / 2].map((markZ) => {
      const point = projectWorldPointToFace(side, face, { x: faceX, y: position.y + LEG_MARK_HEIGHT, z: markZ });
      return createDrillOperation({
        source: legSource, face, axis: getFaceAxis(face), x: point.x, y: point.y,
        diameter: LEG_MARK_DIAMETER, depth: LEG_MARK_DEPTH, through: false, templateName: 'Leg mark',
      });
    }));
    appendOps(parts, side, marks);
  }

  parts.push({ ...plinth, operations: plinthOps });
}

/** Задние царги на заданных высотах от пола (низ царги), вровень с задней кромкой корпуса. */
export function buildBackRailParts(ctx: CabinetBuildContext & CabinetCarcass, parts: Part[]) {
  const { backInset, depth, groupId, innerWidth, leftSide, name, options, position, rightSide, thickness } = ctx;
  options.backRailElevations.forEach((elevation, index) => {
    const rail = createPanelPart({
      name: `${name}${NAME_SEP}${roleLabel('back-rail', index + 1)}`,
      width: innerWidth,
      height: BACK_RAIL_HEIGHT,
      thickness,
      position: { x: position.x, y: position.y + elevation + BACK_RAIL_HEIGHT / 2, z: position.z - depth / 2 + backInset + thickness / 2 },
      meta: { groupId, role: 'back-rail', sourceId: `back-rail:${index}` },
    });
    const railOps: DrillOperation[] = [];
    for (const [side, node] of [[leftSide, 'left'], [rightSide, 'right']] as const) {
      const joint = createConfirmatDowelJointOps(rail, side, `${GENERATED_BACK_RAIL_SOURCE_PREFIX}${rail.id}:${node}`, {}, { axis: 'y', fromMax: false });
      railOps.push(...joint.edgeOps);
      appendOps(parts, side, joint.hostOps);
    }
    parts.push({ ...rail, operations: railOps });
  });
}
