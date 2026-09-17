// Размерные константы корпуса: зазоры фасадов, ящики, цоколь, карниз, ХДФ, навесы.
import type { DrawerRunnerLength } from '../cabinet-layout';

export const NAME_SEP = ' · ';
export const DEFAULT_PLINTH_HEIGHT = 60;
export const DEFAULT_TOP_RAIL_HEIGHT = 60;
export const APRON_HEIGHT = 150;
export const APRON_MIN_WIDTH = 300;
export const CROWN_FORWARD_OFFSET = 16;
export const GENERATED_CROWN_SOURCE_PREFIX = 'generated-crown:';
export const GENERATED_PLINTH_SOURCE_PREFIX = 'generated-plinth:';
export const GENERATED_DRAWER_SOURCE_PREFIX = 'generated-drawer:';
export const GENERATED_BACK_RAIL_SOURCE_PREFIX = 'generated-back-rail:';
export const TOP_RAIL_SUPPORT_SHORTER_BY = 32;
export const TOP_RAIL_MINIFIX_SPACING = 400;
export const TOP_RAIL_MINIFIX_EDGE_OFFSET = 50;
export const MINIFIX_CENTER_OFFSET = 34;
export const MINIFIX_CONNECTOR_CHANNEL_DIAMETER = 8;
export const MINIFIX_CONNECTOR_CHANNEL_DEPTH = 30;
export const MINIFIX_CONNECTOR_PIN_DIAMETER = 5;
export const MINIFIX_CONNECTOR_PIN_DEPTH = 12;
export const PLINTH_MINIFIX_DOWEL_SPACING = 32;
export const PLINTH_DOWEL_DIAMETER = 8;
export const PLINTH_DOWEL_DEPTH = 12;
export const PLINTH_TO_BOTTOM_MAX_DOWEL_SPACING = 400;
export const TOP_RAIL_CONNECTOR_PIN_BOTTOM_OFFSET = 8;
export const BACK_PANEL_SPLIT_THRESHOLD = 1000;
export const BACK_PANEL_MIN_SECTION_WIDTH = 300;
export const DRAWER_RUNNER_LENGTHS: DrawerRunnerLength[] = [250, 300, 350, 400, 450, 500, 550, 600];
export const DEFAULT_DRAWER_RUNNER_LENGTH: DrawerRunnerLength = 450;
export const DRAWER_RUNNER_AUTO_FRONT_CLEARANCE = 16;
export const DRAWER_RUNNER_AUTO_BACK_CLEARANCE = 30;
export const DRAWER_FINGER_CLEARANCE = 32;
export const HANDLED_FRONT_GAP = 3;
export const DRAWER_FACADE_SIDE_CLEARANCE = 4;
export const DRAWER_BOX_HEIGHT_REDUCTION = 50;
export const DRAWER_BOX_WIDTH_REDUCTION = 10;
export const DRAWER_FRONT_BACK_LOWER_BY = 28;
export const DRAWER_SIDE_BOTTOM_OVERHANG = 12;
export const DRAWER_BOX_BACK_OFFSET = 16;
export const DRAWER_BACK_LIFT = 4;
export const DRAWER_BOTTOM_EXTRA_DEPTH = 32;
export const DRAWER_BOX_WALL_TOP_EXTENSION = 20;
export const DRAWER_BOX_LIFT_RELATIVE_TO_FACADE = 4;
export const INSET_FRONT_WIDTH_REDUCTION = 2;
export const INSET_FRONT_HEIGHT_REDUCTION = 8;
export const INSET_FRONT_INTERNAL_RECESS = 18;
const TIER_DIVIDER_FRONT_INSET = 16;
// ХДФ в пазу — по эталону Базиса (26163, верхние модули): паз в 14 от задней кромки
// (ось фрезы), глубиной 5, насквозь по боковинам, крыше и дну; ХДФ 3 мм заходит в каждый
// паз на 3 мм, то есть на 6 больше проёма. Ширина паза в выгрузке не видна (это диаметр
// фрезы T1) — берём 4 мм под ХДФ 3.
export const HDF_BACK_THICKNESS = 3;
export const HDF_GROOVE_BACK_OFFSET = 14;
export const HDF_GROOVE_DEPTH = 5;
export const HDF_GROOVE_WIDTH = 4;
export const HDF_GROOVE_ENGAGEMENT = 3;
export const GENERATED_GROOVE_SOURCE_PREFIX = 'generated-groove:';
// Накладная ХДФ прибивается на задние торцы корпуса и не доходит до его краёв на 2 мм
// (эталон 26163: антресоль 836x400 → 832x396, пенал — от низа дна до верха крыши минус по 2).
export const HDF_OVERLAY_EDGE_INSET = 2;
// Под регулируемые навесы ХДФ вырезается в обоих верхних углах: 20 по ширине, 30 по высоте
// (эталон 26163, все шесть верхних модулей, например 1_01-06 и 1_02-06).
export const HANGER_NOTCH_WIDTH = 20;
export const HANGER_NOTCH_HEIGHT = 30;
// Зазоры накладных фасадов — по эталону 26163 (пильные размеры с бирок): у края корпуса 2 сбоку
// и 2 сверху, снизу вровень с корпусом (ВМ 800x420 → фасад 796x418; у антресоли 400 чашки двери 398
// стоят на 82/318, как и метки на боковине, у пенала над дверью 2), между соседними фасадами 4
// по ширине и по высоте (антресоль 836 → две двери по 414; пенал: дверь 2198 = 1620 + 320 + 250 + 2 x 4).
export const OVERLAY_FRONT_EDGE_GAP = 2;
export const OVERLAY_FRONT_MIDDLE_GAP = 4;
export const OVERLAY_FRONT_TOP_EDGE_GAP = 2;
export const OVERLAY_FRONT_BOTTOM_EDGE_GAP = 0;
export const OVERLAY_FRONT_TIER_DIVIDER_GAP = 4;
export const DRAWER_BOTTOM_FACADE_MIN_CLEARANCE = 4;
export const MIN_DRAWER_FACADE_HEIGHT = 130;
export const DRAWER_FRONT_PANEL_MIN_FACADE_HEIGHT = 180;
export const MIN_TIER_HEIGHT = 50;
export const CONFIRMAT_THREAD_DIAMETER = 5;
export const CONFIRMAT_THREAD_DEPTH = 50;
export const CONFIRMAT_HEAD_DIAMETER = 8;
export const CONFIRMAT_HEAD_DEPTH = 16;
