import { isDrillOperation, type DrillOperation, type MachiningOperation } from './drill';
import type { Part, PartFace } from './part';
import { getFacePointWorld } from './face-coords';

const POSITION_EPSILON = 0.5;
const WORLD_EPSILON = 1;

function getRequiredSpacing(a: DrillOperation, b: DrillOperation) {
  const features = new Set([a.feature, b.feature]);
  if (features.has('connector-pin') && features.has('dowel')) return 32;
  if (features.has('confirmat')) return 10;
  return 0;
}

function centerDistance(a: DrillOperation, b: DrillOperation) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isSameSpot(a: DrillOperation, b: DrillOperation) {
  return a.face === b.face && centerDistance(a, b) < POSITION_EPSILON;
}

function isConflictOnSameFace(a: DrillOperation, b: DrillOperation) {
  const spacing = getRequiredSpacing(a, b);
  return spacing > 0 && a.face === b.face && centerDistance(a, b) < spacing;
}

function isOppositeFace(a: PartFace, b: PartFace) {
  return (a === 'left' && b === 'right')
    || (a === 'right' && b === 'left')
    || (a === 'front' && b === 'back')
    || (a === 'back' && b === 'front')
    || (a === 'top' && b === 'bottom')
    || (a === 'bottom' && b === 'top');
}

function getWorldAnchorPosition(part: Part, face: PartFace, op: DrillOperation) {
  return getFacePointWorld(part, face, op);
}

function worldDistance(part: Part, a: DrillOperation, b: DrillOperation) {
  const pa = getWorldAnchorPosition(part, a.face, a);
  const pb = getWorldAnchorPosition(part, b.face, b);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
}

function getFaceNormalSize(part: Part, face: PartFace) {
  if (face === 'left' || face === 'right') return part.width;
  if (face === 'top' || face === 'bottom') return part.height;
  return part.thickness;
}

/**
 * Holes drilled from opposite faces collide when their circles overlap in the face plane and together they are at least
 * as deep as the part. (The old world-distance check could never fire: the faces are a whole thickness apart.)
 */
function holesMeetThroughPart(part: Part, a: DrillOperation, b: DrillOperation) {
  const pa = getWorldAnchorPosition(part, a.face, a);
  const pb = getWorldAnchorPosition(part, b.face, b);
  const planeDistance = a.face === 'left' || a.face === 'right'
    ? Math.hypot(pa.y - pb.y, pa.z - pb.z)
    : a.face === 'top' || a.face === 'bottom'
      ? Math.hypot(pa.x - pb.x, pa.z - pb.z)
      : Math.hypot(pa.x - pb.x, pa.y - pb.y);
  if (planeDistance >= (a.diameter + b.diameter) / 2) return false;
  const size = getFaceNormalSize(part, a.face);
  const depthA = a.through ? size : a.depth;
  const depthB = b.through ? size : b.depth;
  return depthA + depthB >= size - WORLD_EPSILON;
}

export function getDrillConflictIds(part: Part) {
  const conflicts = new Set<string>();
  const ops = (part.operations ?? []).filter(isDrillOperation);

  for (let i = 0; i < ops.length; i += 1) {
    const a = ops[i]!;
    for (let j = i + 1; j < ops.length; j += 1) {
      const b = ops[j]!;
      const sameSpotConflict = isSameSpot(a, b);
      const sameFaceSpacingConflict = isConflictOnSameFace(a, b);
      // Shelf-pin rows on both sides of a partition are normal practice, so they are not flagged.
      const oppositeFaceConflict = a.feature !== 'shelf-pin' && b.feature !== 'shelf-pin'
        && isOppositeFace(a.face, b.face) && holesMeetThroughPart(part, a, b);
      if (!sameSpotConflict && !sameFaceSpacingConflict && !oppositeFaceConflict) continue;
      conflicts.add(a.id);
      conflicts.add(b.id);
    }
  }

  return Array.from(conflicts);
}

function keepInsteadOfConfirmat(a: DrillOperation, b: DrillOperation) {
  if (a.feature === 'confirmat' && b.feature !== 'confirmat') return b;
  if (b.feature === 'confirmat' && a.feature !== 'confirmat') return a;
  return b;
}

export function normalizePartDrillOperations(part: Part): Part {
  const accepted: DrillOperation[] = [];
  // Пазы в разрешение конфликтов отверстий не участвуют и остаются как есть.
  const other: MachiningOperation[] = (part.operations ?? []).filter((op) => !isDrillOperation(op));

  (part.operations ?? []).filter(isDrillOperation).forEach((operation) => {
    let current: DrillOperation | null = operation;

    for (let idx = 0; idx < accepted.length && current; idx += 1) {
      const existing = accepted[idx]!;

      if (isSameSpot(existing, current)) {
        current = keepInsteadOfConfirmat(existing, current) === current ? current : null;
        if (current && current !== existing) accepted[idx] = current;
        current = null;
        break;
      }

      if (isConflictOnSameFace(existing, current)) {
        current = keepInsteadOfConfirmat(existing, current) === current ? current : null;
        if (!current && existing.feature === 'confirmat' && operation.feature !== 'confirmat') accepted.splice(idx, 1);
      }

    }

    if (current) accepted.push(current);
  });

  return { ...part, operations: [...accepted, ...other] };
}
