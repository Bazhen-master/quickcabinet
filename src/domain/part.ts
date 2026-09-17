import { createId } from '../shared/ids';
import type { MachiningOperation } from './drill';
import type { CabinetLayout } from './cabinet-layout';
import type { SideJoinery } from './joinery';

export type Vec3 = { x: number; y: number; z: number };
export const MAX_PART_SIZE_MM = 2800;
export type PartFace = 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back';
export type PartRole =
  | 'panel'
  | 'left-side'
  | 'right-side'
  | 'top'
  | 'bottom'
  | 'shelf'
  | 'drawer-front'
  | 'drawer-side-left'
  | 'drawer-side-right'
  | 'drawer-back'
  | 'drawer-inner-front'
  | 'drawer-bottom'
  | 'drawer-column'
  | 'drawer-false-panel'
  | 'tier-divider'
  | 'partition'
  | 'apron'
  | 'back-rail'
  | 'back-panel'
  | 'front-left'
  | 'front-right'
  | 'front-flap'
  | 'plinth'
  | 'plinth-front'
  | 'plinth-back'
  | 'plinth-brace'
  | 'top-rail-front'
  | 'top-rail-support';

/**
 * Прямоугольный вырез в углу пластины, лежащей в плоскости XY (толщина по Z, как у задней стенки):
 * width — по X, height — по Y.
 */
export type PartCornerNotch = {
  corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  width: number;
  height: number;
};

export type Part = {
  id: string;
  name: string;
  kind: 'panel';
  width: number;
  height: number;
  thickness: number;
  position: Vec3;
  rotation: Vec3;
  operations: MachiningOperation[];
  cornerNotches?: PartCornerNotch[];
  meta?: {
    groupId?: string;
    role?: PartRole;
    hidden?: boolean;
    sourceId?: string;
    cabinetLayout?: CabinetLayout;
    cabinetOptions?: {
      withPlinth: boolean;
      plinthHeight: number;
      plinthKind?: 'frame' | 'kitchen';
      backRailElevations?: number[];
      withTopRails: boolean;
      topRailHeight: number;
      withAprons?: boolean;
      topOverFronts?: boolean;
      withTierDivider?: boolean;
      tierCount?: number;
      tierHeight?: number;
      backPanelSections?: string[];
      backPanelKind?: 'panel' | 'hdf' | 'hdf-overlay';
      withHangers?: boolean;
      frontMode?: 'overlay' | 'inset';
      frontOpeningMode?: 'handleless' | 'handles';
    };
    displayColor?: string;
    hingeEdge?: 'left' | 'right' | 'top' | 'bottom';
    /** Set by the builder from where the front sits: over an outer panel, half over a shared one, or inside the opening. */
    hingeType?: 'overlay' | 'half-overlay' | 'inset';
    /** A top reaching past the carcass front (top over the fronts), mm: its joints are laid out without that overhang. */
    frontOverhang?: number;
    joinery?: SideJoinery;
    parentSectionId?: string;
    leftSupportPartId?: string;
    rightSupportPartId?: string;
    shelfDrillReferenceDepth?: number;
  };
};

export function roundDownToMillimeter(value: number, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  return Math.floor(value + 1e-9);
}

export function clampPartSize(value: number, fallback: number) {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(value, MAX_PART_SIZE_MM);
}

export function createPanelPart(input?: Partial<Part>): Part {
  return {
    id: input?.id ?? createId('part'),
    name: input?.name ?? 'Panel',
    kind: 'panel',
    width: roundDownToMillimeter(clampPartSize(input?.width ?? 600, 600), 600),
    height: roundDownToMillimeter(clampPartSize(input?.height ?? 300, 300), 300),
    thickness: roundDownToMillimeter(clampPartSize(input?.thickness ?? 16, 16), 16),
    position: input?.position ?? { x: 0, y: 0, z: 0 },
    rotation: input?.rotation ?? { x: 0, y: 0, z: 0 },
    operations: input?.operations ?? [],
    ...(input?.cornerNotches?.length ? { cornerNotches: input.cornerNotches } : {}),
    meta: input?.meta,
  };
}

/**
 * Контур пластины в плоскости XY с учётом угловых вырезов: от левого нижнего угла детали,
 * X вправо, Y вверх, обход против часовой стрелки. Без вырезов — прямоугольник width x height.
 */
export function getPartOutlineXY(part: Pick<Part, 'width' | 'height' | 'cornerNotches'>): Array<{ x: number; y: number }> {
  const { width: w, height: h } = part;
  const notch = (corner: PartCornerNotch['corner']) => part.cornerNotches?.find((item) => item.corner === corner);
  const bl = notch('bottom-left');
  const br = notch('bottom-right');
  const tr = notch('top-right');
  const tl = notch('top-left');
  const points: Array<{ x: number; y: number }> = [];
  const push = (x: number, y: number) => {
    const last = points[points.length - 1];
    if (!last || last.x !== x || last.y !== y) points.push({ x, y });
  };
  if (bl) { push(bl.width, 0); } else push(0, 0);
  if (br) { push(w - br.width, 0); push(w - br.width, br.height); push(w, br.height); } else push(w, 0);
  if (tr) { push(w, h - tr.height); push(w - tr.width, h - tr.height); push(w - tr.width, h); } else push(w, h);
  if (tl) { push(tl.width, h); push(tl.width, h - tl.height); push(0, h - tl.height); } else push(0, h);
  if (bl) { push(0, bl.height); push(bl.width, bl.height); }
  return points;
}
