import { create } from 'zustand';
import { addDrillToPart, addDrillsToPart, addPart, addParts, createProject, getDrillGroupToken, moveDrillGroup, movePartsWithDependentOperations, removePartWithDependentOperations, replaceParts, updatePart, type Project } from '../domain/project';
import { loadSavedProjectProgress, saveProjectProgress as persistProjectProgress, hasSavedProjectProgress, openProjectFromFile, trySaveProjectProgress } from '../infra/save-load';
import { addCabinetTierDividerToSection, addPartitionToLayoutSection, addShelfToLayoutSection, buildSimpleCabinet, getCabinetModuleState, getDrawerStackForSection, getLeafSectionInnerSpan, getLeafSections, getLeafTierSections, getLocalZonesForSection, getMaxDrawerCountForClearHeight, rebuildCabinetGroup, removeCabinetElementFromLayout, replaceGroupParts, updateCabinetSectionWidths, updateCabinetTierHeight, updateLocalTierDividerLayout, updateTierDividerLayout, upsertDrawerStackInLayoutSection, type CabinetFrontMode, type CabinetFrontOpeningMode, type CabinetFrontType, type CabinetModuleState, type CabinetTopMode } from '../domain/cabinet-builder';
import { createCabinetLayout, type DrawerRunnerLength, type DrawerRunnerLengthMode, type DrawerRunnerType } from '../domain/cabinet-layout';
import { clampPartSize, createPanelPart, roundDownToMillimeter, type Part, type PartFace } from '../domain/part';
import { createDrillOperation, getFaceAxis, type DrillOperation } from '../domain/drill';
import { buildSnapCandidates, clampPointToFace, collidesWithAny, computeRelativePosition, getBounds, type RelativePlacementRule } from '../domain/geometry';
import { HOLE_TEMPLATES, type HoleTemplateId } from '../domain/templates';
import { validateDrillOperation } from '../domain/validation';
import { applyProject, createHistory, redo, undo, type HistoryState } from '../editor/commands';
import { applyGeneratedJoinery, type AutoJointRuleDraft } from '../domain/auto-drilling';
import { createEmptySideJoinery, type SideJoinery } from '../domain/joinery';
import type { Lang } from '../i18n';
import { createId } from '../shared/ids';

export type ToolName = 'select' | 'place-hole' | 'measure';
export type SelectionMode = 'part' | 'group';
export type ThemeMode = 'light' | 'dark-blue';

type Selection =
  | { type: 'part'; partId: string }
  | { type: 'face'; partId: string; face: PartFace }
  | { type: 'group'; groupId: string }
  | null;

type HoleDraft = { diameter: number; depth: number; through: boolean };
type SelectedDrill = { partId: string; opId: string } | null;
export type MeasuredFace = { partId: string; face: PartFace };
type CameraState = { focusVersion: number; targetPartId: string | null; targetGroupId: string | null };
type CabinetDraft = { width: number; height: number; depth: number; thickness: number; shelfCount: number; partitionCount: number; withBackPanel: boolean; frontType: CabinetFrontType; frontCount: number; frontMode: CabinetFrontMode; frontOpeningMode: CabinetFrontOpeningMode; topMode: CabinetTopMode; withPlinth: boolean; plinthHeight: number; withTopRails: boolean; topRailHeight: number; withAprons: boolean; tierCount: number; tierHeight: number; quickAllMinifix: boolean; quickAllConfirmat: boolean };
type MoveDraft = { axis: 'x' | 'y' | 'z'; distance: number; targetPartId: string; relativeRule: RelativePlacementRule; offset: number };
type SectionSelection = { groupId: string; sectionId: string; tierId?: string; zoneId?: string } | null;

type AppState = {
  history: HistoryState;
  selected: Selection;
  selectedPartIds: string[];
  selectedDrill: SelectedDrill;
  measuredFaces: [MeasuredFace | null, MeasuredFace | null];
  selectedSection: SectionSelection;
  activeTool: ToolName;
  selectionMode: SelectionMode;
  experimentalMoveMode: boolean;
  showDrilling: boolean;
  xrayMode: boolean;
  showAxisIndicator: boolean;
  language: Lang;
  themeMode: ThemeMode;
  snapGrid: number;
  holeDraft: HoleDraft;
  cabinetDraft: CabinetDraft;
  jointRules: AutoJointRuleDraft;
  moveDraft: MoveDraft;
  lastValidationErrors: string[];
  camera: CameraState;
  hasSavedProgress: boolean;
  saveProgressMessage: string | null;

  setActiveTool: (tool: ToolName) => void;
  setSelectionMode: (mode: SelectionMode) => void;
  setSelectedSection: (groupId: string | null, sectionId: string | null, tierId?: string | null, zoneId?: string | null) => void;
  setExperimentalMoveMode: (enabled: boolean) => void;
  setShowDrilling: (enabled: boolean) => void;
  setXrayMode: (enabled: boolean) => void;
  setShowAxisIndicator: (enabled: boolean) => void;
  setLanguage: (lang: Lang) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setSnapGrid: (value: number) => void;
  setMoveDraft: (patch: Partial<MoveDraft>) => void;

  selectPart: (partId: string | null, additive?: boolean) => void;
  selectPartSet: (partIds: string[]) => void;
  selectFace: (partId: string, face: PartFace) => void;
  selectGroup: (groupId: string | null) => void;
  selectDrillOperation: (partId: string, opId: string) => void;
  clearMeasurement: () => void;

  addDemoPart: () => void;
  addCabinet: () => void;

  updateHoleDraft: (patch: Partial<HoleDraft>) => void;
  updateCabinetDraft: (patch: Partial<CabinetDraft>) => void;
  updateJointRules: (patch: Partial<AutoJointRuleDraft>) => void;
  updatePartJoinery: (partId: string, patch: Partial<SideJoinery>) => void;
  updatePartHingeEdge: (partId: string, hingeEdge: 'left' | 'right' | 'top' | 'bottom') => void;
  updateBatchPartJoinery: (partIds: string[], patch: Partial<SideJoinery>) => void;
  addHoleToFace: (partId: string, face: PartFace, x: number, y: number) => void;
  applyTemplateToSelectedFace: (templateId: HoleTemplateId) => void;
  moveSelectedDrillGroup: (x: number, y: number) => void;
  updatePartName: (partId: string, name: string) => void;
  setPartHidden: (partId: string, hidden: boolean) => void;
  updatePartSize: (partId: string, patch: Partial<Pick<Part, 'width' | 'height' | 'thickness'>>) => void;
  updatePartPosition: (partId: string, patch: Partial<Part['position']>) => void;
  applyMoveByAxis: () => void;
  applyRelativeMove: () => void;
  applySnapCandidate: (candidateId: string) => void;
  applySceneSnapCandidate: (targetPartId: string, candidateId: string) => void;
  updateCabinetModule: (groupId: string, patch: Partial<{ name: string; width: number; height: number; depth: number; thickness: number; shelfCount: number; partitionCount: number; withBackPanel: boolean; frontType: CabinetFrontType; frontCount: number; frontMode: CabinetFrontMode; frontOpeningMode: CabinetFrontOpeningMode; topMode: CabinetTopMode; withPlinth: boolean; plinthHeight: number; withTopRails: boolean; topRailHeight: number; withAprons: boolean; tierCount: number; withTierDivider: boolean; tierHeight: number; backPanelSections: string[]; frontTierIds: string[]; position: Part['position'] }>) => void;
  updateSelectedCabinetSectionWidths: (widths: number[]) => void;
  updateSelectedCabinetTierHeight: (height: number) => void;
  updateSelectedSectionDrawerStack: (drawerCount: number, runnerType: DrawerRunnerType, runnerLength: DrawerRunnerLength, runnerLengthMode?: DrawerRunnerLengthMode) => void;
  addShelfToSelectedGroup: () => void;
  addTierDividerToSelectedSection: () => void;
  addPartitionToSelectedGroup: () => void;
  duplicateSelected: () => void;
  removeSelectedCabinetElement: () => void;
  toggleBackPanelForSelectedGroup: () => void;
  toggleBackPanelForSelectedTier: () => void;
  toggleFrontsForSelectedGroup: () => void;
  toggleFrontsForSelectedTier: () => void;
  undo: () => void;
  redo: () => void;
  focusSelection: () => void;
  resetView: () => void;
  saveProgress: () => void;
  loadProgress: () => void;
  openProjectFile: () => Promise<void>;
  newProject: () => void;
};

