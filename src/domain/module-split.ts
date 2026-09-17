import { MAX_PART_SIZE_MM } from './part';

export type SplitAxis = 'width' | 'height';

/** How an oversized cabinet should be assembled from several modules (sizes in mm, left→right or bottom→top). */
export type ModuleSplit = { axis: SplitAxis; requested: number; sizes: number[] };

const PREFERRED_MAIN_HEIGHT_MM = 2400;
const MIN_MEZZANINE_HEIGHT_MM = 300;

export function planModuleSplit(axis: SplitAxis, requested: number): ModuleSplit | null {
  if (!Number.isFinite(requested) || requested <= MAX_PART_SIZE_MM) return null;
  const total = Math.floor(requested);

  // Tall cabinets are usually a main module plus a mezzanine on top, not two equal halves.
  if (axis === 'height' && total <= MAX_PART_SIZE_MM * 2) {
    const minMain = total - MAX_PART_SIZE_MM;
    const maxMain = Math.min(MAX_PART_SIZE_MM, total - MIN_MEZZANINE_HEIGHT_MM);
    const main = Math.min(Math.max(PREFERRED_MAIN_HEIGHT_MM, minMain), maxMain);
    return { axis, requested: total, sizes: [main, total - main] };
  }

  const count = Math.ceil(total / MAX_PART_SIZE_MM);
  const size = Math.floor(total / count);
  const sizes = Array.from({ length: count }, (_, index) => (index === count - 1 ? total - size * (count - 1) : size));
  return { axis, requested: total, sizes };
}
