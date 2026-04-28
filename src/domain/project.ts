import { createId } from '../shared/ids';
import type { Part, PartFace } from './part';
import type { DrillOperation } from './drill';
import { clampPointToFace } from './geometry';
import { validateDrillOperation } from './validation';

export type Project = {
  id: string;
  name: string;
  units: 'mm';
  parts: Part[];
};

export function createProject(name = 'Furniture MVP'): Project {
  return { id: createId('project'), name, units: 'mm', parts: [] };
}

export function addPart(project: Project, part: Part): Project {
  return { ...project, parts: [...project.parts, part] };
}

export function addParts(project: Project, parts: Part[]): Project {
  return { ...project, parts: [...project.parts, ...parts] };
}

export function updatePart(project: Project, updatedPart: Part): Project {
  return {
    ...project,
    parts: project.parts.map((p) => (p.id === updatedPart.id ? updatedPart : p)),
  };
}

export function replaceParts(project: Project, nextParts: Part[]): Project {
  return { ...project, parts: nextParts };
}

export function removePart(project: Project, partId: string): Project {
  return { ...project, parts: project.parts.filter((part) => part.id !== partId) };
}

export function removePartWithDependentOperations(project: Project, partId: string): Project {
  const removedPart = project.parts.find((part) => part.id === partId);
  if (!removedPart) return project;

  const dependencyTokens = [removedPart.id, removedPart.meta?.sourceId]
    .filter((token): token is string => typeof token === 'string' && token.length > 0);

  return {
    ...project,
    parts: project.parts
      .filter((part) => part.id !== partId)
      .map((part) => ({
        ...part,
        operations: part.operations.filter((op) =>
          !dependencyTokens.some((token) => typeof op.source === 'string' && op.source.includes(token))
        ),
      })),
  };
}

export function getDrillGroupToken(partId: string, op: DrillOperation) {
  return op.source && op.source !== 'manual'
    ? `source:${op.source}`
    : `manual:${partId}:${op.id}`;
}

type WorldPoint = { x: number; y: number; z: number };

function getOperationWorldPoint(part: Part, op: DrillOperation): WorldPoint {
  switch (op.face) {
    case 'front':
      return {
        x: part.position.x - part.width / 2 + op.x,
        y: part.position.y + part.height / 2 - op.y,
        z: part.position.z + part.thickness / 2,
      };
    case 'back':
      return {
        x: part.position.x - part.width / 2 + op.x,
        y: part.position.y + part.height / 2 - op.y,
        z: part.position.z - part.thickness / 2,
      };
    case 'top':
      return {
        x: part.position.x - part.width / 2 + op.x,
        y: part.position.y + part.height / 2,
        z: part.position.z + part.thickness / 2 - op.y,
      };
    case 'bottom':
      return {
        x: part.position.x - part.width / 2 + op.x,
        y: part.position.y - part.height / 2,
        z: part.position.z + part.thickness / 2 - op.y,
      };
    case 'left':
      return {
        x: part.position.x - part.width / 2,
        y: part.position.y + part.height / 2 - op.y,
        z: part.position.z + part.thickness / 2 - op.x,
      };
    case 'right':
      return {
        x: part.position.x + part.width / 2,
        y: part.position.y + part.height / 2 - op.y,
        z: part.position.z + part.thickness / 2 - op.x,
      };
  }
}

function projectWorldPointToFace(part: Part, face: PartFace, point: WorldPoint) {
  switch (face) {
    case 'front':
    case 'back':
      return {
        x: Math.max(0, Math.min(part.width, point.x - (part.position.x - part.width / 2))),
        y: Math.max(0, Math.min(part.height, part.position.y + part.height / 2 - point.y)),
      };
    case 'top':
    case 'bottom':
      return {
        x: Math.max(0, Math.min(part.width, point.x - (part.position.x - part.width / 2))),
        y: Math.max(0, Math.min(part.thickness, part.position.z + part.thickness / 2 - point.z)),
      };
    case 'left':
    case 'right':
      return {
        x: Math.max(0, Math.min(part.thickness, part.position.z + part.thickness / 2 - point.z)),
        y: Math.max(0, Math.min(part.height, part.position.y + part.height / 2 - point.y)),
      };
  }
}

type MoveDrillGroupResult =
  | { ok: true; next: Project }
  | { ok: false; errors: string[] };