function clampPositive(value: number, fallback: number) { return clampPartSize(value, fallback); }
function coerceCabinetTopMode(withTopRails: boolean, topMode: CabinetTopMode) { return withTopRails ? 'inset' : topMode; }
function coerceBackPanelAprons<T extends { withBackPanel: boolean; withAprons: boolean }>(current: T, patch: Partial<T>) {
  const withBackPanel = patch.withBackPanel ?? current.withBackPanel;
  const withAprons = patch.withAprons ?? current.withAprons;

  if (patch.withBackPanel === true) return { withBackPanel: true, withAprons: false };
  if (patch.withAprons === true) return { withBackPanel: false, withAprons: true };
  return { withBackPanel, withAprons };
}
function coerceQuickJoineryPreset<T extends { quickAllMinifix: boolean; quickAllConfirmat: boolean }>(current: T, patch: Partial<T>) {
  const quickAllMinifix = patch.quickAllMinifix ?? current.quickAllMinifix;
  const quickAllConfirmat = patch.quickAllConfirmat ?? current.quickAllConfirmat;
  if (patch.quickAllMinifix === true) return { quickAllMinifix: true, quickAllConfirmat: false };
  if (patch.quickAllConfirmat === true) return { quickAllMinifix: false, quickAllConfirmat: true };
  return { quickAllMinifix, quickAllConfirmat };
}
function clampFrontCount(value: number, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, Math.min(4, Math.round(value))) : fallback;
}
function getAutoFrontCount(partitionCount: number) {
  return Math.max(1, Math.min(4, partitionCount + 1));
}
function applyQuickCabinetJoineryPreset(parts: Part[], draft: Pick<CabinetDraft, 'quickAllMinifix' | 'quickAllConfirmat'>) {
  const preset: SideJoinery['left'] | null = draft.quickAllMinifix ? 'minifix-dowel' : draft.quickAllConfirmat ? 'confirmat' : null;
  if (!preset) return parts;
  return parts.map((part) => {
    const role = part.meta?.role;
    if (!role) return part;
    if (role === 'top' || role === 'bottom' || role === 'shelf') {
      return { ...part, meta: { ...part.meta, joinery: { ...(part.meta?.joinery ?? createEmptySideJoinery()), left: preset, right: preset } } };
    }
    if (role === 'partition') {
      const partitionBack: SideJoinery['back'] = preset === 'confirmat' ? 'confirmat' : 'none';
      return {
        ...part,
        meta: {
          ...part.meta,
          joinery: {
            ...(part.meta?.joinery ?? createEmptySideJoinery()),
            top: preset,
            bottom: preset,
            back: partitionBack,
          },
        },
      };
    }
    if (role === 'back-panel' || role === 'apron') {
      const framePreset: SideJoinery['left'] = preset === 'confirmat' ? 'confirmat' : 'none';
      return {
        ...part,
        meta: {
          ...part.meta,
          joinery: {
            ...(part.meta?.joinery ?? createEmptySideJoinery()),
            top: framePreset,
            bottom: framePreset,
            left: framePreset,
            right: framePreset,
          },
        },
      };
    }
    return part;
  });
}

function inferSelectedSection(parts: Part[], part: Part) {
  const groupId = part.meta?.groupId ?? null;
  if (!groupId) return null;
  const module = getCabinetModuleState(parts, groupId);
  if (!module) return null;
  const sections = getLeafTierSections(module);
  if (sections.length === 0) return null;
  const sharedRole = part.meta?.role;
  if (
    sharedRole === 'partition'
    || sharedRole === 'left-side'
    || sharedRole === 'right-side'
    || sharedRole === 'top'
    || sharedRole === 'bottom'
    || sharedRole === 'apron'
    || sharedRole === 'plinth-front'
    || sharedRole === 'plinth-back'
    || sharedRole === 'plinth-brace'
    || sharedRole === 'top-rail-front'
    || sharedRole === 'top-rail-support'
  ) {
    return null;
  }

  if (part.meta?.role === 'tier-divider' && part.meta?.sourceId?.startsWith('tier-divider:')) {
    const tierId = (part.meta?.sourceId ?? '').replace('tier-divider:', '');
    const firstInTier = sections.find((section) => section.tierId === tierId) ?? null;
    return firstInTier ? { groupId, sectionId: firstInTier.id, tierId: firstInTier.tierId } : null;
  }

  const best = sections
    .map((section) => {
      const span = getLeafSectionInnerSpan(module, section);
      const minX = module.position.x + span.startX;
      const maxX = module.position.x + span.endX;
      const dx = part.position.x < minX ? minX - part.position.x : part.position.x > maxX ? part.position.x - maxX : 0;
      const dy = part.position.y < section.startY ? section.startY - part.position.y : part.position.y > section.endY ? part.position.y - section.endY : 0;
      return { section, score: dy * 1000 + dx };
    })
    .sort((a, b) => a.score - b.score)[0]?.section ?? null;
  if (!best) return null;
  const zones = getLocalZonesForSection(module, best.id, best.tierId);
  const bestZone = zones
    .map((zone) => ({
      zone,
      score: part.position.y < zone.startY ? zone.startY - part.position.y : part.position.y > zone.endY ? part.position.y - zone.endY : 0,
    }))
    .sort((a, b) => a.score - b.score)[0]?.zone ?? null;
  return { groupId, sectionId: best.id, tierId: best.tierId, zoneId: bestZone?.id };
}
function findPart(project: Project, partId: string) { return project.parts.find((part) => part.id === partId) ?? null; }
function groupIdFromSelection(project: Project, selection: Selection) {
  if (!selection) return null;
  if (selection.type === 'group') return selection.groupId;
  return findPart(project, selection.partId)?.meta?.groupId ?? null;
}
function getBoundsCenter(bounds: ReturnType<typeof getBounds>) {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
  };
}
function movedPartsForSelection(project: Project, selected: Selection) {
  if (!selected) return [] as Part[];
  if (selected.type === 'group') return project.parts.filter((part) => part.meta?.groupId === selected.groupId);
  const part = findPart(project, selected.partId);
  return part ? [part] : [];
}
function movedPartsForSelectionIds(project: Project, selected: Selection, selectedPartIds: string[]) {
  if (selectedPartIds.length > 1) {
    const byId = new Set(selectedPartIds);
    return project.parts.filter((part) => byId.has(part.id));
  }
  return movedPartsForSelection(project, selected);
}
function applyPatchToParts(parts: Part[], patch: Partial<Part['position']>) {
  return parts.map((part) => ({ ...part, position: { x: Number.isFinite(patch.x) ? patch.x! : part.position.x, y: Number.isFinite(patch.y) ? patch.y! : part.position.y, z: Number.isFinite(patch.z) ? patch.z! : part.position.z } }));
}
function clonePartForDuplicate(part: Part, deltaX: number): Part {
  return {
    ...part,
    id: createId('part'),
    name: `${part.name} copy`,
    position: { ...part.position, x: part.position.x + deltaX },
    operations: part.operations.map((op) => ({ ...op, id: createId('drill') })),
    meta: part.meta
      ? {
          ...part.meta,
          groupId: undefined,
          sourceId: undefined,
          cabinetLayout: undefined,
          cabinetOptions: undefined,
        }
      : undefined,
  };
}
type MoveCommitResult =
  | { ok: true; next: Project }
  | { ok: false; errors: string[] };

function tryCommitMovedSelection(state: AppState, updatedSelectionParts: Part[]): MoveCommitResult {
  const project = state.history.present;
  const movedIds = new Set(updatedSelectionParts.map((part) => part.id));
  const neighborBounds = project.parts.filter((part) => !movedIds.has(part.id)).map((part) => getBounds([part]));
  const movedBounds = getBounds(updatedSelectionParts);
  if (collidesWithAny(movedBounds, neighborBounds)) {
    return { ok: false, errors: ['Move blocked: parts would intersect'] } satisfies MoveCommitResult;
  }
  return { ok: true, next: movePartsWithDependentOperations(project, updatedSelectionParts) } satisfies MoveCommitResult;
}

