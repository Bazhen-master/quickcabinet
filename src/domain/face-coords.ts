import type { Part, PartFace } from './part';

export type FacePoint = { x: number; y: number };
export type WorldPoint = { x: number; y: number; z: number };

/**
 * The single definition of the face coordinate convention used by drilling, conflict checks and dependent moves:
 * front/back — x from the left edge, y down from the top; top/bottom — x from the left edge, y back from the front edge;
 * left/right — x back from the front edge, y down from the top.
 */
export function getFacePointWorld(part: Part, face: PartFace, point: FacePoint): WorldPoint {
  const left = part.position.x - part.width / 2;
  const top = part.position.y + part.height / 2;
  const front = part.position.z + part.thickness / 2;
  switch (face) {
    case 'front': return { x: left + point.x, y: top - point.y, z: front };
    case 'back': return { x: left + point.x, y: top - point.y, z: part.position.z - part.thickness / 2 };
    case 'top': return { x: left + point.x, y: top, z: front - point.y };
    case 'bottom': return { x: left + point.x, y: part.position.y - part.height / 2, z: front - point.y };
    case 'left': return { x: left, y: top - point.y, z: front - point.x };
    case 'right': return { x: part.position.x + part.width / 2, y: top - point.y, z: front - point.x };
  }
}

/** Inverse of getFacePointWorld (the face-normal coordinate is ignored), clamped to the face. */
export function projectWorldPointToFace(part: Part, face: PartFace, point: WorldPoint): FacePoint {
  const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
  const alongWidth = point.x - (part.position.x - part.width / 2);
  const downHeight = part.position.y + part.height / 2 - point.y;
  const backDepth = part.position.z + part.thickness / 2 - point.z;
  switch (face) {
    case 'front':
    case 'back':
      return { x: clamp(alongWidth, part.width), y: clamp(downHeight, part.height) };
    case 'top':
    case 'bottom':
      return { x: clamp(alongWidth, part.width), y: clamp(backDepth, part.thickness) };
    case 'left':
    case 'right':
      return { x: clamp(backDepth, part.thickness), y: clamp(downHeight, part.height) };
  }
}
