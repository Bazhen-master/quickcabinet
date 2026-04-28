import type { DrillOperation } from './drill';
import type { Part, PartFace } from './part';

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
  switch (face) {
    case 'front':
      return { x: part.position.x - part.width / 2 + op.x, y: part.position.y + part.height / 2 - op.y, z: part.position.z + part.thickness / 2 };
    case 'back':
      return { x: part.position.x - part.width / 2 + op.x, y: part.position.y + part.height / 2 - op.y, z: part.position.z - part.thickness / 2 };
    case 'top':
      return { x: part.position.x - part.width / 2 + op.x, y: part.position.y + part.height / 2, z: part.position.z + part.thickness / 2 - op.y };
    case 'bottom':
      return { x: part.position.x - part.width / 2 + op.x, y: part.position.y - part.height / 2, z: part.position.z + part.thickness / 2 - op.y };
    case 'left':
      return { x: part.position.x - part.width / 2, y: part.position.y + part.height / 2 - op.y, z: part.position.z + part.thickness / 2 - op.x };
    case 'right':
      return { x: part.position.x + part.width / 2, y: part.position.y + part.height / 2 - op.y, z: part.position.z + part.thickness / 2 - op.x };
  }
}

function worldDistance(part: Part, a: DrillOperation, b: DrillOperation) {
  const pa = getWorldAnchorPosition(part, a.face, a);
  const pb = getWorldAnchorPosition(part, b.face, b);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
}

export function getDrillConflictIds(part: Part) {
  const conflicts = new Set<string>();
  const ops = part.operations ?? [];

  for (let i = 0; i < ops.length; i += 1) {
    const a = ops[i]!;
    for (let j = i + 1; j < ops.length; j += 1) {
      const b = ops[j]!;
      const sameSpotConflict = isSameSpot(a, b);
      const sameFaceSpacingConflict = isConflictOnSameFace(a, b);
      const oppositeFaceConflict = isOppositeFace(a.face, b.face) && worldDistance(part, a, b) < WORLD_EPSILON;
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

  (part.operations ?? []).forEach((operation) => {
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

  return { ...part, operations: accepted };
}