function updateDividerLayoutBySource(module: Parameters<typeof updateTierDividerLayout>[0], dividerSourceId: string, nextCenterY: number) {
  return dividerSourceId.startsWith('tier-divider:')
    ? updateTierDividerLayout(module, dividerSourceId, nextCenterY)
    : updateLocalTierDividerLayout(module, dividerSourceId, nextCenterY);
}

function resolveSelectedZoneId(
  module: CabinetModuleState,
  groupId: string,
  selectedSection: SectionSelection,
  sectionId: string,
  tierId?: string | null
) {
  if (selectedSection?.groupId !== groupId) return undefined;
  if (selectedSection.sectionId !== sectionId) return undefined;
  if ((selectedSection.tierId ?? undefined) !== (tierId ?? undefined)) return undefined;
  const zones = getLocalZonesForSection(module, sectionId, tierId ?? undefined);
  if (zones.length <= 1) return undefined;
  if (selectedSection.zoneId && zones.some((zone) => zone.id === selectedSection.zoneId)) return selectedSection.zoneId;
  return zones[0]?.id;
}

function findDuplicateDeltaX(project: Project, originalParts: Part[], duplicatedParts: Part[], snapGrid: number) {
  const originalBounds = getBounds(originalParts);
  const duplicatedBounds = getBounds(duplicatedParts);
  const spanX = originalBounds.maxX - originalBounds.minX;
  const offset = spanX + snapGrid;
  const neighborBounds = project.parts
    .filter((part) => !originalParts.some((original) => original.id === part.id))
    .map((part) => getBounds([part]));

  const tryDelta = (deltaX: number) => {
    const moved = duplicatedParts.map((part) => ({
      ...part,
      position: { ...part.position, x: part.position.x + deltaX },
    }));
    const movedBounds = {
      ...duplicatedBounds,
      minX: duplicatedBounds.minX + deltaX,
      maxX: duplicatedBounds.maxX + deltaX,
    };
    return collidesWithAny(movedBounds, neighborBounds) ? null : moved;
  };

  return tryDelta(offset) ?? tryDelta(-offset) ?? duplicatedParts.map((part) => ({
    ...part,
    position: { ...part.position, x: part.position.x + offset },
  }));
}

function commitSnapCandidate(state: AppState, targetPartId: string, candidateId: string): MoveCommitResult {
  const project = state.history.present;
  const selectedParts = movedPartsForSelectionIds(project, state.selected, state.selectedPartIds);
  if (selectedParts.length === 0) return { ok: false, errors: ['Select a part or group to move'] };

  const target = findPart(project, targetPartId);
  if (!target) return { ok: false, errors: ['Select a target part first'] };
  if (selectedParts.some((part) => part.id === target.id)) {
    return { ok: false, errors: ['Target part must be different from moved selection'] };
  }

  const movingBounds = getBounds(selectedParts);
  const targetBounds = getBounds([target]);
  const current = getBoundsCenter(movingBounds);
  const candidate = buildSnapCandidates(movingBounds, targetBounds, current).find((item) => item.id === candidateId);
  if (!candidate) return { ok: false, errors: ['Snap candidate is no longer available'] };

  const dx = candidate.nextPosition.x - current.x;
  const dy = candidate.nextPosition.y - current.y;
  const dz = candidate.nextPosition.z - current.z;
  const updated = selectedParts.map((part) => ({
    ...part,
    position: {
      x: part.position.x + dx,
      y: part.position.y + dy,
      z: part.position.z + dz,
    },
  }));

  return tryCommitMovedSelection(state, updated);
}

const initialProject = loadSavedProjectProgress() ?? createProject('Furniture MVP');

