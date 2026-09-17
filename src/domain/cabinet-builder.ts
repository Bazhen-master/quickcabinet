// Публичный API строителя корпуса. Код разложен по src/domain/cabinet/.
export { DRAWER_RUNNER_LENGTHS, HDF_BACK_THICKNESS, HDF_GROOVE_BACK_OFFSET, HDF_GROOVE_DEPTH, HDF_GROOVE_WIDTH, HDF_GROOVE_ENGAGEMENT, HANGER_NOTCH_WIDTH, HANGER_NOTCH_HEIGHT } from './cabinet/constants';
export { getCabinetInnerWidth, getCabinetBodyHeight, getCabinetInnerHeight } from './cabinet/common';
export { getAutoDrawerRunnerLength, getEffectiveDrawerRunnerLength, getMaxDrawerCountForClearHeight } from './cabinet/drawers';
export { getLeafSections, getLeafSectionInnerSpan, getDefaultTierSection, getDrawerBlockFacadeHeight, getLeafTierSections, getLocalZonesForSection, getDrawerStackForSection } from './cabinet/frames';
export { getCabinetOpenings, getOpeningRange, toOpeningRef, extendOpeningRef, getFrontSpecId, setFrontOnOpening, setFrontsOnAllOpenings, setFrontHingeInLayout } from './cabinet/fronts';
export { buildSimpleCabinet } from './cabinet/build';
export { getCabinetModuleState, rebuildCabinetGroup, replaceGroupParts, addShelfToLayoutSection, addPartitionToLayoutSection, removeCabinetElementFromLayout, updateCabinetSectionWidths, updateCabinetTierHeight, updateTierDividerLayout, updateLocalTierDividerLayout } from './cabinet/module-state';
export type { CabinetTopMode, CabinetFrontMode, CabinetFrontOpeningMode, CabinetBackPanelKind, CabinetPlinthKind, CabinetBuildInput, CabinetModuleState, CabinetTierSection, CabinetLocalZone, CabinetSectionDrawerStack } from './cabinet/types';
export type { CabinetOpeningRef, CabinetOpening, FrontHingeType } from './cabinet/fronts';
