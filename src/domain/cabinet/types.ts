// Типы строителя корпуса: вход, состояние модуля, секции, зоны, опции.
import type { CabinetLayout, CabinetSection, CabinetDrawerStackSpec } from '../cabinet-layout';

export type CabinetTopMode = 'overlay' | 'inset';
export type CabinetFrontMode = 'overlay' | 'inset';
export type CabinetFrontOpeningMode = 'handleless' | 'handles';
/** Задняя стенка на весь корпус: плита толщины корпуса на крепеже, ХДФ в пазу или ХДФ накладная (на гвоздях сзади). */
export type CabinetBackPanelKind = 'panel' | 'hdf' | 'hdf-overlay';
/** Цоколь: рамка из передней и задней планок (шкафы) или кухонный на ножках — одна планка с отступом, фасады до пола. */
export type CabinetPlinthKind = 'frame' | 'kitchen';

export type CabinetBuildInput = {
  name?: string;
  width: number;
  height: number;
  depth: number;
  thickness: number;
  shelfCount: number;
  partitionCount?: number;
  withBackPanel?: boolean;
  backPanelKind?: CabinetBackPanelKind;
  /** Регулируемые навесы верхнего модуля: вырезы в верхних углах ХДФ. */
  withHangers?: boolean;
  /** New cabinet only (no layout given): start with a door over every section. */
  withFronts?: boolean;
  frontMode?: CabinetFrontMode;
  frontOpeningMode?: CabinetFrontOpeningMode;
  topMode?: CabinetTopMode;
  withPlinth?: boolean;
  plinthHeight?: number;
  plinthKind?: CabinetPlinthKind;
  /** Задние царги: высота низа каждой от пола. */
  backRailElevations?: number[];
  withTopRails?: boolean;
  topRailHeight?: number;
  withAprons?: boolean;
  /** Top over the overlay fronts (dressers, nightstands): it reaches forward by a front's thickness. */
  topOverFronts?: boolean;
  withTierDivider?: boolean;
  tierCount?: number;
  tierHeight?: number;
  backPanelSections?: string[];
  position?: { x: number; y: number; z: number };
  groupId?: string;
  layout?: CabinetLayout;
};

export type CabinetModuleState = {
  groupId: string;
  name: string;
  width: number;
  height: number;
  depth: number;
  thickness: number;
  shelfCount: number;
  partitionCount: number;
  withBackPanel: boolean;
  backPanelKind: CabinetBackPanelKind;
  withHangers: boolean;
  frontMode: CabinetFrontMode;
  frontOpeningMode: CabinetFrontOpeningMode;
  topMode: CabinetTopMode;
  withPlinth: boolean;
  plinthHeight: number;
  plinthKind: CabinetPlinthKind;
  backRailElevations: number[];
  withTopRails: boolean;
  topRailHeight: number;
  withAprons: boolean;
  withTierDivider: boolean;
  tierCount: number;
  tierHeight: number;
  backPanelSections: string[];
  topOverFronts: boolean;
  position: { x: number; y: number; z: number };
  layout: CabinetLayout;
};

export type CabinetTierSection = CabinetSection & {
  tierId: string;
  tierIndex: number;
  startY: number;
  endY: number;
  clearHeight: number;
};

export type CabinetLocalZone = {
  id: string;
  sectionId: string;
  tierId: string;
  tierIndex: number;
  zoneIndex: number;
  startY: number;
  endY: number;
  clearHeight: number;
  centerY: number;
};

export type CabinetSectionDrawerStack = CabinetDrawerStackSpec & {
  tierId?: string;
};

export type SectionVerticalFrame = {
  startY: number;
  endY: number;
  clearHeight: number;
  centerY: number;
};

export type CabinetOptions = {
  withPlinth: boolean;
  plinthHeight: number;
  plinthKind: CabinetPlinthKind;
  backRailElevations: number[];
  withTopRails: boolean;
  topRailHeight: number;
  withAprons: boolean;
  withTierDivider: boolean;
  tierCount: number;
  tierHeight: number;
  backPanelSections: string[];
  backPanelKind: CabinetBackPanelKind;
  withHangers: boolean;
  frontMode: CabinetFrontMode;
  frontOpeningMode: CabinetFrontOpeningMode;
  topOverFronts?: boolean;
};