export const useAppStore = create<AppState>((set, get) => ({
  history: createHistory(initialProject),
  selected: null,
  selectedPartIds: [],
  selectedDrill: null,
  measuredFaces: [null, null],
  selectedSection: null,
  activeTool: 'select',
  selectionMode: 'part',
  experimentalMoveMode: false,
  showDrilling: true,
  xrayMode: true,
  showAxisIndicator: false,
  language: 'en',
  themeMode: 'dark-blue',
  snapGrid: 16,
  holeDraft: { diameter: 5, depth: 12, through: false },
  cabinetDraft: { width: 800, height: 720, depth: 560, thickness: 16, shelfCount: 0, partitionCount: 0, withBackPanel: false, frontType: 'none', frontCount: 0, frontMode: 'overlay', frontOpeningMode: 'handleless', topMode: 'overlay', withPlinth: false, plinthHeight: 60, withTopRails: false, topRailHeight: 60, withAprons: false, tierCount: 1, tierHeight: 0, quickAllMinifix: false, quickAllConfirmat: false },
  jointRules: { frontOffset: 64, backOffset: 64, shelfPinDiameter: 5, camDowelSpacing: 32 },
  moveDraft: { axis: 'y', distance: 0, targetPartId: '', relativeRule: 'right-of', offset: 0 },
  lastValidationErrors: [],
  camera: { focusVersion: 0, targetPartId: null, targetGroupId: null },
  hasSavedProgress: hasSavedProjectProgress(),
  saveProgressMessage: null,

  setActiveTool: (tool) => set((state) => ({ activeTool: tool, measuredFaces: tool === 'measure' ? state.measuredFaces : [null, null] })),
  setSelectionMode: (mode) => set({ selectionMode: mode }),
  setSelectedSection: (groupId, sectionId, tierId, zoneId) => set({ selectedSection: groupId && sectionId ? { groupId, sectionId, tierId: tierId ?? undefined, zoneId: zoneId ?? undefined } : null }),
  setExperimentalMoveMode: (enabled) => set({ experimentalMoveMode: enabled }),
  setShowDrilling: (enabled) => set({ showDrilling: enabled }),
  setXrayMode: (enabled) => set({ xrayMode: enabled }),
  setShowAxisIndicator: (enabled) => set({ showAxisIndicator: enabled }),
  setLanguage: (lang) => set({ language: lang }),
  setThemeMode: (mode) => set({ themeMode: mode }),
  setSnapGrid: (value) => set({ snapGrid: clampPositive(value, 16) }),
  setMoveDraft: (patch) => set((state) => ({ moveDraft: { ...state.moveDraft, ...patch } })),

  selectPart: (partId, additive = false) => {
    if (!partId) return set((state) => ({ selected: null, selectedPartIds: [], selectedDrill: null, selectedSection: null, moveDraft: { ...state.moveDraft, targetPartId: '' } }));
    const state = get();
    const project = state.history.present;
    const part = findPart(project, partId);
    if (!part) return;
    if (additive && state.selectionMode === 'part') {
      const exists = state.selectedPartIds.includes(partId);
      const nextIds = exists ? state.selectedPartIds.filter((id) => id !== partId) : [...state.selectedPartIds, partId];
      const nextPrimary = exists
        ? nextIds[nextIds.length - 1] ?? null
        : partId;
      const primaryPart = nextPrimary ? findPart(state.history.present, nextPrimary) : null;
      const nextSelectedSection = primaryPart?.meta?.groupId && state.selectedSection?.groupId === primaryPart.meta.groupId ? state.selectedSection : null;
      return set({
        selected: nextPrimary ? { type: 'part', partId: nextPrimary } : null,
        selectedPartIds: nextIds,
        selectedDrill: null,
        selectedSection: nextSelectedSection,
        moveDraft: { ...state.moveDraft, targetPartId: '' },
        lastValidationErrors: [],
      });
    }
    const currentGroupId = groupIdFromSelection(state.history.present, state.selected);
    const nextSelectedSection = currentGroupId && currentGroupId === (part.meta?.groupId ?? null) ? state.selectedSection : null;
    const inferredSection = inferSelectedSection(project.parts, part) ?? nextSelectedSection;
    if (state.selectionMode === 'group' && part.meta?.groupId) {
      return set({ selected: { type: 'group', groupId: part.meta.groupId }, selectedPartIds: [], selectedSection: inferredSection, moveDraft: { ...state.moveDraft, targetPartId: '' }, lastValidationErrors: [] });
    }
    set({ selected: { type: 'part', partId }, selectedPartIds: [partId], selectedDrill: null, selectedSection: inferredSection, moveDraft: { ...state.moveDraft, targetPartId: '' }, lastValidationErrors: [] });
  },
  selectPartSet: (partIds) => set((state) => {
    const existingIds = new Set(state.history.present.parts.map((part) => part.id));
    const uniqueIds = Array.from(new Set(partIds)).filter((partId) => existingIds.has(partId));
    if (uniqueIds.length === 0) {
      return {
        selected: null,
        selectedPartIds: [],
        selectedDrill: null,
        selectedSection: null,
        moveDraft: { ...state.moveDraft, targetPartId: '' },
        lastValidationErrors: [],
      };
    }
    const primaryPart = findPart(state.history.present, uniqueIds[0]);
    const inferredSection = primaryPart ? inferSelectedSection(state.history.present.parts, primaryPart) : null;
    return {
      selected: primaryPart ? { type: 'part', partId: primaryPart.id } : null,
      selectedPartIds: uniqueIds,
      selectedDrill: null,
      selectedSection: inferredSection,
      moveDraft: { ...state.moveDraft, targetPartId: '' },
      lastValidationErrors: [],
    };
  }),
  selectFace: (partId, face) => set((state) => {
    const project = state.history.present;
    const currentGroupId = groupIdFromSelection(project, state.selected);
    const nextGroupId = findPart(project, partId)?.meta?.groupId ?? null;
    const part = findPart(project, partId);
    if (!part) return state;
    const inferredSection = inferSelectedSection(project.parts, part) ?? (currentGroupId && currentGroupId === nextGroupId ? state.selectedSection : null);
    const nextMeasuredFaces = (() => {
      if (state.activeTool !== 'measure') return state.measuredFaces;
      const nextFace = { partId, face };
      const [first, second] = state.measuredFaces;
      if (!first || (first && second)) return [nextFace, null] as [MeasuredFace | null, MeasuredFace | null];
      if (first.partId === partId && first.face === face) return [nextFace, null] as [MeasuredFace | null, MeasuredFace | null];
      return [first, nextFace] as [MeasuredFace | null, MeasuredFace | null];
    })();
    return {
      selected: { type: 'face', partId, face },
      selectedPartIds: [partId],
      selectedDrill: null,
      measuredFaces: nextMeasuredFaces,
      selectedSection: inferredSection,
      moveDraft: { ...state.moveDraft, targetPartId: '' },
      lastValidationErrors: [],
    };
  }),
  selectGroup: (groupId) => set((state) => ({
    selected: groupId ? { type: 'group', groupId } : null,
    selectedPartIds: [],
    selectedDrill: null,
    selectedSection: state.selectedSection?.groupId === groupId ? state.selectedSection : null,
    moveDraft: { ...state.moveDraft, targetPartId: '' },
    lastValidationErrors: [],
  })),
  selectDrillOperation: (partId, opId) => set((state) => {
    const project = state.history.present;
    const part = findPart(project, partId);
    if (!part) return state;
    const op = (part.operations ?? []).find((item) => item.id === opId);
    if (!op) return state;
    const inferredSection = inferSelectedSection(project.parts, part) ?? state.selectedSection;
    return {
      selected: { type: 'part', partId },
      selectedPartIds: [partId],
      selectedDrill: { partId, opId },
      selectedSection: inferredSection,
      lastValidationErrors: [],
    };
  }),
  clearMeasurement: () => set({ measuredFaces: [null, null] }),

  addDemoPart: () => {
    const state = get();
    const project = state.history.present;
    const existingCount = project.parts.filter((part) => !part.meta?.groupId).length;
    const part = createPanelPart({ name: `Panel ${existingCount + 1}` });
    part.position = { x: existingCount * 700, y: part.height / 2, z: 0 };
    const next = addPart(project, part);
    set({ history: applyProject(state.history, next), selected: { type: 'part', partId: part.id }, selectedPartIds: [part.id], selectedDrill: null, lastValidationErrors: [] });
  },
  addCabinet: () => {
    const state = get();
    const project = state.history.present;
    const centerX = project.parts.length * 180;
    const parts = applyGeneratedJoinery(
      applyQuickCabinetJoineryPreset(
        buildSimpleCabinet({ ...state.cabinetDraft, name: `Cabinet ${Math.max(1, project.parts.filter((part) => part.meta?.groupId).length + 1)}`, position: { x: centerX, y: 0, z: 0 } }),
        state.cabinetDraft
      ),
      state.jointRules
    );
    const next = addParts(project, parts);
    const groupId = parts[0]?.meta?.groupId ?? null;
    set({ history: applyProject(state.history, next), selected: groupId ? { type: 'group', groupId } : { type: 'part', partId: parts[0].id }, selectedPartIds: groupId ? [] : [parts[0].id], selectedDrill: null, lastValidationErrors: [] });
  },

  updateHoleDraft: (patch) => set((state) => ({ holeDraft: { ...state.holeDraft, ...patch } })),
  updateCabinetDraft: (patch) => set((state) => {
    const backPanelAprons = coerceBackPanelAprons(state.cabinetDraft, patch);
    const quickPreset = coerceQuickJoineryPreset(state.cabinetDraft, patch);
    const nextDraft = { ...state.cabinetDraft, ...patch, ...backPanelAprons, ...quickPreset };
    return { cabinetDraft: { ...nextDraft, topMode: coerceCabinetTopMode(nextDraft.withTopRails, nextDraft.topMode) } };
  }),
  updateJointRules: (patch) => {
    const state = get();
    const nextRules = { ...state.jointRules, ...patch };
    const nextProject = replaceParts(state.history.present, applyGeneratedJoinery(state.history.present.parts, nextRules));
    set({ jointRules: nextRules, history: applyProject(state.history, nextProject), lastValidationErrors: [] });
  },
  updatePartJoinery: (partId, patch) => {
    get().updateBatchPartJoinery([partId], patch);
  },
  updatePartHingeEdge: (partId, hingeEdge) => {
    const state = get();
    const project = state.history.present;
    const part = project.parts.find((item) => item.id === partId);
    if (!part) return;
    const next = replaceParts(project, applyGeneratedJoinery(project.parts.map((item) => (
      item.id === partId
        ? { ...item, meta: { ...item.meta, hingeEdge } }
        : item
    )), state.jointRules));
    set({ history: applyProject(state.history, next), lastValidationErrors: [] });
  },
  updateBatchPartJoinery: (partIds, patch) => {
    const state = get();
    const project = state.history.present;
    const targetIds = new Set(partIds);
    const patchedParts = project.parts.map((part) => {
      if (!targetIds.has(part.id)) return part;
      return { ...part, meta: { ...part.meta, joinery: { ...(part.meta?.joinery ?? createEmptySideJoinery()), ...patch } } };
    });
    const next = replaceParts(project, applyGeneratedJoinery(patchedParts, state.jointRules));
    set({ history: applyProject(state.history, next), lastValidationErrors: [] });
  },
  addHoleToFace: (partId, face, x, y) => {
    const state = get();
    const project = state.history.present;
    const part = project.parts.find((p) => p.id === partId);
    if (!part) return;
    const pt = clampPointToFace(part, face, x, y);
    const manualGroupId = createId('manual-hole-group');
    const op: DrillOperation = createDrillOperation({ source: `manual-group:${partId}:${manualGroupId}`, face, axis: getFaceAxis(face), x: pt.x, y: pt.y, diameter: state.holeDraft.diameter, depth: state.holeDraft.depth, through: state.holeDraft.through });
    const errors = validateDrillOperation(part, op);
    if (errors.length > 0) return set({ lastValidationErrors: errors });
    const next = addDrillToPart(project, partId, op);
    set({ history: applyProject(state.history, next), selected: { type: 'part', partId }, selectedPartIds: [partId], selectedDrill: { partId, opId: op.id }, lastValidationErrors: [] });
  },
  applyTemplateToSelectedFace: (templateId) => {
    const state = get();
    const sel = state.selected;
    if (!sel || sel.type !== 'face') return;
    const project = state.history.present;
    const part = project.parts.find((p) => p.id === sel.partId);
    const template = HOLE_TEMPLATES.find((item) => item.id === templateId);
    if (!part || !template) return;
    const manualGroupId = createId('manual-hole-group');
    const ops = template.create(part, sel.face).map((op) => ({ ...op, source: `manual-group:${part.id}:${manualGroupId}` }));
    const errors = ops.flatMap((op) => validateDrillOperation(part, op));
    if (errors.length > 0) return set({ lastValidationErrors: Array.from(new Set(errors)) });
    const next = addDrillsToPart(project, part.id, ops);
    set({ history: applyProject(state.history, next), lastValidationErrors: [], selected: { type: 'part', partId: part.id }, selectedPartIds: [part.id], selectedDrill: ops[0] ? { partId: part.id, opId: ops[0].id } : null });
  },
  moveSelectedDrillGroup: (x, y) => {
    const state = get();
    if (!state.selectedDrill) return;
    const result = moveDrillGroup(state.history.present, state.selectedDrill.partId, state.selectedDrill.opId, x, y);
    if (result.ok) {
      set({ history: applyProject(state.history, result.next), lastValidationErrors: [] });
      return;
    }
    set({ lastValidationErrors: result.errors });
  },
  updatePartName: (partId, name) => {
    const state = get(); const project = state.history.present; const part = project.parts.find((p) => p.id === partId); if (!part) return;
    set({ history: applyProject(state.history, updatePart(project, { ...part, name })) });
  },
  setPartHidden: (partId, hidden) => {
    const state = get();
    const project = state.history.present;
    const part = project.parts.find((item) => item.id === partId);
    if (!part) return;
    const updated = { ...part, meta: { ...part.meta, hidden } };
    const nextProject = updatePart(project, updated);
    const nextSelectedPartIds = state.selectedPartIds.filter((id) => id !== partId);
    const shouldClearPrimary =
      (state.selected?.type === 'part' || state.selected?.type === 'face') &&
      state.selected.partId === partId &&
      hidden;
    const fallbackPrimaryId = nextSelectedPartIds[nextSelectedPartIds.length - 1] ?? null;
    const nextSelected = shouldClearPrimary
      ? fallbackPrimaryId
        ? { type: 'part', partId: fallbackPrimaryId } as Selection
        : null
      : state.selected;
    set({
      history: applyProject(state.history, nextProject),
      selected: nextSelected,
      selectedPartIds: hidden ? nextSelectedPartIds : state.selectedPartIds,
      selectedSection: shouldClearPrimary ? null : state.selectedSection,
      lastValidationErrors: [],
    });
  },
  updatePartSize: (partId, patch) => {
    const state = get(); const project = state.history.present; const part = project.parts.find((p) => p.id === partId); if (!part) return;
    const nextWidth = roundDownToMillimeter(clampPositive(patch.width ?? part.width, part.width), part.width);
    const nextHeight = roundDownToMillimeter(clampPositive(patch.height ?? part.height, part.height), part.height);
    const nextThickness = roundDownToMillimeter(clampPositive(patch.thickness ?? part.thickness, part.thickness), part.thickness);
    const heightDelta = nextHeight - part.height;
    const keepFacadeHoleWorldY =
      heightDelta !== 0
      && (part.meta?.role === 'front-left' || part.meta?.role === 'front-right' || part.meta?.role === 'drawer-front');
    const updated: Part = {
      ...part,
      width: nextWidth,
      height: nextHeight,
      thickness: nextThickness,
      operations: keepFacadeHoleWorldY
        ? part.operations.map((op) => (
            op.face === 'front' || op.face === 'back' || op.face === 'left' || op.face === 'right'
              ? { ...op, y: op.y + heightDelta / 2 }
              : op
          ))
        : part.operations,
    };
    set({ history: applyProject(state.history, updatePart(project, updated)) });
  },
  updatePartPosition: (partId, patch) => {
    const state = get(); const project = state.history.present; const part = project.parts.find((p) => p.id === partId); if (!part) return;
    if (part.meta?.role === 'tier-divider' && part.meta?.groupId && patch.y !== undefined) {
      const current = getCabinetModuleState(project.parts, part.meta.groupId);
      if (!current) return;
      const layout = updateDividerLayoutBySource(current, part.meta?.sourceId ?? '', patch.y);
      const replacement = applyGeneratedJoinery(rebuildCabinetGroup(project.parts, part.meta.groupId, { ...current, layout }), state.jointRules);
      const next = replaceParts(project, replaceGroupParts(project.parts, part.meta.groupId, replacement));
      set({ history: applyProject(state.history, next), lastValidationErrors: [] });
      return;
    }
    const result = tryCommitMovedSelection(state, applyPatchToParts([part], patch));
    if (result.ok) {
      set({ history: applyProject(state.history, result.next), lastValidationErrors: [] });
      return;
    }
    set({ lastValidationErrors: result.errors });
  },
  applyMoveByAxis: () => {
    const state = get();
    const selectedParts = movedPartsForSelectionIds(state.history.present, state.selected, state.selectedPartIds);
    if (selectedParts.length === 0) return;
    const axis = state.moveDraft.axis; const distance = Number(state.moveDraft.distance || 0);
    if (!Number.isFinite(distance) || distance === 0) return set({ lastValidationErrors: [] });
    if (selectedParts.length === 1 && selectedParts[0]?.meta?.role === 'tier-divider' && axis === 'y') {
      const divider = selectedParts[0];
      const groupId = divider.meta?.groupId ?? null;
      if (!groupId) return;
      const current = getCabinetModuleState(state.history.present.parts, groupId);
      if (!current) return;
      const layout = updateDividerLayoutBySource(current, divider.meta?.sourceId ?? '', divider.position.y + distance);
      const replacement = applyGeneratedJoinery(rebuildCabinetGroup(state.history.present.parts, groupId, { ...current, layout }), state.jointRules);
      const next = replaceParts(state.history.present, replaceGroupParts(state.history.present.parts, groupId, replacement));
      set({ history: applyProject(state.history, next), lastValidationErrors: [] });
      return;
    }
    const updated = selectedParts.map((part) => ({ ...part, position: { ...part.position, [axis]: part.position[axis] + distance } }));
    const result = tryCommitMovedSelection(state, updated);
    if (result.ok) {
      set({ history: applyProject(state.history, result.next), lastValidationErrors: [] });
      return;
    }
    set({ lastValidationErrors: result.errors });
  },
  applyRelativeMove: () => {
    const state = get(); const project = state.history.present; const selectedParts = movedPartsForSelectionIds(project, state.selected, state.selectedPartIds); if (selectedParts.length === 0) return;
    const target = findPart(project, state.moveDraft.targetPartId); if (!target) return set({ lastValidationErrors: ['Select a target part for relative move'] });
    if (selectedParts.some((part) => part.id === target.id)) return set({ lastValidationErrors: ['Target part must be different from moved selection'] });
    const movingBounds = getBounds(selectedParts); const targetBounds = getBounds([target]); const current = getBoundsCenter(movingBounds);
    const nextLead = computeRelativePosition(movingBounds, targetBounds, current, state.moveDraft.relativeRule, state.moveDraft.offset);
    const dx = nextLead.x - current.x, dy = nextLead.y - current.y, dz = nextLead.z - current.z;
    const updated = selectedParts.map((part) => ({ ...part, position: { x: part.position.x + dx, y: part.position.y + dy, z: part.position.z + dz } }));
    const result = tryCommitMovedSelection(state, updated);
    if (result.ok) {
      set({ history: applyProject(state.history, result.next), lastValidationErrors: [] });
      return;
    }
    set({ lastValidationErrors: result.errors });
  },
  applySnapCandidate: (candidateId) => {
    const state = get();
    const result = commitSnapCandidate(state, state.moveDraft.targetPartId, candidateId);
    if (result.ok) {
      set({ history: applyProject(state.history, result.next), lastValidationErrors: [] });
      return;
    }
    set({ lastValidationErrors: result.errors });
  },
  applySceneSnapCandidate: (targetPartId, candidateId) => {
    const state = get();
    const result = commitSnapCandidate(state, targetPartId, candidateId);
    if (result.ok) {
      set({
        history: applyProject(state.history, result.next),
        moveDraft: { ...state.moveDraft, targetPartId },
        lastValidationErrors: [],
      });
      return;
    }
    set({ lastValidationErrors: result.errors });
  },
  updateCabinetModule: (groupId, patch) => {
    const state = get(); const project = state.history.present; const current = getCabinetModuleState(project.parts, groupId); if (!current) return;
    const shelfCount = Math.max(0, Math.round(patch.shelfCount ?? current.shelfCount));
    const partitionCount = Math.max(0, Math.round(patch.partitionCount ?? current.partitionCount));
    const nextLayout = patch.shelfCount !== undefined || patch.partitionCount !== undefined ? createCabinetLayout(partitionCount, shelfCount) : current.layout;
    const nextWithPlinth = patch.withPlinth ?? current.withPlinth;
    const nextWithTopRails = patch.withTopRails ?? current.withTopRails;
    const nextTopMode = coerceCabinetTopMode(nextWithTopRails, patch.topMode ?? current.topMode);
    const backPanelAprons = coerceBackPanelAprons(current, patch);
    const nextTierCount = Math.max(1, Math.round(patch.tierCount ?? current.tierCount));
    const nextFrontCount = clampFrontCount(patch.frontCount ?? current.frontCount, current.frontCount);
    const nextDraft = { ...current, ...patch, width: clampPositive(patch.width ?? current.width, current.width), height: clampPositive(patch.height ?? current.height, current.height), depth: clampPositive(patch.depth ?? current.depth, current.depth), thickness: clampPositive(patch.thickness ?? current.thickness, current.thickness), shelfCount, partitionCount, withBackPanel: backPanelAprons.withBackPanel, frontType: (nextFrontCount > 0 ? 'double' : 'none') as CabinetFrontType, frontCount: nextFrontCount, frontMode: patch.frontMode ?? current.frontMode, frontOpeningMode: patch.frontOpeningMode ?? current.frontOpeningMode ?? 'handleless', topMode: nextTopMode, withPlinth: nextWithPlinth, plinthHeight: clampPositive(patch.plinthHeight ?? current.plinthHeight, current.plinthHeight), withTopRails: nextWithTopRails, topRailHeight: clampPositive(patch.topRailHeight ?? current.topRailHeight, current.topRailHeight), withAprons: backPanelAprons.withAprons, withTierDivider: nextTierCount > 1, tierCount: nextTierCount, tierHeight: clampPositive(patch.tierHeight ?? current.tierHeight, current.tierHeight), backPanelSections: patch.backPanelSections ?? current.backPanelSections, frontTierIds: patch.frontTierIds ?? current.frontTierIds, position: { ...current.position, ...(patch.position ?? {}) }, layout: nextLayout };
    const replacement = applyGeneratedJoinery(
      rebuildCabinetGroup(project.parts, groupId, { name: nextDraft.name, width: nextDraft.width, height: nextDraft.height, depth: nextDraft.depth, thickness: nextDraft.thickness, shelfCount: nextDraft.shelfCount, partitionCount: nextDraft.partitionCount, withBackPanel: nextDraft.withBackPanel, frontType: nextDraft.frontType, frontCount: nextDraft.frontCount, frontMode: nextDraft.frontMode, frontOpeningMode: nextDraft.frontOpeningMode, topMode: nextDraft.topMode, withPlinth: nextDraft.withPlinth, plinthHeight: nextDraft.plinthHeight, withTopRails: nextDraft.withTopRails, topRailHeight: nextDraft.topRailHeight, withAprons: nextDraft.withAprons, withTierDivider: nextDraft.withTierDivider, tierCount: nextDraft.tierCount, tierHeight: nextDraft.tierHeight, backPanelSections: nextDraft.backPanelSections, frontTierIds: nextDraft.frontTierIds, position: nextDraft.position, layout: nextDraft.layout }),
      state.jointRules
    );
    const next = replaceParts(project, replaceGroupParts(project.parts, groupId, replacement));
    const nextSections = getLeafSections(nextDraft);
    const nextLeafSections = getLeafTierSections(nextDraft as any);
    const selectedSection = state.selectedSection?.groupId === groupId && nextLeafSections.some((section) => section.id === state.selectedSection?.sectionId && section.tierId === state.selectedSection?.tierId) ? state.selectedSection : null;
    set({ history: applyProject(state.history, next), selected: { type: 'group', groupId }, selectedPartIds: [], selectedSection, lastValidationErrors: [] });
  },
  updateSelectedCabinetSectionWidths: (widths) => {
    const state = get();
    const groupId = state.selected?.type === 'group'
      ? state.selected.groupId
      : state.selected?.type === 'part' || state.selected?.type === 'face'
      ? findPart(state.history.present, state.selected.partId)?.meta?.groupId ?? null
      : null;
    if (!groupId) return;
    const current = getCabinetModuleState(state.history.present.parts, groupId);
    if (!current) return;
    const layout = updateCabinetSectionWidths(current, widths, state.selectedSection?.sectionId, state.selectedSection?.tierId);
    const replacement = applyGeneratedJoinery(
      rebuildCabinetGroup(state.history.present.parts, groupId, { ...current, layout }),
      state.jointRules
    );
    const next = replaceParts(state.history.present, replaceGroupParts(state.history.present.parts, groupId, replacement));
    set({ history: applyProject(state.history, next), selected: { type: 'group', groupId }, selectedPartIds: [], selectedSection: state.selectedSection, lastValidationErrors: [] });
  },
  updateSelectedCabinetTierHeight: (height) => {
    const state = get();
    const groupId = state.selected?.type === 'group'
      ? state.selected.groupId
      : state.selected?.type === 'part' || state.selected?.type === 'face'
      ? findPart(state.history.present, state.selected.partId)?.meta?.groupId ?? null
      : null;
    if (!groupId) return;
    const current = getCabinetModuleState(state.history.present.parts, groupId);
    if (!current) return;
    const tierId = state.selectedSection?.groupId === groupId ? state.selectedSection?.tierId ?? null : null;
    if (!tierId) return;
    const layout = updateCabinetTierHeight(current, tierId, height);
    const replacement = applyGeneratedJoinery(
      rebuildCabinetGroup(state.history.present.parts, groupId, { ...current, layout }),
      state.jointRules
    );
    const next = replaceParts(state.history.present, replaceGroupParts(state.history.present.parts, groupId, replacement));
    set({ history: applyProject(state.history, next), selected: { type: 'group', groupId }, selectedPartIds: [], selectedSection: state.selectedSection, lastValidationErrors: [] });
  },
  updateSelectedSectionDrawerStack: (drawerCount, runnerType, runnerLength, runnerLengthMode = 'manual') => {
    const state = get();
    const groupId = state.selected?.type === 'group'
      ? state.selected.groupId
      : state.selected?.type === 'part' || state.selected?.type === 'face'
      ? findPart(state.history.present, state.selected.partId)?.meta?.groupId ?? null
      : null;
    if (!groupId) return;
    const current = getCabinetModuleState(state.history.present.parts, groupId);
    if (!current) return;
    const targetSection = state.selectedSection?.groupId === groupId
      ? getLeafTierSections(current).find(
          (section) => section.id === state.selectedSection?.sectionId
            && (!state.selectedSection?.tierId || section.tierId === state.selectedSection?.tierId)
        ) ?? null
      : null;
    const fallbackTierSection = getLeafTierSections(current)[0] ?? null;
    const targetSectionId = targetSection?.id ?? fallbackTierSection?.id ?? getLeafSections(current)[0]?.id;
    if (!targetSectionId) return;
    const targetZoneId = resolveSelectedZoneId(current, groupId, state.selectedSection, targetSectionId, targetSection?.tierId ?? fallbackTierSection?.tierId ?? null);
    const zones = getLocalZonesForSection(current, targetSectionId, targetSection?.tierId ?? fallbackTierSection?.tierId ?? undefined);
    const targetZone = targetZoneId
      ? zones.find((zone) => zone.id === targetZoneId) ?? null
      : zones[0] ?? null;
    const maxDrawerCount = getMaxDrawerCountForClearHeight(targetZone?.clearHeight ?? targetSection?.clearHeight ?? fallbackTierSection?.clearHeight ?? 0);
    const safeDrawerCount = Math.max(0, Math.min(Math.round(drawerCount), maxDrawerCount));
    const { layout, drawerStack } = upsertDrawerStackInLayoutSection(current, targetSectionId, safeDrawerCount, runnerType, runnerLength, targetSection?.tierId, targetZoneId, runnerLengthMode);
    const resolvedTierId = targetSection?.tierId ?? fallbackTierSection?.tierId ?? null;
    const replacement = applyGeneratedJoinery(
      rebuildCabinetGroup(state.history.present.parts, groupId, { ...current, layout, shelfCount: layout.shelves.length, partitionCount: layout.partitions.length }),
      state.jointRules
    );
    const next = replaceParts(state.history.present, replaceGroupParts(state.history.present.parts, groupId, replacement));
    set({
      history: applyProject(state.history, next),
      selected: { type: 'group', groupId },
      selectedPartIds: [],
      selectedSection: { groupId, sectionId: targetSectionId, tierId: resolvedTierId ?? undefined, zoneId: targetZoneId ?? undefined },
      lastValidationErrors: [],
    });
  },
  addShelfToSelectedGroup: () => {
    const state = get(); const groupId = state.selected?.type === 'group' ? state.selected.groupId : state.selected?.type === 'part' || state.selected?.type === 'face' ? findPart(state.history.present, state.selected.partId)?.meta?.groupId ?? null : null; if (!groupId) return;
    const current = getCabinetModuleState(state.history.present.parts, groupId); if (!current) return;
    const targetSection = state.selectedSection?.groupId === groupId
      ? getLeafTierSections(current).find(
          (section) => section.id === state.selectedSection?.sectionId
            && (!state.selectedSection?.tierId || section.tierId === state.selectedSection?.tierId)
        ) ?? null
      : null;
    const fallbackTierSection = getLeafTierSections(current)[0] ?? null;
    const targetSectionId = targetSection?.id ?? fallbackTierSection?.id;
    if (!targetSectionId) return;
    const resolvedTierId = targetSection?.tierId ?? fallbackTierSection?.tierId ?? null;
    const targetZoneId = resolveSelectedZoneId(current, groupId, state.selectedSection, targetSectionId, resolvedTierId);
    const { layout } = addShelfToLayoutSection(current, targetSectionId, resolvedTierId ?? undefined, targetZoneId);
    const replacement = applyGeneratedJoinery(rebuildCabinetGroup(state.history.present.parts, groupId, { ...current, layout, shelfCount: layout.shelves.length, partitionCount: layout.partitions.length }), state.jointRules);
    const next = replaceParts(state.history.present, replaceGroupParts(state.history.present.parts, groupId, replacement));
    set({
      history: applyProject(state.history, next),
      selected: state.selected,
      selectedPartIds: state.selectedPartIds,
      selectedSection: { groupId, sectionId: targetSectionId, tierId: resolvedTierId ?? undefined, zoneId: targetZoneId },
      lastValidationErrors: [],
    });
  },
  addTierDividerToSelectedSection: () => {
    const state = get(); const groupId = state.selected?.type === 'group' ? state.selected.groupId : state.selected?.type === 'part' || state.selected?.type === 'face' ? findPart(state.history.present, state.selected.partId)?.meta?.groupId ?? null : null; if (!groupId) return;
    const current = getCabinetModuleState(state.history.present.parts, groupId); if (!current) return;
    const targetSection = state.selectedSection?.groupId === groupId
      ? getLeafTierSections(current).find(
          (section) => section.id === state.selectedSection?.sectionId
            && (!state.selectedSection?.tierId || section.tierId === state.selectedSection?.tierId)
        ) ?? null
      : null;
    const fallbackTierSection = getLeafTierSections(current)[0] ?? null;
    const targetSectionId = targetSection?.id ?? fallbackTierSection?.id;
    if (!targetSectionId) return;
    const resolvedTierId = targetSection?.tierId ?? fallbackTierSection?.tierId ?? null;
    const { layout } = addCabinetTierDividerToSection(current, targetSectionId, resolvedTierId ?? undefined);
    const replacement = applyGeneratedJoinery(rebuildCabinetGroup(state.history.present.parts, groupId, { ...current, layout, shelfCount: layout.shelves.length, partitionCount: layout.partitions.length }), state.jointRules);
    const next = replaceParts(state.history.present, replaceGroupParts(state.history.present.parts, groupId, replacement));
    set({
      history: applyProject(state.history, next),
      selected: state.selected,
      selectedPartIds: state.selectedPartIds,
      selectedSection: { groupId, sectionId: targetSectionId, tierId: resolvedTierId ?? undefined },
      lastValidationErrors: [],
    });
  },
  duplicateSelected: () => {
    const state = get();
    const selection = state.selected;
    if (!selection) return;

    if (selection.type === 'group') {
      const module = getCabinetModuleState(state.history.present.parts, selection.groupId);
      if (module) {
        const duplicateBase = buildSimpleCabinet({
          ...module,
          position: module.position,
          layout: module.layout,
        });
        const duplicated = findDuplicateDeltaX(
          state.history.present,
          state.history.present.parts.filter((part) => part.meta?.groupId === selection.groupId),
          duplicateBase,
          state.snapGrid
        );
        const next = addParts(state.history.present, duplicated);
        const nextGroupId = duplicated[0]?.meta?.groupId ?? null;
        set({
          history: applyProject(state.history, next),
          selected: nextGroupId ? { type: 'group', groupId: nextGroupId } : state.selected,
          selectedPartIds: [],
          selectedSection: null,
          lastValidationErrors: [],
        });
        return;
      }
    }

    const selectedParts = movedPartsForSelectionIds(state.history.present, state.selected, state.selectedPartIds);
    if (selectedParts.length === 0) return;
    const duplicateBase = selectedParts.map((part) => clonePartForDuplicate(part, 0));
    const duplicatedParts = findDuplicateDeltaX(state.history.present, selectedParts, duplicateBase, state.snapGrid);
    const next = addParts(state.history.present, duplicatedParts);
    const firstPart = duplicatedParts[0] ?? null;
    set({
      history: applyProject(state.history, next),
      selected: firstPart ? { type: 'part', partId: firstPart.id } : null,
      selectedPartIds: duplicatedParts.map((part) => part.id),
      selectedSection: null,
      lastValidationErrors: [],
    });
  },
  addPartitionToSelectedGroup: () => {
    const state = get(); const groupId = state.selected?.type === 'group' ? state.selected.groupId : state.selected?.type === 'part' || state.selected?.type === 'face' ? findPart(state.history.present, state.selected.partId)?.meta?.groupId ?? null : null; if (!groupId) return;
    const current = getCabinetModuleState(state.history.present.parts, groupId); if (!current) return;
    const targetSection = state.selectedSection?.groupId === groupId
      ? getLeafTierSections(current).find(
          (section) => section.id === state.selectedSection?.sectionId
            && (!state.selectedSection?.tierId || section.tierId === state.selectedSection?.tierId)
        ) ?? null
      : null;
    const fallbackTierSection = getLeafTierSections(current)[0] ?? null;
    const targetSectionId = targetSection?.id ?? fallbackTierSection?.id;
    if (!targetSectionId) return;
    const resolvedTierId = targetSection?.tierId ?? fallbackTierSection?.tierId ?? null;
    const { layout, partition } = addPartitionToLayoutSection(current, targetSectionId, resolvedTierId ?? undefined);
    const replacement = applyGeneratedJoinery(rebuildCabinetGroup(state.history.present.parts, groupId, { ...current, layout, shelfCount: layout.shelves.length, partitionCount: layout.partitions.length }), state.jointRules);
    const next = replaceParts(state.history.present, replaceGroupParts(state.history.present.parts, groupId, replacement));
    set({
      history: applyProject(state.history, next),
      selected: state.selected,
      selectedPartIds: state.selectedPartIds,
      selectedSection: { groupId, sectionId: partition.leftSectionId, tierId: resolvedTierId ?? undefined },
      lastValidationErrors: [],
    });
  },
  removeSelectedCabinetElement: () => {
    const state = get();
    const selection = state.selected;
    if (!selection || selection.type === 'group') return;
    const selectedPart = findPart(state.history.present, selection.partId);
    if (!selectedPart) return;
    if (selectedPart.meta?.role !== 'shelf' && selectedPart.meta?.role !== 'partition' && selectedPart.meta?.role !== 'tier-divider') {
      const removed = removePartWithDependentOperations(state.history.present, selectedPart.id);
      const next = replaceParts(removed, applyGeneratedJoinery(removed.parts, state.jointRules));
      set({
        history: applyProject(state.history, next),
        selected: null,
        selectedPartIds: [],
        selectedSection: null,
        lastValidationErrors: [],
      });
      return;
    }
    const groupId = selectedPart.meta?.groupId ?? null;
    if (!groupId) return;
    const current = getCabinetModuleState(state.history.present.parts, groupId);
    if (!current) return;
    const layout = removeCabinetElementFromLayout(current, selectedPart);
    if (layout === current.layout) return;
    const replacement = applyGeneratedJoinery(
      rebuildCabinetGroup(state.history.present.parts, groupId, { ...current, layout, shelfCount: layout.shelves.length, partitionCount: layout.partitions.length }),
      state.jointRules
    );
    const next = replaceParts(state.history.present, replaceGroupParts(state.history.present.parts, groupId, replacement));
    set({
      history: applyProject(state.history, next),
      selected: { type: 'group', groupId },
      selectedPartIds: [],
      selectedSection: null,
      lastValidationErrors: [],
    });
  },
  toggleBackPanelForSelectedGroup: () => {
    const state = get(); const groupId = state.selected?.type === 'group' ? state.selected.groupId : state.selected?.type === 'part' || state.selected?.type === 'face' ? findPart(state.history.present, state.selected.partId)?.meta?.groupId ?? null : null; if (!groupId) return;
    const current = getCabinetModuleState(state.history.present.parts, groupId); if (!current) return;
    const selectedSection = state.selectedSection?.groupId === groupId ? state.selectedSection : null;
    if (selectedSection?.sectionId && selectedSection.tierId) {
      const sectionKey = `section-back-panel:${selectedSection.tierId}:${selectedSection.sectionId}${selectedSection.zoneId ? `:${selectedSection.zoneId}` : ''}`;
      const nextSections = current.backPanelSections.includes(sectionKey)
        ? current.backPanelSections.filter((item) => item !== sectionKey)
        : [...current.backPanelSections, sectionKey];
      const replacement = applyGeneratedJoinery(
        rebuildCabinetGroup(state.history.present.parts, groupId, { ...current, backPanelSections: nextSections }),
        state.jointRules
      );
      const next = replaceParts(state.history.present, replaceGroupParts(state.history.present.parts, groupId, replacement));
      set({ history: applyProject(state.history, next), selected: { type: 'group', groupId }, selectedPartIds: [], selectedSection: state.selectedSection, lastValidationErrors: [] });
      return;
    }
    get().updateCabinetModule(groupId, { withBackPanel: !current.withBackPanel });
  },
  toggleBackPanelForSelectedTier: () => {
    const state = get(); const groupId = state.selected?.type === 'group' ? state.selected.groupId : state.selected?.type === 'part' || state.selected?.type === 'face' ? findPart(state.history.present, state.selected.partId)?.meta?.groupId ?? null : null; if (!groupId) return;
    const current = getCabinetModuleState(state.history.present.parts, groupId); if (!current) return;
    const selectedSection = state.selectedSection?.groupId === groupId ? state.selectedSection : null;
    if (!selectedSection?.tierId) return;
    const tierSections = getLeafTierSections(current).filter((section) => section.tierId === selectedSection.tierId);
    if (tierSections.length === 0) return;
    const tierKeys = tierSections.map((section) => `section-back-panel:${section.tierId}:${section.id}`);
    const hasAllTierPanels = tierKeys.every((key) => current.backPanelSections.includes(key));
    const nextSections = hasAllTierPanels
      ? current.backPanelSections.filter((key) => !tierKeys.includes(key))
      : [...new Set([...current.backPanelSections, ...tierKeys])];
    const replacement = applyGeneratedJoinery(
      rebuildCabinetGroup(state.history.present.parts, groupId, { ...current, backPanelSections: nextSections }),
      state.jointRules
    );
    const next = replaceParts(state.history.present, replaceGroupParts(state.history.present.parts, groupId, replacement));
    set({ history: applyProject(state.history, next), selected: { type: 'group', groupId }, selectedPartIds: [], selectedSection: state.selectedSection, lastValidationErrors: [] });
  },
  toggleFrontsForSelectedGroup: () => {
    const state = get(); const groupId = state.selected?.type === 'group' ? state.selected.groupId : state.selected?.type === 'part' || state.selected?.type === 'face' ? findPart(state.history.present, state.selected.partId)?.meta?.groupId ?? null : null; if (!groupId) return;
    const current = getCabinetModuleState(state.history.present.parts, groupId); if (!current) return;
    const nextFrontCount = current.frontCount > 0 ? 0 : getAutoFrontCount(current.partitionCount);
    get().updateCabinetModule(groupId, { frontCount: nextFrontCount });
  },
  toggleFrontsForSelectedTier: () => {
    const state = get(); const groupId = state.selected?.type === 'group' ? state.selected.groupId : state.selected?.type === 'part' || state.selected?.type === 'face' ? findPart(state.history.present, state.selected.partId)?.meta?.groupId ?? null : null; if (!groupId) return;
    const current = getCabinetModuleState(state.history.present.parts, groupId); if (!current) return;
    const selectedSection = state.selectedSection?.groupId === groupId ? state.selectedSection : null;
    if (!selectedSection?.tierId) return;
    const tierKey = selectedSection.sectionId && selectedSection.zoneId
      ? `tier-front:${selectedSection.tierId}:${selectedSection.sectionId}:${selectedSection.zoneId}`
      : `tier-front:${selectedSection.tierId}`;
    const nextTierIds = current.frontTierIds.includes(tierKey)
      ? current.frontTierIds.filter((item) => item !== tierKey)
      : [...current.frontTierIds, tierKey];
    const replacement = applyGeneratedJoinery(
      rebuildCabinetGroup(state.history.present.parts, groupId, { ...current, frontTierIds: nextTierIds, frontType: current.frontCount > 0 ? 'double' : 'none' }),
      state.jointRules
    );
    const next = replaceParts(state.history.present, replaceGroupParts(state.history.present.parts, groupId, replacement));
    set({ history: applyProject(state.history, next), selected: { type: 'group', groupId }, selectedPartIds: [], selectedSection: state.selectedSection, lastValidationErrors: [] });
  },
  undo: () => set((state) => ({ history: undo(state.history), lastValidationErrors: [] })),
  redo: () => set((state) => ({ history: redo(state.history), lastValidationErrors: [] })),
  focusSelection: () => set((state) => ({ camera: { focusVersion: state.camera.focusVersion + 1, targetPartId: state.selected?.type === 'part' || state.selected?.type === 'face' ? state.selected.partId : null, targetGroupId: state.selected?.type === 'group' ? state.selected.groupId : null } })),
  resetView: () => set((state) => ({ camera: { focusVersion: state.camera.focusVersion + 1, targetPartId: null, targetGroupId: null } })),
  saveProgress: () => {
    const state = get();
    const result = trySaveProjectProgress(state.history.present);
    if (!result.ok) {
      set({ saveProgressMessage: result.error });
      return;
    }
    const savedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    set({ hasSavedProgress: true, saveProgressMessage: `Saved at ${savedAt}` });
  },
  loadProgress: () => {
    const saved = loadSavedProjectProgress();
    if (!saved) return;
    set({
      history: createHistory(saved),
      selected: null,
      selectedPartIds: [],
      selectedSection: null,
      lastValidationErrors: [],
      hasSavedProgress: true,
      saveProgressMessage: 'Saved progress loaded',
    });
  },
  openProjectFile: async () => {
    const result = await openProjectFromFile();
    if (!result.ok) {
      set({ saveProgressMessage: result.error });
      return;
    }
    persistProjectProgress(result.project);
    set({
      history: createHistory(result.project),
      selected: null,
      selectedPartIds: [],
      selectedSection: null,
      lastValidationErrors: [],
      hasSavedProgress: true,
      saveProgressMessage: 'Project file loaded',
    });
  },
  newProject: () => {
    const project = createProject('Furniture MVP');
    persistProjectProgress(project);
    set({
      history: createHistory(project),
      selected: null,
      selectedPartIds: [],
      selectedSection: null,
      lastValidationErrors: [],
      hasSavedProgress: true,
      saveProgressMessage: 'New project created',
    });
  },
}));

export function useProject(): Project { return useAppStore((s) => s.history.present); }
export function useSelectedPart() {
  return useAppStore((state) => {
    const sel = state.selected; const project = state.history.present; const partId = sel?.type === 'part' || sel?.type === 'face' ? sel.partId : null;
    return partId ? project.parts.find((p) => p.id === partId) ?? null : null;
  });
}