export function moveDrillGroup(project: Project, anchorPartId: string, opId: string, nextX: number, nextY: number): MoveDrillGroupResult {
  const anchorPart = project.parts.find((part) => part.id === anchorPartId);
  const anchorOp = anchorPart?.operations.find((op) => op.id === opId);
  if (!anchorPart || !anchorOp) return { ok: false, errors: ['Selected hole was not found'] };

  const clamped = clampPointToFace(anchorPart, anchorOp.face, nextX, nextY);
  const currentWorld = getOperationWorldPoint(anchorPart, anchorOp);
  const nextAnchorWorld = getOperationWorldPoint(anchorPart, { ...anchorOp, x: clamped.x, y: clamped.y });
  const delta = {
    x: nextAnchorWorld.x - currentWorld.x,
    y: nextAnchorWorld.y - currentWorld.y,
    z: nextAnchorWorld.z - currentWorld.z,
  };
  const groupToken = getDrillGroupToken(anchorPartId, anchorOp);
  const errors: string[] = [];

  const next = {
    ...project,
    parts: project.parts.map((part) => ({
      ...part,
      operations: part.operations.map((op) => {
        if (getDrillGroupToken(part.id, op) !== groupToken) return op;
        const world = getOperationWorldPoint(part, op);
        const translated = {
          x: world.x + delta.x,
          y: world.y + delta.y,
          z: world.z + delta.z,
        };
        const local = projectWorldPointToFace(part, op.face, translated);
        const moved = { ...op, x: local.x, y: local.y };
        const opErrors = validateDrillOperation(part, moved);
        if (opErrors.length > 0) errors.push(...opErrors);
        return moved;
      }),
    })),
  };

  return errors.length > 0
    ? { ok: false, errors: Array.from(new Set(errors)) }
    : { ok: true, next };
}

function getSharedMoveDelta(original: Part[], updated: Part[]) {
  if (updated.length === 0) return null;
  const originalById = new Map(original.map((part) => [part.id, part]));
  const firstOriginal = originalById.get(updated[0]!.id);
  if (!firstOriginal) return null;

  const delta = {
    x: updated[0]!.position.x - firstOriginal.position.x,
    y: updated[0]!.position.y - firstOriginal.position.y,
    z: updated[0]!.position.z - firstOriginal.position.z,
  };

  const sameDelta = updated.every((part) => {
    const previous = originalById.get(part.id);
    if (!previous) return false;
    return (
      Math.abs((part.position.x - previous.position.x) - delta.x) < 1e-6 &&
      Math.abs((part.position.y - previous.position.y) - delta.y) < 1e-6 &&
      Math.abs((part.position.z - previous.position.z) - delta.z) < 1e-6
    );
  });

  return sameDelta ? delta : null;
}

export function movePartsWithDependentOperations(project: Project, updatedParts: Part[]): Project {
  const movedIds = new Set(updatedParts.map((part) => part.id));
  const updatedById = new Map(updatedParts.map((part) => [part.id, part]));
  const delta = getSharedMoveDelta(project.parts, updatedParts);
  if (!delta) return updateParts(project, updatedParts);

  const sourceKeys = new Set(
    project.parts
      .filter((part) => movedIds.has(part.id))
      .flatMap((part) => part.operations.map((op) => op.source).filter((source): source is string => typeof source === 'string' && source.length > 0))
  );

  if (sourceKeys.size === 0) return updateParts(project, updatedParts);

  return {
    ...project,
    parts: project.parts.map((part) => {
      const updated = updatedById.get(part.id);
      if (updated) return updated;
      return {
        ...part,
        operations: part.operations.map((op) => {
          if (!op.source || !sourceKeys.has(op.source)) return op;
          const world = getOperationWorldPoint(part, op);
          const translated = {
            x: world.x + delta.x,
            y: world.y + delta.y,
            z: world.z + delta.z,
          };
          const local = projectWorldPointToFace(part, op.face, translated);
          return { ...op, x: local.x, y: local.y };
        }),
      };
    }),
  };
}

export function updateParts(project: Project, updatedParts: Part[]): Project {
  const byId = new Map(updatedParts.map((part) => [part.id, part]));
  return {
    ...project,
    parts: project.parts.map((part) => byId.get(part.id) ?? part),
  };
}

export function addDrillToPart(project: Project, partId: string, op: DrillOperation): Project {
  return {
    ...project,
    parts: project.parts.map((part) =>
      part.id === partId ? { ...part, operations: [...part.operations, op] } : part
    ),
  };
}

export function addDrillsToPart(project: Project, partId: string, ops: DrillOperation[]): Project {
  return {
    ...project,
    parts: project.parts.map((part) =>
      part.id === partId ? { ...part, operations: [...part.operations, ...ops] } : part
    ),
  };
}

export function addDrillGroups(project: Project, groups: { partId: string; ops: DrillOperation[] }[]): Project {
  return groups.reduce((acc, group) => addDrillsToPart(acc, group.partId, group.ops), project);
}
