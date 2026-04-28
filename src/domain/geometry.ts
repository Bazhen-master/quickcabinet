import type { Part, PartFace } from './part';

export function faceSize(part: Part, face: PartFace): { width: number; height: number } {
  switch (face) {
    case 'front':
    case 'back':
      return { width: part.width, height: part.height };
    case 'top':
    case 'bottom':
      return { width: part.width, height: part.thickness };
    case 'left':
    case 'right':
      return { width: part.thickness, height: part.height };
  }
}

export function clampPointToFace(part: Part, face: PartFace, x: number, y: number) {
  const size = faceSize(part, face);
  return {
    face,
    x: Math.max(0, Math.min(size.width, x)),
    y: Math.max(0, Math.min(size.height, y)),
  };
}

export function getProjectCenter(parts: Part[]) {
  if (parts.length === 0) return { x: 0, y: 0, z: 0 };
  const acc = parts.reduce(
    (sum, part) => ({ x: sum.x + part.position.x, y: sum.y + part.position.y, z: sum.z + part.position.z }),
    { x: 0, y: 0, z: 0 }
  );
  return { x: acc.x / parts.length, y: acc.y / parts.length, z: acc.z / parts.length };
}

export type PartBounds = {
  minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number;
  width: number; height: number; depth: number;
};

export function getBounds(parts: Part[]): PartBounds {
  if (parts.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, width: 0, height: 0, depth: 0 };
  }
  const xs = parts.flatMap((part) => [part.position.x - part.width / 2, part.position.x + part.width / 2]);
  const ys = parts.flatMap((part) => [part.position.y - part.height / 2, part.position.y + part.height / 2]);
  const zs = parts.flatMap((part) => [part.position.z - part.thickness / 2, part.position.z + part.thickness / 2]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  return { minX, maxX, minY, maxY, minZ, maxZ, width: maxX - minX, height: maxY - minY, depth: maxZ - minZ };
}

export function formatBoundsSize(bounds: PartBounds) {
  return `${Math.round(bounds.width)} × ${Math.round(bounds.height)} × ${Math.round(bounds.depth)} mm`;
}

export function snapBoundsToNeighbors(bounds: PartBounds, neighbors: PartBounds[], threshold = 16) {
  let dx = 0; let dz = 0; let bestX = threshold + 1; let bestZ = threshold + 1;
  for (const neighbor of neighbors) {
    const xOptions = [neighbor.minX - bounds.maxX, neighbor.maxX - bounds.minX, neighbor.minX - bounds.minX, neighbor.maxX - bounds.maxX];
    const zOptions = [neighbor.minZ - bounds.maxZ, neighbor.maxZ - bounds.minZ, neighbor.minZ - bounds.minZ, neighbor.maxZ - bounds.maxZ];
    for (const option of xOptions) if (Math.abs(option) < Math.abs(bestX) && Math.abs(option) <= threshold) { bestX = option; dx = option; }
    for (const option of zOptions) if (Math.abs(option) < Math.abs(bestZ) && Math.abs(option) <= threshold) { bestZ = option; dz = option; }
  }
  return { dx, dz };
}

export function boundsIntersect(a: PartBounds, b: PartBounds, epsilon = 0.001) {
  const overlapX = a.minX < b.maxX - epsilon && a.maxX > b.minX + epsilon;
  const overlapY = a.minY < b.maxY - epsilon && a.maxY > b.minY + epsilon;
  const overlapZ = a.minZ < b.maxZ - epsilon && a.maxZ > b.minZ + epsilon;
  return overlapX && overlapY && overlapZ;
}

export function collidesWithAny(bounds: PartBounds, neighbors: PartBounds[]) {
  return neighbors.some((neighbor) => boundsIntersect(bounds, neighbor));
}

export type RelativePlacementRule = 'left-of' | 'right-of' | 'in-front-of' | 'behind' | 'on-top-of' | 'under' | 'center-x' | 'center-y' | 'center-z';
export type SnapCandidate = { id: string; label: string; nextPosition: { x: number; y: number; z: number } };

export function computeRelativePosition(moving: PartBounds, target: PartBounds, current: { x: number; y: number; z: number }, rule: RelativePlacementRule, offset = 0) {
  switch (rule) {
    case 'left-of': return { x: target.minX - moving.width / 2 - offset, y: current.y, z: current.z };
    case 'right-of': return { x: target.maxX + moving.width / 2 + offset, y: current.y, z: current.z };
    case 'in-front-of': return { x: current.x, y: current.y, z: target.maxZ + moving.depth / 2 + offset };
    case 'behind': return { x: current.x, y: current.y, z: target.minZ - moving.depth / 2 - offset };
    case 'on-top-of': return { x: current.x, y: target.maxY + moving.height / 2 + offset, z: current.z };
    case 'under': return { x: current.x, y: target.minY - moving.height / 2 - offset, z: current.z };
    case 'center-x': return { x: (target.minX + target.maxX) / 2, y: current.y, z: current.z };
    case 'center-y': return { x: current.x, y: (target.minY + target.maxY) / 2, z: current.z };
    case 'center-z': return { x: current.x, y: current.y, z: (target.minZ + target.maxZ) / 2 };
  }
}

export function buildSnapCandidates(moving: PartBounds, target: PartBounds, current: { x: number; y: number; z: number }) : SnapCandidate[] {
  const defs: [RelativePlacementRule, string][] = [
    ['left-of', 'Attach to left side'],
    ['right-of', 'Attach to right side'],
    ['in-front-of', 'Attach to front plane'],
    ['behind', 'Attach to back plane'],
    ['on-top-of', 'Place on top'],
    ['under', 'Place under'],
    ['center-x', 'Align centers by X'],
    ['center-z', 'Align centers by Z'],
  ];
  return defs.map(([rule, label]) => ({ id: rule, label, nextPosition: computeRelativePosition(moving, target, current, rule, 0) }));
}
