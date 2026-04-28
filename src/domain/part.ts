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
  | 'tier-divider'
  | 'partition'
  | 'apron'
  | 'back-panel'
  | 'front-left'
  | 'front-right'
  | 'plinth'
  | 'plinth-front'
  | 'plinth-back'
  | 'plinth-brace'
  | 'top-rail-front'
  | 'top-rail-support';

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
  meta?: {
    groupId?: string;
    role?: PartRole;
    hidden?: boolean;
    sourceId?: string;
    cabinetLayout?: CabinetLayout;
    cabinetOptions?: {
      withPlinth: boolean;
      plinthHeight: number;
      withTopRails: boolean;
      topRailHeight: number;
      withAprons?: boolean;
      withTierDivider?: boolean;
      tierCount?: number;
      tierHeight?: number;
      backPanelSections?: string[];
      frontTierIds?: string[];
      frontMode?: 'overlay' | 'inset';
      frontOpeningMode?: 'handleless' | 'handles';
    };
    hingeEdge?: 'left' | 'right' | 'top' | 'bottom';
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
    meta: input?.meta,
  };
}
