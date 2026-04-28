import type { Part } from './part';
import type { DrillOperation } from './drill';
import { faceSize } from './geometry';

export function validateDrillOperation(part: Part, op: DrillOperation): string[] {
  const errors: string[] = [];
  const size = faceSize(part, op.face);

  if (op.x < 0 || op.x > size.width) errors.push('X is out of face bounds');
  if (op.y < 0 || op.y > size.height) errors.push('Y is out of face bounds');
  if (op.diameter <= 0) errors.push('Diameter must be positive');
  if (op.depth <= 0 && !op.through) errors.push('Depth must be positive');

  const maxDepth =
    op.face === 'front' || op.face === 'back'
      ? part.thickness
      : op.face === 'top' || op.face === 'bottom'
      ? part.height
      : part.width;

  if (!op.through && op.depth > maxDepth) errors.push('Depth exceeds part thickness in drilling direction');

  return errors;
}
