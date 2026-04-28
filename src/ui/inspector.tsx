import { useEffect, useMemo, useRef, useState } from 'react';
import { getDrillGroupToken } from '../domain/project';
import { HOLE_TEMPLATES } from '../domain/templates';
import { useAppStore, useProject } from '../app/store';
import { ProjectTree } from './project-tree';
import { DRAWER_RUNNER_LENGTHS, getAutoDrawerRunnerLength, getCabinetModuleState, getDrawerStackForSection, getLeafSectionInnerSpan, getLeafTierSections, getLocalZonesForSection, getMaxDrawerCountForClearHeight } from '../domain/cabinet-builder';
import { getCabinetTierSpecs, type DrawerRunnerLength, type DrawerRunnerLengthMode, type DrawerRunnerType } from '../domain/cabinet-layout';
import { buildSnapCandidates, formatBoundsSize, getBounds, type RelativePlacementRule } from '../domain/geometry';
import { getDrillConflictIds } from '../domain/drill-spacing';
import { createEmptySideJoinery, type JoineryType } from '../domain/joinery';
import { t } from '../i18n';

function Card({ title, children, isDarkBlue = false }: { title: string; children: React.ReactNode; isDarkBlue?: boolean }) {
  return (
    <section style={{ border: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}`, borderRadius: 12, background: isDarkBlue ? '#202124' : '#fff', padding: 12 }}>
      <h4 style={{ margin: '0 0 10px 0' }}>{title}</h4>
      {children}
    </section>
  );
}

function AccordionCard({ title, open, onToggle, children, isDarkBlue = false, accent = false, order }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode; isDarkBlue?: boolean; accent?: boolean; order?: number }) {
  const borderColor = accent ? '#f59e0b' : (isDarkBlue ? '#3f3f46' : '#e7e5e4');
  const headerBackground = accent ? (isDarkBlue ? '#3f2c16' : '#fff7ed') : (isDarkBlue ? '#202124' : '#fff');
  const headerColor = accent ? (isDarkBlue ? '#fde68a' : '#9a3412') : (isDarkBlue ? '#e5e7eb' : '#111');

  return (
    <section style={{ order, border: `1px solid ${borderColor}`, borderRadius: 12, background: isDarkBlue ? '#202124' : '#fff', overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          background: headerBackground,
          border: 'none',
          cursor: 'pointer',
          fontSize: 16,
          fontWeight: 600,
          color: headerColor,
        }}
      >
        <span>{title}</span>
        <span style={{ fontSize: 18, color: isDarkBlue ? '#a1a1aa' : '#78716c' }}>{open ? '−' : '+'}</span>
      </button>
      {open ? <div style={{ padding: '0 12px 12px 12px' }}>{children}</div> : null}
    </section>
  );
}

function formatNumberFieldValue(value: number) {
  return Number.isFinite(value) ? String(value) : '';
}

function NumberField({ label, value, onChange, step = 1, accent = false }: { label: string; value: number; onChange: (value: number) => void; step?: number; accent?: boolean }) {
  const themeMode = useAppStore((s) => s.themeMode);
  const isDarkBlue = themeMode === 'dark-blue';
  const [draft, setDraft] = useState(() => formatNumberFieldValue(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (isFocused) return;
    setDraft(formatNumberFieldValue(value));
  }, [isFocused, value]);

  const commit = (raw: string) => {
    const normalized = raw.trim();
    if (normalized === '' || normalized === '-' || normalized === '.' || normalized === '-.') {
      setDraft(formatNumberFieldValue(value));
      return;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      setDraft(formatNumberFieldValue(value));
      return;
    }
    onChange(parsed);
    setDraft(String(parsed));
  };

  return (
    <label>
      <div style={{ fontSize: 12, marginBottom: 4, color: accent ? (isDarkBlue ? '#fde68a' : '#9a3412') : undefined }}>{label}</div>
      <input
        type="number"
        step={step}
        value={draft}
        onFocus={() => setIsFocused(true)}
        onBlur={(e) => {
          setIsFocused(false);
          commit(e.target.value);
        }}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
          const parsed = Number(raw);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).blur();
          }
        }}
        style={{ width: '100%', padding: 8, boxSizing: 'border-box', background: accent ? (isDarkBlue ? '#2a1f12' : '#fff7ed') : (isDarkBlue ? '#27272a' : '#fff'), color: accent ? (isDarkBlue ? '#fde68a' : '#9a3412') : (isDarkBlue ? '#e5e7eb' : '#111'), border: `1px solid ${accent ? '#f59e0b' : (isDarkBlue ? '#3f3f46' : '#d6d3d1')}`, borderRadius: 6 }}
      />
    </label>
  );
}

function getSelectStyle(isDarkBlue: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: 8,
    background: isDarkBlue ? '#111111' : '#fff',
    color: isDarkBlue ? '#ffffff' : '#111',
    border: `1px solid ${isDarkBlue ? '#3f3f46' : '#d6d3d1'}`,
    borderRadius: 6,
  };
}

function getOptionStyle(isDarkBlue: boolean): React.CSSProperties {
  return {
    background: isDarkBlue ? '#111111' : '#fff',
    color: isDarkBlue ? '#ffffff' : '#111',
  };
}

function StickySelectionBlock({ children, isDarkBlue = false }: { children: React.ReactNode; isDarkBlue?: boolean }) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 5,
        background: isDarkBlue ? '#18181b' : '#fafaf9',
        paddingBottom: 10,
        marginBottom: 10,
      }}
    >
      <div
        style={{
          background: isDarkBlue ? '#202124' : '#fff',
          border: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}`,
          borderRadius: 12,
          padding: 12,
          boxShadow: isDarkBlue ? '0 6px 18px rgba(0,0,0,0.35)' : '0 6px 18px rgba(0,0,0,0.05)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function Inspector() {
  const panelScrollRef = useRef<HTMLDivElement | null>(null);
  const inspectorSelectionRef = useRef<HTMLDivElement | null>(null);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [cabinetOpen, setCabinetOpen] = useState(false);
  const [quickCabinetOpen, setQuickCabinetOpen] = useState(true);
  const [holesOpen, setHolesOpen] = useState(false);
  const [holeDraftOpen, setHoleDraftOpen] = useState(false);
  const [holeMoveX, setHoleMoveX] = useState(0);
  const [holeMoveY, setHoleMoveY] = useState(0);
  const selected = useAppStore((s) => s.selected);
  const selectedPartIds = useAppStore((s) => s.selectedPartIds);
  const selectedDrill = useAppStore((s) => s.selectedDrill);
  const selectedSection = useAppStore((s) => s.selectedSection);
  const language = useAppStore((s) => s.language);
  const themeMode = useAppStore((s) => s.themeMode);
  const isDarkBlue = themeMode === 'dark-blue';
  const experimentalMoveMode = useAppStore((s) => s.experimentalMoveMode);
  const showDrilling = useAppStore((s) => s.showDrilling);
  const xrayMode = useAppStore((s) => s.xrayMode);
  const setShowAxisIndicator = useAppStore((s) => s.setShowAxisIndicator);
  const holeDraft = useAppStore((s) => s.holeDraft);
  const cabinetDraft = useAppStore((s) => s.cabinetDraft);
  const snapGrid = useAppStore((s) => s.snapGrid);
  const jointRules = useAppStore((s) => s.jointRules);
  const moveDraft = useAppStore((s) => s.moveDraft);
  const lastValidationErrors = useAppStore((s) => s.lastValidationErrors);
  const setExperimentalMoveMode = useAppStore((s) => s.setExperimentalMoveMode);
  const setShowDrilling = useAppStore((s) => s.setShowDrilling);
  const setXrayMode = useAppStore((s) => s.setXrayMode);
  const setThemeMode = useAppStore((s) => s.setThemeMode);
  const updateHoleDraft = useAppStore((s) => s.updateHoleDraft);
  const updateCabinetDraft = useAppStore((s) => s.updateCabinetDraft);
  const updateJointRules = useAppStore((s) => s.updateJointRules);
  const updatePartJoinery = useAppStore((s) => s.updatePartJoinery);
  const updatePartHingeEdge = useAppStore((s) => s.updatePartHingeEdge);
  const updateBatchPartJoinery = useAppStore((s) => s.updateBatchPartJoinery);
  const setSnapGrid = useAppStore((s) => s.setSnapGrid);
  const setMoveDraft = useAppStore((s) => s.setMoveDraft);
  const applyMoveByAxis = useAppStore((s) => s.applyMoveByAxis);
  const applyRelativeMove = useAppStore((s) => s.applyRelativeMove);
  const applySnapCandidate = useAppStore((s) => s.applySnapCandidate);
  const updatePartName = useAppStore((s) => s.updatePartName);
  const selectDrillOperation = useAppStore((s) => s.selectDrillOperation);
  const setPartHidden = useAppStore((s) => s.setPartHidden);
  const updatePartSize = useAppStore((s) => s.updatePartSize);
  const updatePartPosition = useAppStore((s) => s.updatePartPosition);
  const moveSelectedDrillGroup = useAppStore((s) => s.moveSelectedDrillGroup);
  const updateCabinetModule = useAppStore((s) => s.updateCabinetModule);
  const addCabinet = useAppStore((s) => s.addCabinet);
  const addShelfToSelectedGroup = useAppStore((s) => s.addShelfToSelectedGroup);
  const addPartitionToSelectedGroup = useAppStore((s) => s.addPartitionToSelectedGroup);
  const toggleBackPanelForSelectedGroup = useAppStore((s) => s.toggleBackPanelForSelectedGroup);
  const toggleBackPanelForSelectedTier = useAppStore((s) => s.toggleBackPanelForSelectedTier);
  const toggleFrontsForSelectedGroup = useAppStore((s) => s.toggleFrontsForSelectedGroup);
  const toggleFrontsForSelectedTier = useAppStore((s) => s.toggleFrontsForSelectedTier);
  const removeSelectedCabinetElement = useAppStore((s) => s.removeSelectedCabinetElement);
  const duplicateSelected = useAppStore((s) => s.duplicateSelected);
  const updateSelectedCabinetSectionWidths = useAppStore((s) => s.updateSelectedCabinetSectionWidths);
  const updateSelectedCabinetTierHeight = useAppStore((s) => s.updateSelectedCabinetTierHeight);
  const updateSelectedSectionDrawerStack = useAppStore((s) => s.updateSelectedSectionDrawerStack);
  const addTierDividerToSelectedSection = useAppStore((s) => s.addTierDividerToSelectedSection);
  const applyTemplateToSelectedFace = useAppStore((s) => s.applyTemplateToSelectedFace);
  const setSelectedSection = useAppStore((s) => s.setSelectedSection);
  const panelControlBorder = isDarkBlue ? '#3f3f46' : '#ddd';
  const panelControlBg = isDarkBlue ? '#27272a' : '#fff';
  const panelControlText = isDarkBlue ? '#e5e7eb' : '#111';
  const createCabinetButtonStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #f59e0b',
    background: isDarkBlue ? '#f59e0b' : '#fb923c',
    color: '#111',
    fontWeight: 700,
    cursor: 'pointer',
  };
  const selectControlStyle = getSelectStyle(isDarkBlue);
  const optionStyle = getOptionStyle(isDarkBlue);

  const project = useProject();
  const multiSelectedParts = useMemo(() => project.parts.filter((part) => selectedPartIds.includes(part.id)), [project.parts, selectedPartIds]);
  const isMultiSelect = selectedPartIds.length > 1;
  const selectedPart = !isMultiSelect && (selected?.type === 'part' || selected?.type === 'face')
    ? project.parts.find((p) => p.id === selected.partId) ?? null
    : null;
  const selectedDrillOp = useMemo(() => {
    if (!selectedDrill || !selectedPart || selectedPart.id !== selectedDrill.partId) return null;
    return (selectedPart.operations ?? []).find((op) => op.id === selectedDrill.opId) ?? null;
  }, [selectedDrill, selectedPart]);
  const selectedDrillToken = useMemo(
    () => (selectedDrill && selectedDrillOp ? getDrillGroupToken(selectedDrill.partId, selectedDrillOp) : null),
    [selectedDrill, selectedDrillOp]
  );
  const selectedDrillGroupCount = useMemo(() => {
    if (!selectedDrillToken) return 0;
    return project.parts.reduce((count, part) => count + (part.operations ?? []).filter((op) => getDrillGroupToken(part.id, op) === selectedDrillToken).length, 0);
  }, [project.parts, selectedDrillToken]);
  const selectedPartOperations = selectedPart?.operations ?? [];
  const selectedJoinery = selectedPart?.meta?.joinery ?? createEmptySideJoinery();
  const selectedPartConflictIds = useMemo(
    () => (selectedPart ? new Set(getDrillConflictIds(selectedPart)) : new Set<string>()),
    [selectedPart]
  );
  const moduleState = selected?.type === 'group'
    ? getCabinetModuleState(project.parts, selected.groupId)
    : selectedPart?.meta?.groupId
    ? getCabinetModuleState(project.parts, selectedPart.meta.groupId)
    : null;

  const selectedPartsForMove = useMemo(() => {
    if (!selected) return [] as typeof project.parts;
    if (selected.type === 'group') return project.parts.filter((part) => part.meta?.groupId === selected.groupId);
    if (selectedPartIds.length > 1) return project.parts.filter((part) => selectedPartIds.includes(part.id));
    const part = project.parts.find((p) => p.id === selected.partId);
    return part ? [part] : [];
  }, [selected, project.parts, selectedPartIds]);

  const selectedMoveBounds = useMemo(() => selectedPartsForMove.length > 0 ? getBounds(selectedPartsForMove) : null, [selectedPartsForMove]);
  const targetPart = project.parts.find((part) => part.id === moveDraft.targetPartId) ?? null;
  const snapCandidates = useMemo(() => {
    if (!selectedMoveBounds || !targetPart) return [];
    const selectedIds = new Set(selectedPartsForMove.map((part) => part.id));
    if (selectedIds.has(targetPart.id)) return [];
    const current = {
      x: (selectedMoveBounds.minX + selectedMoveBounds.maxX) / 2,
      y: (selectedMoveBounds.minY + selectedMoveBounds.maxY) / 2,
      z: (selectedMoveBounds.minZ + selectedMoveBounds.maxZ) / 2,
    };
    return buildSnapCandidates(selectedMoveBounds, getBounds([targetPart]), current);
  }, [selectedMoveBounds, selectedPartsForMove, targetPart]);
  const targetOptions = project.parts.filter((part) => !selectedPartsForMove.some((sel) => sel.id === part.id));

  const leafSections = useMemo(() => moduleState ? getLeafTierSections(moduleState) : [], [moduleState]);
  const activeSection = useMemo(() => {
    if (!moduleState) return null;
    return leafSections.find((section) => selectedSection?.groupId === moduleState.groupId && section.id === selectedSection.sectionId && (!selectedSection.tierId || section.tierId === selectedSection.tierId)) ?? leafSections[0] ?? null;
  }, [leafSections, moduleState, selectedSection]);
  const localZones = useMemo(
    () => moduleState && activeSection ? getLocalZonesForSection(moduleState, activeSection.id, activeSection.tierId) : [],
    [activeSection, moduleState]
  );
  const defaultLocalZoneId = useMemo(
    () => localZones.length > 1 ? localZones[0]?.id : undefined,
    [localZones]
  );
  const activeLocalZone = useMemo(
    () => localZones.find((zone) => zone.id === (selectedSection?.zoneId ?? defaultLocalZoneId)) ?? localZones[0] ?? null,
    [defaultLocalZoneId, localZones, selectedSection]
  );
  const activeTierSections = useMemo(
    () => activeSection ? leafSections.filter((section) => section.tierId === activeSection.tierId) : leafSections.slice(0, 1),
    [activeSection, leafSections]
  );
  const tierOptions = useMemo(
    () => moduleState ? getCabinetTierSpecs(moduleState.layout).map((tier, tierIndex) => ({ tierId: tier.id, tierIndex })) : [],
    [moduleState]
  );
  const sectionWidths = useMemo(
    () => moduleState ? activeTierSections.map((section) => Math.round(getLeafSectionInnerSpan(moduleState, section).width)) : [],
    [activeTierSections, moduleState]
  );
  const activeDrawerStack = useMemo(() => {
    if (!moduleState || !activeSection) return null;
    const targeted = getDrawerStackForSection(moduleState, activeSection.id, activeSection.tierId, activeLocalZone?.id ?? defaultLocalZoneId);
    if (targeted) return targeted;
    return getDrawerStackForSection(moduleState, activeSection.id, activeSection.tierId);
  }, [activeLocalZone, activeSection, defaultLocalZoneId, moduleState]);
  const maxDrawerCount = useMemo(
    () => getMaxDrawerCountForClearHeight(activeLocalZone?.clearHeight ?? activeSection?.clearHeight ?? 0),
    [activeLocalZone, activeSection]
  );
  const activeDrawerRunnerLengthMode: DrawerRunnerLengthMode = activeDrawerStack ? activeDrawerStack.runnerLengthMode ?? 'manual' : 'auto';
  const activeDrawerRunnerLength: DrawerRunnerLength = activeDrawerStack?.runnerLength ?? getAutoDrawerRunnerLength(moduleState?.depth ?? cabinetDraft.depth);
  const activeAutoDrawerRunnerLength = getAutoDrawerRunnerLength(moduleState?.depth ?? cabinetDraft.depth);
  const groupBounds = useMemo(() => {
    if (!moduleState) return null;
    return getBounds(project.parts.filter((part) => part.meta?.groupId === moduleState.groupId));
  }, [moduleState, project.parts]);

  const ruleOptions: { id: RelativePlacementRule; label: string }[] = [
    { id: 'left-of', label: t(language, 'alignLeftOf') },
    { id: 'right-of', label: t(language, 'alignRightOf') },
    { id: 'in-front-of', label: t(language, 'alignFrontOf') },
    { id: 'behind', label: t(language, 'alignBehind') },
    { id: 'on-top-of', label: t(language, 'alignTopOf') },
    { id: 'under', label: t(language, 'alignUnder') },
    { id: 'center-x', label: t(language, 'alignCenterX') },
    { id: 'center-y', label: t(language, 'alignCenterY') },
    { id: 'center-z', label: t(language, 'alignCenterZ') },
  ];

  const joineryOptions = useMemo<{ id: JoineryType; label: string }[]>(() => [
    { id: 'none', label: t(language, 'none') },
    { id: 'confirmat', label: t(language, 'joineryConfirmat') },
    { id: 'minifix-dowel', label: t(language, 'joineryMinifixDowel') },
    { id: 'rafix', label: t(language, 'joineryRafix') },
    { id: 'shelf_pin', label: t(language, 'joineryShelfPin') },
  ], [language]);
  const standardJoineryOptions = joineryOptions.filter((item) => item.id !== 'rafix');

  const batchRole = useMemo(() => {
    if (multiSelectedParts.length < 2) return null;
    const firstRole = multiSelectedParts[0]?.meta?.role ?? null;
    if ((firstRole !== 'shelf' && firstRole !== 'bottom') || multiSelectedParts.some((part) => part.meta?.role !== firstRole)) return null;
    return firstRole;
  }, [multiSelectedParts]);

  const singleJoineryOptions = selectedPart?.meta?.role === 'shelf'
    ? standardJoineryOptions
    : standardJoineryOptions.filter((item) => item.id !== 'shelf_pin');
  const partitionJoineryOptions = joineryOptions.filter((item) => item.id !== 'shelf_pin');
  const tierDividerJoineryOptions = standardJoineryOptions.filter((item) => item.id !== 'shelf_pin');
  const frameJoineryOptions = joineryOptions.filter((item) => item.id === 'none' || item.id === 'confirmat' || item.id === 'minifix-dowel' || item.id === 'rafix');
  const nonBackPanelFrameJoineryOptions = standardJoineryOptions.filter((item) => item.id === 'none' || item.id === 'confirmat');
  const batchJoineryOptions = batchRole === 'shelf'
    ? standardJoineryOptions
    : standardJoineryOptions.filter((item) => item.id !== 'shelf_pin');
  const removableSelectedPart = Boolean(selectedPart);
  const prioritizeCabinetPanel = Boolean(moduleState);
  const inspectorPanelOrder = prioritizeCabinetPanel ? -2 : undefined;
  const movePanelOrder = prioritizeCabinetPanel ? -1 : undefined;
  const cabinetPanelOrder = prioritizeCabinetPanel ? -3 : undefined;
  const quickCabinetPanelOrder = prioritizeCabinetPanel ? 1 : -1;

  useEffect(() => {
    setShowAxisIndicator(Boolean(selected) && moveOpen);
  }, [moveOpen, selected, setShowAxisIndicator]);

  useEffect(() => {
    if (!selected) return;
    if (selected.type === 'group') {
      setQuickCabinetOpen(false);
      setSelectionOpen(true);
      setCabinetOpen(true);
      return;
    }
    setSelectionOpen(true);
  }, [selected]);

  useEffect(() => {
    if (!selected || (selected.type !== 'part' && selected.type !== 'face')) return;
    const scrollContainer = panelScrollRef.current;
    const selectionPanel = inspectorSelectionRef.current;
    if (!scrollContainer || !selectionPanel) return;

    const rafId = requestAnimationFrame(() => {
      const containerRect = scrollContainer.getBoundingClientRect();
      const panelRect = selectionPanel.getBoundingClientRect();
      const nextTop = scrollContainer.scrollTop + (panelRect.top - containerRect.top) - 8;
      scrollContainer.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
    });

    return () => cancelAnimationFrame(rafId);
  }, [selected]);

  useEffect(() => {
    if (!selectedDrillOp) return;
    setHoleMoveX(selectedDrillOp.x);
    setHoleMoveY(selectedDrillOp.y);
  }, [selectedDrillOp]);

  return (
    <div ref={panelScrollRef} style={{ width: '100%', borderLeft: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}`, background: isDarkBlue ? '#18181b' : '#fafaf9', color: isDarkBlue ? '#e5e7eb' : '#111', padding: 12, overflow: 'auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div ref={inspectorSelectionRef}>
          <AccordionCard title={t(language, 'inspectorSelection')} open={selectionOpen} onToggle={() => setSelectionOpen((value) => !value)} isDarkBlue={isDarkBlue} order={inspectorPanelOrder}>
            {isMultiSelect ? (
            <StickySelectionBlock isDarkBlue={isDarkBlue}>
              <div style={{ marginBottom: 12, fontSize: 14, color: '#444' }}>
                <div><b>{multiSelectedParts.length}</b> {t(language, 'partsSelected')}</div>
                <div style={{ color: '#666', marginTop: 4 }}>
                  {batchRole ? `${t(language, 'batchJoineryAvailableFor')} ${batchRole}s.` : t(language, 'batchJoineryAvailableHint')}
                </div>
              </div>
              {batchRole ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#57534e', marginBottom: 6 }}>{t(language, 'batchJoinery')}</div>
                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                    <label>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'leftJoinery')}</div>
                      <select value="" onChange={(e) => e.target.value && updateBatchPartJoinery(selectedPartIds, { left: e.target.value as JoineryType })} style={selectControlStyle}>
                        <option style={optionStyle} value="">{t(language, 'applyEllipsis')}</option>
                        {batchJoineryOptions.map((item) => <option style={optionStyle} key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'rightJoinery')}</div>
                      <select value="" onChange={(e) => e.target.value && updateBatchPartJoinery(selectedPartIds, { right: e.target.value as JoineryType })} style={selectControlStyle}>
                        <option style={optionStyle} value="">{t(language, 'applyEllipsis')}</option>
                        {batchJoineryOptions.map((item) => <option style={optionStyle} key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                    </label>
                    <NumberField label={t(language, 'frontOffset')} value={jointRules.frontOffset} onChange={(value) => updateJointRules({ frontOffset: value })} />
                    <NumberField label={t(language, 'backOffset')} value={jointRules.backOffset} onChange={(value) => updateJointRules({ backOffset: value })} />
                    <NumberField label={t(language, 'camDowelSpacing')} value={jointRules.camDowelSpacing} onChange={(value) => updateJointRules({ camDowelSpacing: value })} />
                  </div>
                  {batchRole === 'shelf' ? <div style={{ fontSize: 12, color: '#78716c', marginTop: 8 }}>{`${t(language, 'joineryShelfPin')}: ${jointRules.shelfPinDiameter} mm`}</div> : null}
                </div>
              ) : null}
            </StickySelectionBlock>
          ) : selectedPart ? (
            <StickySelectionBlock isDarkBlue={isDarkBlue}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>{t(language, 'partName')}</label>
                <input value={selectedPart.name} onChange={(e) => updatePartName(selectedPart.id, e.target.value)} style={{ width: '100%', padding: 8, boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: removableSelectedPart ? '1fr 1fr' : '1fr', marginBottom: 12 }}>
                <button onClick={() => setPartHidden(selectedPart.id, !selectedPart.meta?.hidden)} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${panelControlBorder}`, background: panelControlBg, color: panelControlText, cursor: 'pointer' }}>
                  {selectedPart.meta?.hidden ? t(language, 'showElement') : t(language, 'hideElement')}
                </button>
                {removableSelectedPart ? <button onClick={removeSelectedCabinetElement} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fff', color: '#b91c1c', cursor: 'pointer' }}>{t(language, 'removeElement')}</button> : null}
              </div>
              <div style={{ marginBottom: 12 }}>
                <button onClick={duplicateSelected} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${panelControlBorder}`, background: panelControlBg, color: panelControlText, cursor: 'pointer' }}>
                  {t(language, 'duplicateElement')}
                </button>
              </div>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr', marginBottom: 12 }}>
                <NumberField label={t(language, 'width')} value={selectedPart.width} onChange={(value) => updatePartSize(selectedPart.id, { width: value })} />
                <NumberField label={t(language, 'height')} value={selectedPart.height} onChange={(value) => updatePartSize(selectedPart.id, { height: value })} />
                <NumberField label={t(language, 'thickness')} value={selectedPart.thickness} onChange={(value) => updatePartSize(selectedPart.id, { thickness: value })} />
                <div />
                <NumberField label="X" value={selectedPart.position.x} onChange={(value) => updatePartPosition(selectedPart.id, { x: value })} />
                <NumberField label="Y" value={selectedPart.position.y} onChange={(value) => updatePartPosition(selectedPart.id, { y: value })} />
                <NumberField label="Z" value={selectedPart.position.z} onChange={(value) => updatePartPosition(selectedPart.id, { z: value })} />
              </div>
              {selected?.type === 'face' ? <div style={{ marginBottom: 12, fontSize: 14 }}>{t(language, 'activeFace')}: <b>{selected.face}</b></div> : null}
              {selected?.type === 'face' ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#57534e', marginBottom: 6 }}>{t(language, 'faceTemplates')}</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {HOLE_TEMPLATES.map((template) => (
                      <button key={template.id} onClick={() => applyTemplateToSelectedFace(template.id)} style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: `1px solid ${panelControlBorder}`, background: panelControlBg, color: panelControlText, cursor: 'pointer' }}>
                        {template.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {selectedPart.meta?.role === 'shelf' || selectedPart.meta?.role === 'bottom' || selectedPart.meta?.role === 'top' ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#57534e', marginBottom: 6 }}>{t(language, 'joinery')}</div>
                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                    <label>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'leftJoinery')}</div>
                      <select value={selectedJoinery.left} onChange={(e) => updatePartJoinery(selectedPart.id, { left: e.target.value as JoineryType })} style={selectControlStyle}>
                        {singleJoineryOptions.map((item) => <option style={optionStyle} key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'rightJoinery')}</div>
                      <select value={selectedJoinery.right} onChange={(e) => updatePartJoinery(selectedPart.id, { right: e.target.value as JoineryType })} style={selectControlStyle}>
                        {singleJoineryOptions.map((item) => <option style={optionStyle} key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                    </label>
                    <NumberField label={t(language, 'frontOffset')} value={jointRules.frontOffset} onChange={(value) => updateJointRules({ frontOffset: value })} />
                    <NumberField label={t(language, 'backOffset')} value={jointRules.backOffset} onChange={(value) => updateJointRules({ backOffset: value })} />
                    <NumberField label={t(language, 'camDowelSpacing')} value={jointRules.camDowelSpacing} onChange={(value) => updateJointRules({ camDowelSpacing: value })} />
                  </div>
                  {selectedPart.meta?.role === 'shelf' ? <div style={{ fontSize: 12, color: '#78716c', marginTop: 8 }}>{`${t(language, 'joineryShelfPin')}: ${jointRules.shelfPinDiameter} mm`}</div> : null}
                </div>
              ) : null}
              {selectedPart.meta?.role === 'partition' ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#57534e', marginBottom: 6 }}>{t(language, 'joinery')}</div>
                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                    <label>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'topJoinery')}</div>
                      <select value={selectedJoinery.top} onChange={(e) => updatePartJoinery(selectedPart.id, { top: e.target.value as JoineryType })} style={selectControlStyle}>
                        {partitionJoineryOptions.map((item) => <option style={optionStyle} key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'bottomJoinery')}</div>
                      <select value={selectedJoinery.bottom} onChange={(e) => updatePartJoinery(selectedPart.id, { bottom: e.target.value as JoineryType })} style={selectControlStyle}>
                        {partitionJoineryOptions.map((item) => <option style={optionStyle} key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                    </label>
                    <NumberField label={t(language, 'frontOffset')} value={jointRules.frontOffset} onChange={(value) => updateJointRules({ frontOffset: value })} />
                    <NumberField label={t(language, 'backOffset')} value={jointRules.backOffset} onChange={(value) => updateJointRules({ backOffset: value })} />
                    <NumberField label={t(language, 'camDowelSpacing')} value={jointRules.camDowelSpacing} onChange={(value) => updateJointRules({ camDowelSpacing: value })} />
                  </div>
                </div>
              ) : null}
              {selectedPart.meta?.role === 'apron' || selectedPart.meta?.role === 'back-panel' || selectedPart.meta?.role === 'tier-divider' ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#57534e', marginBottom: 6 }}>{t(language, 'joinery')}</div>
                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                    {selectedPart.meta?.role !== 'tier-divider' ? (
                      <>
                        <label>
                          <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'topJoinery')}</div>
                          <select value={selectedJoinery.top} onChange={(e) => updatePartJoinery(selectedPart.id, { top: e.target.value as JoineryType })} style={selectControlStyle}>
                            {((selectedPart.meta?.role === 'back-panel' || selectedPart.meta?.role === 'apron') ? frameJoineryOptions : nonBackPanelFrameJoineryOptions).map((item) => <option style={optionStyle} key={item.id} value={item.id}>{item.label}</option>)}
                          </select>
                        </label>
                        <label>
                          <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'bottomJoinery')}</div>
                          <select value={selectedJoinery.bottom} onChange={(e) => updatePartJoinery(selectedPart.id, { bottom: e.target.value as JoineryType })} style={selectControlStyle}>
                            {((selectedPart.meta?.role === 'back-panel' || selectedPart.meta?.role === 'apron') ? frameJoineryOptions : nonBackPanelFrameJoineryOptions).map((item) => <option style={optionStyle} key={item.id} value={item.id}>{item.label}</option>)}
                          </select>
                        </label>
                      </>
                    ) : null}
                    <label>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'leftJoinery')}</div>
                      <select value={selectedJoinery.left} onChange={(e) => updatePartJoinery(selectedPart.id, { left: e.target.value as JoineryType })} style={selectControlStyle}>
                        {(selectedPart.meta?.role === 'tier-divider'
                          ? tierDividerJoineryOptions
                          : selectedPart.meta?.role === 'back-panel' || selectedPart.meta?.role === 'apron'
                            ? frameJoineryOptions
                            : nonBackPanelFrameJoineryOptions).map((item) => <option style={optionStyle} key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'rightJoinery')}</div>
                      <select value={selectedJoinery.right} onChange={(e) => updatePartJoinery(selectedPart.id, { right: e.target.value as JoineryType })} style={selectControlStyle}>
                        {(selectedPart.meta?.role === 'tier-divider'
                          ? tierDividerJoineryOptions
                          : selectedPart.meta?.role === 'back-panel' || selectedPart.meta?.role === 'apron'
                            ? frameJoineryOptions
                            : nonBackPanelFrameJoineryOptions).map((item) => <option style={optionStyle} key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              ) : null}
              {selectedPart.meta?.role === 'front-left' || selectedPart.meta?.role === 'front-right' ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#57534e', marginBottom: 6 }}>{t(language, 'hinges')}</div>
                  <label style={{ display: 'block' }}>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'hingeEdge')}</div>
                    <select
                      value={selectedPart.meta?.hingeEdge ?? (selectedPart.meta?.role === 'front-right' ? 'right' : 'left')}
                      onChange={(e) => updatePartHingeEdge(selectedPart.id, e.target.value as 'left' | 'right' | 'top' | 'bottom')}
                      style={selectControlStyle}
                    >
                      <option style={optionStyle} value="left">{t(language, 'left')}</option>
                      <option style={optionStyle} value="right">{t(language, 'right')}</option>
                      <option style={optionStyle} value="top">{t(language, 'top')}</option>
                      <option style={optionStyle} value="bottom">{t(language, 'bottom')}</option>
                    </select>
                  </label>
                </div>
              ) : null}
              {selectedDrillOp ? (
                <div style={{ marginBottom: 12, padding: 10, border: '1px solid #e7e5e4', borderRadius: 8, background: '#fafaf9' }}>
                  <div style={{ fontSize: 12, color: '#57534e', marginBottom: 6 }}>{t(language, 'holeMove')}</div>
                  <div style={{ fontSize: 12, color: '#78716c', marginBottom: 8 }}>
                    {selectedDrillOp.templateName ?? selectedDrillOp.feature ?? t(language, 'hole')} · {selectedDrillOp.face} · {t(language, 'groupLabel')}: {selectedDrillGroupCount}
                  </div>
                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                    <NumberField label="X" value={holeMoveX} onChange={setHoleMoveX} />
                    <NumberField label="Y" value={holeMoveY} onChange={setHoleMoveY} />
                  </div>
                  <button onClick={() => moveSelectedDrillGroup(holeMoveX, holeMoveY)} style={{ marginTop: 10, width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${panelControlBorder}`, background: panelControlBg, color: panelControlText, cursor: 'pointer' }}>
                    {t(language, 'applyHoleMove')}
                  </button>
                </div>
              ) : null}
              <div style={{ marginBottom: 12 }}>
                <button
                  onClick={() => setHolesOpen((value) => !value)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    background: '#fff',
                    border: '1px solid #e7e5e4',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 12,
                    color: '#57534e',
                  }}
                >
                  <span>{t(language, 'holes')}</span>
                  <span style={{ fontSize: 16, color: '#78716c' }}>{holesOpen ? 'в€’' : '+'}</span>
                </button>
                {holesOpen ? (
                  <div style={{ marginTop: 8 }}>
                    {selectedPartOperations.length === 0 ? (
                      <div style={{ color: '#666', fontSize: 14 }}>{t(language, 'noHolesYet')}</div>
                    ) : (
                      <div style={{ display: 'grid', gap: 6 }}>
                        {selectedPartOperations.map((op, idx) => (
                          <button
                            key={op.id}
                            onClick={() => selectDrillOperation(selectedPart.id, op.id)}
                            style={{
                              border: selectedDrillToken && getDrillGroupToken(selectedPart.id, op) === selectedDrillToken ? '1px solid #f59e0b' : '1px solid #eee',
                              borderRadius: 8,
                              padding: 8,
                              fontSize: 13,
                              background: '#fff',
                              textAlign: 'left',
                              cursor: 'pointer',
                            }}
                          >
                            #{idx + 1} · {op.face} · x:{op.x.toFixed(1)} y:{op.y.toFixed(1)} · Ø{op.diameter} · {op.through ? t(language, 'throughShort') : `${t(language, 'depthShort')} ${op.depth}`}
                            {selectedPartConflictIds.has(op.id) ? <div style={{ color: '#b91c1c', marginTop: 4, fontWeight: 600 }}>{t(language, 'holeConflict')}</div> : null}
                            {op.templateName ? <div style={{ color: '#666', marginTop: 4 }}>{op.templateName}</div> : null}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </StickySelectionBlock>
          ) : selected?.type === 'group' && moduleState ? (
            <StickySelectionBlock isDarkBlue={isDarkBlue}>
              <div style={{ color: '#444' }}>{t(language, 'selectedGroup')}: <b>{moduleState.name}</b></div>
              <div style={{ marginTop: 12 }}>
                <button onClick={duplicateSelected} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${panelControlBorder}`, background: panelControlBg, color: panelControlText, cursor: 'pointer' }}>
                  {t(language, 'duplicateCabinet')}
                </button>
              </div>
            </StickySelectionBlock>
          ) : (
            <StickySelectionBlock isDarkBlue={isDarkBlue}>
              <div style={{ color: '#666' }}>{t(language, 'nothingSelected')}</div>
            </StickySelectionBlock>
          )}

          <ProjectTree />

          </AccordionCard>
        </div>

        {selected ? (
          <AccordionCard title={t(language, 'moveRelativePanel')} open={moveOpen} onToggle={() => setMoveOpen((value) => !value)} isDarkBlue={isDarkBlue} order={movePanelOrder}>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
              <label><div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'axis')}</div><select value={moveDraft.axis} onChange={(e) => setMoveDraft({ axis: e.target.value as 'x' | 'y' | 'z' })} style={selectControlStyle}><option style={optionStyle} value="x">X</option><option style={optionStyle} value="y">Y</option><option style={optionStyle} value="z">Z</option></select></label>
              <NumberField label={t(language, 'distance')} value={moveDraft.distance} onChange={(value) => setMoveDraft({ distance: value })} />
            </div>
            <button onClick={applyMoveByAxis} style={{ marginTop: 10, width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${panelControlBorder}`, background: panelControlBg, color: panelControlText, cursor: 'pointer' }}>{t(language, 'applyMove')}</button>
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: '#57534e', marginBottom: 6 }}>{t(language, 'moveRelative')}</div>
              <label><div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'targetPart')}</div><select value={moveDraft.targetPartId} onChange={(e) => setMoveDraft({ targetPartId: e.target.value })} style={selectControlStyle}><option style={optionStyle} value=""></option>{targetOptions.map((part) => <option style={optionStyle} key={part.id} value={part.id}>{part.name}</option>)}</select></label>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr', marginTop: 10 }}>
                <label><div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'relativeRule')}</div><select value={moveDraft.relativeRule} onChange={(e) => setMoveDraft({ relativeRule: e.target.value as RelativePlacementRule })} style={selectControlStyle}>{ruleOptions.map((item) => <option style={optionStyle} key={item.id} value={item.id}>{item.label}</option>)}</select></label>
                <NumberField label={t(language, 'offset')} value={moveDraft.offset} onChange={(value) => setMoveDraft({ offset: value })} />
              </div>
              <button onClick={applyRelativeMove} style={{ marginTop: 10, width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${panelControlBorder}`, background: panelControlBg, color: panelControlText, cursor: 'pointer' }}>{t(language, 'applyRelative')}</button>
            </div>
            {experimentalMoveMode ? (
              <div style={{ marginTop: 14, padding: 10, border: '1px solid #e7e5e4', borderRadius: 10, background: '#fafaf9' }}>
                <div style={{ fontSize: 12, color: '#57534e', marginBottom: 6 }}>{t(language, 'smartSnap')}</div>
              {snapCandidates.length === 0 ? <div style={{ color: isDarkBlue ? '#a1a1aa' : '#666', fontSize: 13 }}>{t(language, 'noCandidates')}</div> : <div style={{ display: 'grid', gap: 8 }}>{snapCandidates.map((candidate) => <button key={candidate.id} onClick={() => applySnapCandidate(candidate.id)} style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: `1px solid ${panelControlBorder}`, background: panelControlBg, color: panelControlText, cursor: 'pointer' }}>{candidate.label}</button>)}</div>}
              </div>
            ) : null}
          </AccordionCard>
        ) : null}

        {moduleState ? (
          <AccordionCard title={t(language, 'cabinet')} open={cabinetOpen} onToggle={() => setCabinetOpen((value) => !value)} isDarkBlue={isDarkBlue} order={cabinetPanelOrder}>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>{t(language, 'moduleName')}</label>
              <input value={moduleState.name} onChange={(e) => updateCabinetModule(moduleState.groupId, { name: e.target.value })} style={{ width: '100%', padding: 8, boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
              <NumberField label={t(language, 'width')} value={moduleState.width} onChange={(value) => updateCabinetModule(moduleState.groupId, { width: value })} />
              <NumberField label={t(language, 'height')} value={moduleState.height} onChange={(value) => updateCabinetModule(moduleState.groupId, { height: value })} />
              <NumberField label={t(language, 'depth')} value={moduleState.depth} onChange={(value) => updateCabinetModule(moduleState.groupId, { depth: value })} />
              <NumberField label={t(language, 'thickness')} value={moduleState.thickness} onChange={(value) => updateCabinetModule(moduleState.groupId, { thickness: value })} />
              <NumberField accent label={t(language, 'shelves')} value={moduleState.shelfCount} onChange={(value) => updateCabinetModule(moduleState.groupId, { shelfCount: Math.max(0, Math.round(value)) })} />
              <NumberField accent label={t(language, 'partitions')} value={moduleState.partitionCount} onChange={(value) => updateCabinetModule(moduleState.groupId, { partitionCount: Math.max(0, Math.round(value)) })} />
              <NumberField accent label={`${t(language, 'frontCount')} ${language === 'ru' ? '(на ярус)' : '(per tier)'}`} value={moduleState.frontCount} onChange={(value) => updateCabinetModule(moduleState.groupId, { frontCount: Math.max(0, Math.min(4, Math.round(value))) })} />
              <NumberField accent label={t(language, 'tiers')} value={moduleState.tierCount} onChange={(value) => updateCabinetModule(moduleState.groupId, { tierCount: Math.max(1, Math.round(value)) })} />
            </div>
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              <label><div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'topMode')}</div><select value={moduleState.topMode} onChange={(e) => updateCabinetModule(moduleState.groupId, { topMode: e.target.value as 'overlay' | 'inset' })} style={{ width: '100%', padding: 8 }}><option value="overlay">{t(language, 'topOverlay')}</option><option value="inset">{t(language, 'topInset')}</option></select></label>
              <label><div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'frontMode')}</div><select value={moduleState.frontMode} onChange={(e) => updateCabinetModule(moduleState.groupId, { frontMode: e.target.value as 'overlay' | 'inset' })} style={{ width: '100%', padding: 8 }}><option value="inset">{t(language, 'insetFronts')}</option><option value="overlay">{t(language, 'overlayFronts')}</option></select></label>
              <label><div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'openingModeDrawers')}</div><select value={moduleState.frontOpeningMode} onChange={(e) => updateCabinetModule(moduleState.groupId, { frontOpeningMode: e.target.value as 'handleless' | 'handles' })} style={{ width: '100%', padding: 8 }}><option value="handleless">{t(language, 'handlelessProfile')}</option><option value="handles">{t(language, 'installedHandles')}</option></select></label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={moduleState.withBackPanel} onChange={() => updateCabinetModule(moduleState.groupId, { withBackPanel: !moduleState.withBackPanel })} />{t(language, 'backPanel')}</label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={moduleState.withPlinth} onChange={() => updateCabinetModule(moduleState.groupId, { withPlinth: !moduleState.withPlinth })} />{t(language, 'plinth')}</label>
              {moduleState.withPlinth ? <NumberField label={t(language, 'plinthHeight')} value={moduleState.plinthHeight} onChange={(value) => updateCabinetModule(moduleState.groupId, { plinthHeight: value })} /> : null}
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={moduleState.withTopRails} onChange={() => updateCabinetModule(moduleState.groupId, { withTopRails: !moduleState.withTopRails })} />{t(language, 'topDecorRails')}</label>
              {moduleState.withTopRails ? <NumberField label={t(language, 'topRailHeight')} value={moduleState.topRailHeight} onChange={(value) => updateCabinetModule(moduleState.groupId, { topRailHeight: value })} /> : null}
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={moduleState.withAprons} onChange={() => updateCabinetModule(moduleState.groupId, { withAprons: !moduleState.withAprons })} />{t(language, 'aprons')}</label>
            </div>
            <div style={{ marginTop: 12, padding: 10, border: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}`, borderRadius: 10, background: isDarkBlue ? '#111111' : '#fafaf9' }}>
              <div style={{ fontSize: 12, color: isDarkBlue ? '#d4d4d8' : '#57534e', marginBottom: 6 }}>{t(language, 'sectionLayout')}</div>
              <div style={{ fontSize: 13, color: isDarkBlue ? '#ffffff' : '#444', marginBottom: 6 }}>{t(language, 'activeTier')}: {activeSection ? `${activeSection.tierIndex + 1}` : t(language, 'none')}</div>
              <div style={{ fontSize: 13, color: isDarkBlue ? '#ffffff' : '#444', marginBottom: 6 }}>{t(language, 'activeSection')}: {activeSection ? `${Math.max(1, activeTierSections.findIndex((section) => section.id === activeSection.id) + 1)} (${Math.round(getLeafSectionInnerSpan(moduleState, activeSection).width)} mm)` : t(language, 'none')}</div>
              {groupBounds ? <div style={{ fontSize: 13, color: isDarkBlue ? '#ffffff' : '#444' }}>{t(language, 'overallSize')}: {formatBoundsSize(groupBounds)}</div> : null}
              {activeSection && moduleState.tierCount > 1 ? <div style={{ marginTop: 10 }}><NumberField label={t(language, 'activeTierHeight')} value={Math.round(activeSection.clearHeight)} onChange={(value) => updateSelectedCabinetTierHeight(value)} /></div> : null}
              {tierOptions.length > 1 ? (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, marginBottom: 6 }}>{t(language, 'chooseTier')}</div>
                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: `repeat(${Math.min(3, tierOptions.length)}, 1fr)` }}>
                    {tierOptions.map((tier) => (
                      <button
                        key={tier.tierId}
                        onClick={() => {
                          const nextSection = leafSections.find((section) => section.tierId === tier.tierId) ?? null;
                          setSelectedSection(moduleState.groupId, nextSection?.id ?? null, nextSection?.tierId ?? null, null);
                        }}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 8,
                          border: activeSection?.tierId === tier.tierId ? '1px solid #f59e0b' : `1px solid ${isDarkBlue ? '#3f3f46' : '#ddd'}`,
                          background: activeSection?.tierId === tier.tierId ? (isDarkBlue ? '#3f2c16' : '#fff7ed') : (isDarkBlue ? '#111111' : '#fff'),
                          color: isDarkBlue ? '#ffffff' : '#111',
                          cursor: 'pointer',
                        }}
                      >
                        {`${t(language, 'tier')} ${tier.tierIndex + 1}`}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {activeTierSections.length > 1 ? (
                <label style={{ display: 'block', marginTop: 10 }}>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'chooseSection')}</div>
                  <select
                    value={activeSection?.id ?? ''}
                    onChange={(e) => setSelectedSection(moduleState.groupId, e.target.value || null, activeSection?.tierId ?? null, null)}
                    style={selectControlStyle}
                  >
                    {activeTierSections.map((section, index) => (
                      <option style={optionStyle} key={section.id} value={section.id}>{`${t(language, 'section')} ${index + 1} (${Math.round(getLeafSectionInnerSpan(moduleState, section).width)} mm)`}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {localZones.length > 1 ? (
                <label style={{ display: 'block', marginTop: 10 }}>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'chooseLocalTier')}</div>
                  <select
                    value={activeLocalZone?.id ?? ''}
                    onChange={(e) => setSelectedSection(moduleState.groupId, activeSection?.id ?? null, activeSection?.tierId ?? null, e.target.value || null)}
                    style={selectControlStyle}
                  >
                    {localZones.map((zone) => (
                      <option style={optionStyle} key={zone.id} value={zone.id}>{`${t(language, 'localTier')} ${zone.zoneIndex + 1} (${Math.round(zone.clearHeight)} mm)`}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {activeTierSections.length > 1 ? <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', marginTop: 10 }}>{activeTierSections.map((section, index) => <NumberField key={section.id} label={`${t(language, 'section')} ${index + 1}`} value={sectionWidths[index] ?? 0} onChange={(value) => updateSelectedCabinetSectionWidths(activeTierSections.map((item, itemIndex) => itemIndex === index ? value : (sectionWidths[itemIndex] ?? Math.round(getLeafSectionInnerSpan(moduleState, item).width))))} />)}</div> : null}
              {activeSection ? (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}` }}>
                  <div style={{ fontSize: 12, color: isDarkBlue ? '#d4d4d8' : '#57534e', marginBottom: 8 }}>
                    {localZones.length > 1 ? t(language, 'drawersInActiveLocalTier') : t(language, 'drawersInActiveSection')}
                  </div>
                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
                    <NumberField
                      label={t(language, 'drawerCount')}
                      value={activeDrawerStack?.drawerCount ?? 0}
                      onChange={(value) => updateSelectedSectionDrawerStack(
                        Math.max(0, Math.min(maxDrawerCount, Math.round(value))),
                        (activeDrawerStack?.runnerType ?? 'hidden-unihoper') as DrawerRunnerType,
                        activeDrawerRunnerLengthMode === 'auto' ? activeAutoDrawerRunnerLength : activeDrawerRunnerLength,
                        activeDrawerRunnerLengthMode
                      )}
                    />
                    <label>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'runnerType')}</div>
                      <select
                        value={activeDrawerStack?.runnerType ?? 'hidden-unihoper'}
                        onChange={(e) => updateSelectedSectionDrawerStack(
                          Math.max(1, activeDrawerStack?.drawerCount ?? 1),
                          e.target.value as DrawerRunnerType,
                          activeDrawerRunnerLengthMode === 'auto' ? activeAutoDrawerRunnerLength : activeDrawerRunnerLength,
                          activeDrawerRunnerLengthMode
                        )}
                        style={selectControlStyle}
                      >
                        <option style={optionStyle} value="hidden-unihoper">{t(language, 'hiddenMountUnihoper')}</option>
                      </select>
                    </label>
                    <label style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'runnerLength')}</div>
                      <select
                        value={activeDrawerRunnerLengthMode === 'auto' ? 'auto' : activeDrawerRunnerLength}
                        onChange={(e) => {
                          const nextMode = e.target.value === 'auto' ? 'auto' : 'manual';
                          const nextLength = nextMode === 'auto'
                            ? activeAutoDrawerRunnerLength
                            : Number(e.target.value) as DrawerRunnerLength;
                          updateSelectedSectionDrawerStack(
                            Math.max(1, activeDrawerStack?.drawerCount ?? 1),
                            (activeDrawerStack?.runnerType ?? 'hidden-unihoper') as DrawerRunnerType,
                            nextLength,
                            nextMode
                          );
                        }}
                        style={selectControlStyle}
                      >
                        <option style={optionStyle} value="auto">{`${t(language, 'autoLength')} · ${activeAutoDrawerRunnerLength} mm`}</option>
                        {DRAWER_RUNNER_LENGTHS.map((length) => (
                          <option style={optionStyle} key={length} value={length}>{`${length} mm`}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.35,
                      color: isDarkBlue ? '#d4d4d8' : '#57534e',
                      background: isDarkBlue ? '#1f2937' : '#f5f5f4',
                      border: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}`,
                      borderRadius: 8,
                      padding: '8px 10px',
                      marginTop: 8,
                    }}
                  >
                    {maxDrawerCount > 0
                      ? <>{t(language, 'minDrawerFacadeHeight')}<br />{t(language, 'maxDrawersHere')}: {maxDrawerCount}.</>
                      : t(language, 'zoneTooLowDrawer')}
                  </div>
            <button onClick={addTierDividerToSelectedSection} style={{ marginTop: 10, width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${panelControlBorder}`, background: panelControlBg, color: panelControlText, cursor: 'pointer' }}>
                    {t(language, 'addTierDividerToSection')}
                  </button>
                </div>
              ) : null}
            </div>
            <div style={{ marginTop: 12, display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
            <button onClick={addShelfToSelectedGroup} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${panelControlBorder}`, background: panelControlBg, color: panelControlText, cursor: 'pointer' }}>{t(language, 'addShelfAction')}</button>
            <button onClick={addPartitionToSelectedGroup} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${panelControlBorder}`, background: panelControlBg, color: panelControlText, cursor: 'pointer' }}>{t(language, 'addPartitionAction')}</button>
            <button onClick={toggleBackPanelForSelectedGroup} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${panelControlBorder}`, background: panelControlBg, color: panelControlText, cursor: 'pointer' }}>{t(language, 'toggleBackPanelAction')}</button>
            <button onClick={toggleFrontsForSelectedGroup} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${panelControlBorder}`, background: panelControlBg, color: panelControlText, cursor: 'pointer' }}>{t(language, 'toggleFrontsAction')}</button>
            {tierOptions.length > 1 ? <button onClick={toggleBackPanelForSelectedTier} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${panelControlBorder}`, background: panelControlBg, color: panelControlText, cursor: 'pointer' }}>{t(language, 'toggleTierBackPanel')}</button> : null}
            {tierOptions.length > 1 ? <button onClick={toggleFrontsForSelectedTier} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${panelControlBorder}`, background: panelControlBg, color: panelControlText, cursor: 'pointer' }}>{t(language, 'toggleTierFronts')}</button> : null}
            </div>
          </AccordionCard>
        ) : null}

        <AccordionCard title={t(language, 'quickCabinet')} open={quickCabinetOpen} onToggle={() => setQuickCabinetOpen((value) => !value)} isDarkBlue={isDarkBlue} accent order={quickCabinetPanelOrder}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
              <NumberField label={t(language, 'width')} value={cabinetDraft.width} onChange={(value) => updateCabinetDraft({ width: value })} />
              <NumberField label={t(language, 'height')} value={cabinetDraft.height} onChange={(value) => updateCabinetDraft({ height: value })} />
              <NumberField label={t(language, 'depth')} value={cabinetDraft.depth} onChange={(value) => updateCabinetDraft({ depth: value })} />
              <NumberField label={t(language, 'tiers')} value={cabinetDraft.tierCount} onChange={(value) => updateCabinetDraft({ tierCount: Math.max(1, Math.round(value)) })} />
              <NumberField label={t(language, 'partitions')} value={cabinetDraft.partitionCount} onChange={(value) => updateCabinetDraft({ partitionCount: Math.max(0, Math.round(value)) })} />
              <NumberField label={t(language, 'thickness')} value={cabinetDraft.thickness} onChange={(value) => updateCabinetDraft({ thickness: value })} />
              <NumberField label={t(language, 'snapGrid')} value={snapGrid} onChange={(value) => setSnapGrid(Math.max(1, Math.round(value)))} />
              <NumberField label={`${t(language, 'frontCount')} ${language === 'ru' ? '(на ярус)' : '(per tier)'}`} value={cabinetDraft.frontCount} onChange={(value) => updateCabinetDraft({ frontCount: Math.max(0, Math.min(4, Math.round(value))), frontType: value > 0 ? 'double' : 'none' })} />
            <label><div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'topMode')}</div><select value={cabinetDraft.topMode} onChange={(e) => updateCabinetDraft({ topMode: e.target.value as 'overlay' | 'inset' })} style={{ width: '100%', padding: 8 }}><option value="overlay">{t(language, 'topOverlay')}</option><option value="inset">{t(language, 'topInset')}</option></select></label>
            <label><div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'openingModeDrawers')}</div><select value={cabinetDraft.frontOpeningMode} onChange={(e) => updateCabinetDraft({ frontOpeningMode: e.target.value as 'handleless' | 'handles' })} style={{ width: '100%', padding: 8 }}><option value="handleless">{t(language, 'handlelessProfile')}</option><option value="handles">{t(language, 'installedHandles')}</option></select></label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={cabinetDraft.withTopRails} onChange={(e) => updateCabinetDraft({ withTopRails: e.target.checked })} />{t(language, 'topDecorRails')}</label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={cabinetDraft.withPlinth} onChange={(e) => updateCabinetDraft({ withPlinth: e.target.checked })} />{t(language, 'plinth')}</label>
            {cabinetDraft.withPlinth ? <NumberField label={t(language, 'plinthHeight')} value={cabinetDraft.plinthHeight} onChange={(value) => updateCabinetDraft({ plinthHeight: value })} /> : null}
            {cabinetDraft.withTopRails ? <NumberField label={t(language, 'topRailHeight')} value={cabinetDraft.topRailHeight} onChange={(value) => updateCabinetDraft({ topRailHeight: value })} /> : null}
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={cabinetDraft.withAprons} onChange={(e) => updateCabinetDraft({ withAprons: e.target.checked })} />{t(language, 'aprons')}</label>
          </div>
          <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={cabinetDraft.withBackPanel} onChange={(e) => updateCabinetDraft({ withBackPanel: e.target.checked })} />{t(language, 'backPanel')}</label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={cabinetDraft.quickAllMinifix} onChange={(e) => updateCabinetDraft({ quickAllMinifix: e.target.checked })} />{t(language, 'quickAllMinifix')}</label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={cabinetDraft.quickAllConfirmat} onChange={(e) => updateCabinetDraft({ quickAllConfirmat: e.target.checked })} />{t(language, 'quickAllConfirmat')}</label>
            <button onClick={addCabinet} style={createCabinetButtonStyle}>{t(language, 'addCabinet')}</button>
          </div>
        </AccordionCard>

        {lastValidationErrors.length > 0 ? <div style={{ padding: 10, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13 }}>{lastValidationErrors.map((err) => <div key={err}>{err}</div>)}</div> : null}

        <Card title={t(language, 'holeDraft')} isDarkBlue={isDarkBlue}>
          <button
            onClick={() => setHoleDraftOpen((value) => !value)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 10px',
              background: '#fff',
              border: '1px solid #e7e5e4',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 12,
              color: '#57534e',
            }}
          >
            <span>{t(language, 'holeDraft')}</span>
            <span style={{ fontSize: 16, color: '#78716c' }}>{holeDraftOpen ? 'в€’' : '+'}</span>
          </button>
          {holeDraftOpen ? (
            <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
              <NumberField label={t(language, 'diameter')} value={holeDraft.diameter} onChange={(value) => updateHoleDraft({ diameter: value })} />
              <NumberField label={t(language, 'depth')} value={holeDraft.depth} onChange={(value) => updateHoleDraft({ depth: value })} />
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={holeDraft.through} onChange={(e) => updateHoleDraft({ through: e.target.checked })} />{t(language, 'throughHole')}</label>
            </div>
          ) : null}
        </Card>

        <Card title={t(language, 'view')} isDarkBlue={isDarkBlue}>
          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={isDarkBlue} onChange={(e) => setThemeMode(e.target.checked ? 'dark-blue' : 'light')} />
              {t(language, 'darkGrayTheme')}
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={experimentalMoveMode} onChange={(e) => setExperimentalMoveMode(e.target.checked)} />{t(language, 'experimentalMoveMode')}</label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={showDrilling} onChange={(e) => setShowDrilling(e.target.checked)} />{t(language, 'showDrilling')}</label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={xrayMode} onChange={(e) => setXrayMode(e.target.checked)} />{t(language, 'xrayMode')}</label>
          </div>
        </Card>

      </div>
    </div>
  );
}
