// Шаги сборки: цоколь и карниз.
import { type Part, createPanelPart } from '../part';
import { NAME_SEP, CROWN_FORWARD_OFFSET, TOP_RAIL_SUPPORT_SHORTER_BY } from './constants';
import { roleLabel } from './common';
import { createPlinthSideDowelOps, createPlinthToBottomDowelOps, getPlinthBraceOffsetX, createPlinthBraceMinifixOps, createPlinthBraceToBottomMinifixOps, getTopRailMinifixPositions, createCrownMinifixOps } from './plinth-crown';
import type { CabinetCarcass } from './build';
import type { CabinetBuildContext } from './build-context';
import { buildKitchenPlinthParts } from './kitchen-plinth';

/** Цоколь: передняя и задняя планки, стяжки. */
export function buildPlinthParts(ctx: CabinetBuildContext & CabinetCarcass, parts: Part[]) {
  const { bottom, bottomTierResolved, depth, groupId, innerWidth, leftSide, name, options, position, rightSide, thickness } = ctx;
  if (options.withPlinth && options.plinthKind === 'kitchen') {
    buildKitchenPlinthParts(ctx, parts);
    return;
  }
  if (options.withPlinth) {
    const plinthFront = createPanelPart({
      name: `${name}${NAME_SEP}${roleLabel('plinth-front')}`,
      width: innerWidth,
      height: options.plinthHeight,
      thickness,
      position: { x: position.x, y: position.y + options.plinthHeight / 2, z: position.z + depth / 2 - thickness / 2 },
      meta: { groupId, role: 'plinth-front' },
    });
    const plinthBack = createPanelPart({
      name: `${name}${NAME_SEP}${roleLabel('plinth-back')}`,
      width: innerWidth,
      height: options.plinthHeight,
      thickness,
      position: { x: position.x, y: position.y + options.plinthHeight / 2, z: position.z - depth / 2 + thickness / 2 },
      meta: { groupId, role: 'plinth-back' },
    });
    const leftFrontDowels = createPlinthSideDowelOps(leftSide, plinthFront, 'left', 'front');
    const rightFrontDowels = createPlinthSideDowelOps(rightSide, plinthFront, 'right', 'front');
    const leftBackDowels = createPlinthSideDowelOps(leftSide, plinthBack, 'left', 'back');
    const rightBackDowels = createPlinthSideDowelOps(rightSide, plinthBack, 'right', 'back');
    const frontBottomDowels = createPlinthToBottomDowelOps(bottom, plinthFront, 'front');
    const backBottomDowels = createPlinthToBottomDowelOps(bottom, plinthBack, 'back');

    parts[0] = { ...leftSide, operations: [...leftSide.operations, ...leftFrontDowels.sideOps, ...leftBackDowels.sideOps] };
    parts[1] = { ...rightSide, operations: [...rightSide.operations, ...rightFrontDowels.sideOps, ...rightBackDowels.sideOps] };
    parts[2] = { ...bottom, operations: [...bottom.operations, ...frontBottomDowels.bottomOps, ...backBottomDowels.bottomOps] };
    parts.push(
      { ...plinthFront, operations: [...plinthFront.operations, ...leftFrontDowels.railOps, ...rightFrontDowels.railOps, ...frontBottomDowels.railOps] },
      { ...plinthBack, operations: [...plinthBack.operations, ...leftBackDowels.railOps, ...rightBackDowels.railOps, ...backBottomDowels.railOps] }
    );

    bottomTierResolved.partitions.forEach((partition, idx) => {
      const offsetToCenter = getPlinthBraceOffsetX(bottomTierResolved, partition.id);
      const brace = createPanelPart({
        name: `${name}${NAME_SEP}${roleLabel('plinth-brace', idx + 1)}`,
        width: thickness,
        height: options.plinthHeight,
        thickness: Math.max(thickness, depth - thickness * 2),
        position: {
          x: position.x + partition.x + offsetToCenter,
          y: position.y + options.plinthHeight / 2,
          z: position.z,
        },
        meta: { groupId, role: 'plinth-brace', sourceId: partition.id },
      });
      const braceJoinery = createPlinthBraceMinifixOps(
        parts.find((part) => part.meta?.role === 'plinth-front') ?? plinthFront,
        parts.find((part) => part.meta?.role === 'plinth-back') ?? plinthBack,
        brace
      );
      const currentFront = parts.find((part) => part.meta?.role === 'plinth-front') ?? plinthFront;
      const currentBack = parts.find((part) => part.meta?.role === 'plinth-back') ?? plinthBack;
      parts.splice(parts.indexOf(currentFront), 1, { ...currentFront, operations: [...currentFront.operations, ...braceJoinery.frontOps] });
      parts.splice(parts.indexOf(currentBack), 1, { ...currentBack, operations: [...currentBack.operations, ...braceJoinery.backOps] });
      const braceCamFace = brace.position.x >= plinthFront.position.x ? 'left' : 'right';
      const bottomIndex = parts.findIndex((part) => part.meta?.role === 'bottom');
      const braceBottomJoinery = bottomIndex >= 0 ? createPlinthBraceToBottomMinifixOps(parts[bottomIndex]!, brace, braceCamFace) : null;
      if (braceBottomJoinery) {
        const currentBottom = parts[bottomIndex]!;
        parts[bottomIndex] = { ...currentBottom, operations: [...currentBottom.operations, ...braceBottomJoinery.bottomOps] };
      }
      parts.push({ ...brace, operations: [...brace.operations, ...braceJoinery.braceOps, ...(braceBottomJoinery?.braceOps ?? [])] });
    });
  }
}

/** Карниз: верхние царги при вкладной крыше. */
export function buildTopRailParts(ctx: CabinetBuildContext & CabinetCarcass, parts: Part[]) {
  const { depth, groupId, height, name, options, position, thickness, top, width } = ctx;
  if (options.withTopRails) {
    const frontRail = createPanelPart({
      name: `${name}${NAME_SEP}${roleLabel('top-rail-front')}`,
      width,
      height: options.topRailHeight,
      thickness,
      position: { x: position.x, y: position.y + height - options.topRailHeight / 2, z: position.z + depth / 2 - thickness / 2 + CROWN_FORWARD_OFFSET },
      meta: { groupId, role: 'top-rail-front' },
    });
    const supportWidth = Math.max(thickness, frontRail.width - TOP_RAIL_SUPPORT_SHORTER_BY);
    const support = createPanelPart({
      name: `${name}${NAME_SEP}${roleLabel('top-rail-support')}`,
      width: supportWidth,
      height: thickness,
      thickness: options.topRailHeight,
      position: {
        x: position.x,
        y: top.position.y + top.height / 2 + thickness / 2,
        z: position.z + depth / 2 - options.topRailHeight / 2,
      },
      meta: { groupId, role: 'top-rail-support' },
    });
    const crownJoinery = getTopRailMinifixPositions(frontRail.width, support.width).map((xOnFront, index) =>
      createCrownMinifixOps(frontRail, support, xOnFront, index)
    );
    parts.push(
      {
        ...frontRail,
        operations: [...frontRail.operations, ...crownJoinery.flatMap((joinery) => joinery.frontOps)],
      },
      {
        ...support,
        operations: [...support.operations, ...crownJoinery.flatMap((joinery) => joinery.supportOps)],
      }
    );
  }
}
