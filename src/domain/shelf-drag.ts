// Перетаскивание полки мышью: ход между соседними горизонтальными деталями и «магнит» к полкам соседних секций.
import type { Part, PartRole } from './part';

const HORIZONTAL_ROLES = new Set<PartRole | undefined>(['shelf', 'tier-divider', 'top', 'bottom']);

export type ShelfSnapTarget = { partId: string; y: number };

export type ShelfDragRange = { min: number; max: number };

const overlapsX = (a: Part, b: Part) => Math.min(a.position.x + a.width / 2, b.position.x + b.width / 2) - Math.max(a.position.x - a.width / 2, b.position.x - b.width / 2) > 1;

/** Centre Y the shelf may take: it stays between the horizontal panels right below and above it in its section. */
export function getShelfDragRange(parts: Part[], shelf: Part): ShelfDragRange {
  const neighbours = parts.filter((part) => part.id !== shelf.id && part.meta?.groupId === shelf.meta?.groupId && HORIZONTAL_ROLES.has(part.meta?.role) && overlapsX(part, shelf));
  const half = shelf.height / 2;
  const below = neighbours.filter((part) => part.position.y < shelf.position.y).map((part) => part.position.y + part.height / 2);
  const above = neighbours.filter((part) => part.position.y > shelf.position.y).map((part) => part.position.y - part.height / 2);
  return {
    min: below.length > 0 ? Math.max(...below) + half : -Infinity,
    max: above.length > 0 ? Math.min(...above) - half : Infinity,
  };
}

/** Heights to line up with: shelves and section dividers of the same cabinet standing beside the shelf (other sections). */
export function getShelfSnapTargets(parts: Part[], shelf: Part): ShelfSnapTarget[] {
  return parts
    .filter((part) => part.id !== shelf.id
      && part.meta?.groupId === shelf.meta?.groupId
      && (part.meta?.role === 'shelf' || (part.meta?.role === 'tier-divider' && !part.meta.sourceId?.startsWith('tier-divider:')))
      && !overlapsX(part, shelf))
    .map((part) => ({ partId: part.id, y: part.position.y }));
}

/** Clamps the pointer height into the range and pulls it to the nearest target within `threshold` mm; whole millimetres otherwise. */
export function snapShelfY(y: number, range: ShelfDragRange, targets: ShelfSnapTarget[], threshold: number): { y: number; target: ShelfSnapTarget | null } {
  const clamped = Math.min(range.max, Math.max(range.min, y));
  const nearest = targets
    .filter((target) => target.y >= range.min && target.y <= range.max && Math.abs(target.y - clamped) <= threshold)
    .sort((a, b) => Math.abs(a.y - clamped) - Math.abs(b.y - clamped))[0];
  if (nearest) return { y: nearest.y, target: nearest };
  return { y: Math.min(range.max, Math.max(range.min, Math.round(clamped))), target: null };
}
