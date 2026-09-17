import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, useProject } from './app/store';
import { SceneRoot } from './editor/scene-root';
import { Toolbar } from './ui/toolbar';
import { Inspector, type InspectorAnchorId, type InspectorAnchorRequest } from './ui/inspector';
import { SketchWindow } from './ui/sketch-window';
import { t } from './i18n';
import { buildCuttingList, buildSheetPlan, DEFAULT_SHEET, type SheetPlanOptions } from './domain/cutting-list';
import { saveNcExport, saveProductionCsvExport, savePeredelkaZip, savePresadkaZip } from './infra/export-nc';
import { getCabinetModuleState } from './domain/cabinet-builder';
import { ErrorBoundary } from './ui/error-boundary';

// Inspector panels that exist only while a cabinet (or one of its parts) is selected.
const CABINET_ANCHORS = new Set<InspectorAnchorId>(['cabinet', 'cabinet-body', 'tiers', 'partitions-shelves', 'drawers']);

export default function App() {
  const removeSelectedCabinetElement = useAppStore((s) => s.removeSelectedCabinetElement);
  const language = useAppStore((s) => s.language);
  const themeMode = useAppStore((s) => s.themeMode);
  const isDarkBlue = themeMode === 'dark-blue';
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1440));
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [desktopAnchorRequest, setDesktopAnchorRequest] = useState<InspectorAnchorRequest | null>(null);
  const [activeDesktopAnchor, setActiveDesktopAnchor] = useState<InspectorAnchorId>('quick-cabinet');
  const [desktopInspectorScale, setDesktopInspectorScale] = useState(0.9);
  const selected = useAppStore((s) => s.selected);
  const project = useProject();
  const updateCabinetDraft = useAppStore((s) => s.updateCabinetDraft);
  const addCabinet = useAppStore((s) => s.addCabinet);
  const isMobile = viewportWidth <= 1024;
  const [visitedSteps, setVisitedSteps] = useState<Set<string>>(() => new Set(['quick-cabinet']));
  const [sheetOptions, setSheetOptions] = useState<SheetPlanOptions>(DEFAULT_SHEET);
  const mobileUiScale = 0.8;
  const [desktopPanelWidth, setDesktopPanelWidth] = useState(328);
  const [desktopLeftPanelWidth, setDesktopLeftPanelWidth] = useState(220);
  const [extraToolsOpen, setExtraToolsOpen] = useState(true);
  // Cutting plan and exports used to appear only on the removed "Summary" step; now a section of its own.
  const [cuttingPlanOpen, setCuttingPlanOpen] = useState(false);
  const resizeDragRef = useRef<{ side: 'left' | 'right'; startX: number; startWidth: number } | null>(null);
  const prevSelectedTypeRef = useRef<string | null>(null);
  const selectGroup = useAppStore((s) => s.selectGroup);
  const lastGroupIdRef = useRef<string | null>(null);
  const skipAutoJumpRef = useRef(false);
  // Stable callback: Inspector re-subscribes its scroll listener when this prop changes.
  const handleActiveAnchorChange = useCallback(
    (id: InspectorAnchorId) => setActiveDesktopAnchor(id === 'drawers' ? 'partitions-shelves' : id),
    []
  );
  const selectedGroupId = selected?.type === 'group'
    ? selected.groupId
    : selected?.type === 'part' || selected?.type === 'face'
      ? project.parts.find((part) => part.id === selected.partId)?.meta?.groupId ?? null
      : null;

  useEffect(() => {
    if (selectedGroupId) lastGroupIdRef.current = selectedGroupId;
  }, [selectedGroupId]);

  const hasCabinet = project.parts.some((part) => Boolean(part.meta?.groupId));
  // Only while the panel is open, and only when its inputs change: App re-renders on every edit.
  const cuttingPlan = useMemo(() => {
    if (!cuttingPlanOpen) return null;
    const rows = buildCuttingList(project.parts, language);
    return { rows, plan: buildSheetPlan(rows, sheetOptions) };
  }, [cuttingPlanOpen, language, project.parts, sheetOptions]);

  // Left navigation: flat rows (no card per item), highlighted like the inspector tree.
  const navText = isDarkBlue ? '#e5e7eb' : '#1c1917';
  const navMuted = isDarkBlue ? '#a1a1aa' : '#78716c';
  const navBorder = isDarkBlue ? '#3f3f46' : '#e7e5e4';
  const navActiveBg = isDarkBlue ? '#3f2c16' : '#fff7ed';
  const navActiveText = isDarkBlue ? '#fde68a' : '#9a3412';
  const navHoverBg = isDarkBlue ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  const navHeadingStyle: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: navMuted, marginBottom: 4 };

  // Cabinet steps need a selected cabinet; after the selection was cleared, bring back the last one (or the first).
  const requestDesktopAnchor = (id: InspectorAnchorId) => {
    if (CABINET_ANCHORS.has(id) && !selectedGroupId) {
      const remembered = lastGroupIdRef.current;
      const groupId = remembered && project.parts.some((part) => part.meta?.groupId === remembered)
        ? remembered
        : project.parts.find((part) => part.meta?.groupId)?.meta?.groupId ?? null;
      if (groupId) {
        skipAutoJumpRef.current = true;
        selectGroup(groupId);
      }
    }
    setDesktopAnchorRequest({ id, token: Date.now() });
  };

  const mobileInspectorTitle = useMemo(
    () => (language === 'ru' ? 'Создать шкаф' : 'Create cabinet'),
    [language]
  );

  const steps: { id: InspectorAnchorId; label: string; hint: string }[] = useMemo(
    () => [
      {
        id: 'quick-cabinet',
        label: language === 'ru' ? '1. Размеры' : '1. Dimensions',
        hint: language === 'ru' ? 'Задайте габариты и создайте шкаф' : 'Set dimensions and create cabinet',
      },
      {
        id: 'cabinet-body',
        label: language === 'ru' ? '2. Корпус' : '2. Body',
        hint: language === 'ru' ? 'Задняя стенка, плинтус, рейки' : 'Back panel, plinth, rails',
      },
      {
        id: 'tiers',
        label: language === 'ru' ? '3. Ярусы и секции' : '3. Tiers & sections',
        hint: language === 'ru' ? 'Горизонтальные разделители и выбор секции' : 'Horizontal dividers and section choice',
      },
      {
        // Covers the partitions/shelves, drawers and fronts panels; 'drawers' is mapped onto it (see handleActiveAnchorChange).
        id: 'partitions-shelves',
        label: language === 'ru' ? '4. Перегородки и полки, ящики, фасады' : '4. Partitions & shelves, drawers, fronts',
        hint: language === 'ru' ? 'Наполнение секций и фасады' : 'Section fill-in and fronts',
      },
    ],
    [language]
  );

  const extraTools: { id: InspectorAnchorId; label: string }[] = useMemo(
    () => [
      { id: 'selection', label: t(language, 'inspectorSelection') },
      { id: 'move', label: language === 'ru' ? 'Перемещение' : 'Move' },
    ],
    [language]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Leave native text undo and deletion to form fields.
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;

      // event.code is layout-independent, so the shortcuts also work with the Russian layout.
      if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.code === 'KeyZ' || event.code === 'KeyY')) {
        event.preventDefault();
        const { undo, redo } = useAppStore.getState();
        if (event.code === 'KeyY' || event.shiftKey) redo();
        else undo();
        return;
      }

      // F: focus the camera on the selection (listed in the shortcuts dialog).
      if (event.code === 'KeyF' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        useAppStore.getState().focusSelection();
        return;
      }

      if (event.key !== 'Delete') return;
      event.preventDefault();
      const { selected: selection, language: lang, removeGroup } = useAppStore.getState();
      if (selection?.type === 'group') {
        if (window.confirm(t(lang, 'confirmDeleteGroup'))) removeGroup(selection.groupId);
        return;
      }
      removeSelectedCabinetElement();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [removeSelectedCabinetElement]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isMobile) setMobileInspectorOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (isMobile) return;
    const onMouseMove = (e: MouseEvent) => {
      if (!resizeDragRef.current) return;
      const delta = e.clientX - resizeDragRef.current.startX;
      if (resizeDragRef.current.side === 'left') {
        setDesktopLeftPanelWidth(Math.max(160, Math.min(320, resizeDragRef.current.startWidth + delta)));
      } else {
        setDesktopPanelWidth(Math.max(240, Math.min(520, resizeDragRef.current.startWidth - delta)));
      }
    };
    const onMouseUp = () => { resizeDragRef.current = null; };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [isMobile]);

  useEffect(() => {
    const prevType = prevSelectedTypeRef.current;
    const currentType = selected?.type ?? null;
    prevSelectedTypeRef.current = currentType;
    // Selection made by requestDesktopAnchor must not be overridden by the jump to the body step.
    const skipAutoJump = skipAutoJumpRef.current;
    skipAutoJumpRef.current = false;
    if (!skipAutoJump && prevType !== 'group' && currentType === 'group' && activeDesktopAnchor === 'quick-cabinet') {
      setTimeout(() => {
        setDesktopAnchorRequest({ id: 'cabinet-body', token: Date.now() });
      }, 350);
    }
  }, [selected, activeDesktopAnchor]);

  return (
    <div
      style={{
        height: '100dvh',
        display: 'grid',
        gridTemplateRows: isMobile ? 'auto 1fr' : '56px 1fr',
        background: isDarkBlue ? '#18181b' : '#fafaf9',
        color: isDarkBlue ? '#e5e7eb' : '#111827',
      }}
    >
      <Toolbar
        uiScale={isMobile ? mobileUiScale : 1}
        inspectorScale={desktopInspectorScale}
        onInspectorScaleChange={setDesktopInspectorScale}
        inspectorScaleEnabled={!isMobile}
      />
      {isMobile ? (
        <div style={{ position: 'relative', minHeight: 0, minWidth: 0 }}>
          <div style={{ minWidth: 0, minHeight: 0, height: '100%' }}><ErrorBoundary label="3D-сцена"><SceneRoot /></ErrorBoundary></div>
          <SketchWindow />

          <button
            onClick={() => setMobileInspectorOpen((value) => !value)}
            style={{
              position: 'absolute',
              right: 12,
              bottom: mobileInspectorOpen ? '66dvh' : 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
              zIndex: 40,
              border: '1px solid #f59e0b',
              background: isDarkBlue ? 'rgba(245,158,11,0.95)' : 'rgba(251,146,60,0.95)',
              color: '#111',
              fontWeight: 700,
              borderRadius: 10,
              padding: '10px 12px',
              cursor: 'pointer',
              backdropFilter: 'blur(6px)',
              transition: 'bottom 180ms ease',
            }}
          >
            {mobileInspectorTitle}
          </button>

          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 'env(safe-area-inset-bottom, 0px)',
              height: '68%',
              transform: mobileInspectorOpen ? 'translateY(0)' : 'translateY(calc(100% - 42px))',
              transition: 'transform 220ms ease',
              zIndex: 35,
              borderTopLeftRadius: 14,
              borderTopRightRadius: 14,
              border: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}`,
              background: isDarkBlue ? 'rgba(24,24,27,0.88)' : 'rgba(250,250,249,0.84)',
              backdropFilter: 'blur(10px)',
              overflow: 'hidden',
              boxShadow: '0 -10px 26px rgba(0,0,0,0.28)',
            }}
          >
            <div
              style={{
                height: 42,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderBottom: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}`,
                cursor: 'pointer',
              }}
              onClick={() => setMobileInspectorOpen((value) => !value)}
            >
              <div style={{ width: 56, height: 5, borderRadius: 999, background: isDarkBlue ? '#71717a' : '#a8a29e' }} />
            </div>
            <div style={{ height: 'calc(100% - 42px)', overflow: 'auto' }}>
              <ErrorBoundary label="инспектор"><Inspector uiScale={mobileUiScale} /></ErrorBoundary>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: `${desktopLeftPanelWidth}px 4px 1fr 4px ${desktopPanelWidth}px`, minHeight: 0 }}>
          {/* Left nav panel — stepper */}
          <div
            style={{
              background: isDarkBlue ? '#18181b' : '#fafaf9',
              color: isDarkBlue ? '#e5e7eb' : '#111827',
              padding: 10,
              overflow: 'auto',
              boxSizing: 'border-box',
              scrollbarGutter: 'stable',
            }}
          >
            <style>{`.nav-row:not(:disabled):hover { background-color: ${navHoverBg}; }`}</style>

            {/* The cabinet the steps below work on: the selected one, otherwise the last used / first one. */}
            {(() => {
              const cabinetIds = [...new Set(project.parts.map((part) => part.meta?.groupId).filter((id): id is string => Boolean(id)))];
              const remembered = lastGroupIdRef.current && cabinetIds.includes(lastGroupIdRef.current) ? lastGroupIdRef.current : null;
              const contextGroupId = selectedGroupId ?? remembered ?? cabinetIds[0] ?? null;
              const contextModule = contextGroupId ? getCabinetModuleState(project.parts, contextGroupId) : null;
              const isRu = language === 'ru';
              return (
                <button
                  className="nav-row"
                  onClick={() => { if (contextGroupId) selectGroup(contextGroupId); }}
                  disabled={!contextModule}
                  title={contextModule ? (isRu ? 'Выбрать шкаф' : 'Select cabinet') : undefined}
                  style={{
                    width: '100%',
                    display: 'block',
                    marginBottom: 10,
                    padding: '8px 10px',
                    borderRadius: 8,
                    textAlign: 'left',
                    border: `1px solid ${selectedGroupId ? '#f59e0b' : navBorder}`,
                    background: isDarkBlue ? '#202124' : '#fff',
                    color: navText,
                    cursor: contextModule ? 'pointer' : 'default',
                  }}
                >
                  <span style={navHeadingStyle}>{selectedGroupId ? (isRu ? 'Выбран шкаф' : 'Selected cabinet') : (isRu ? 'Шкаф' : 'Cabinet')}</span>
                  {contextModule ? (
                    <>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contextModule.name}</span>
                      <span style={{ display: 'block', fontSize: 10, color: navMuted, fontVariantNumeric: 'tabular-nums' }}>
                        {`${Math.round(contextModule.width)}×${Math.round(contextModule.height)}×${Math.round(contextModule.depth)} ${isRu ? 'мм' : 'mm'}`}
                        {cabinetIds.length > 1 ? ` · ${isRu ? 'шкафов' : 'cabinets'}: ${cabinetIds.length}` : ''}
                      </span>
                    </>
                  ) : (
                    <span style={{ display: 'block', fontSize: 11, color: navMuted, lineHeight: 1.4 }}>
                      {isRu ? 'Пока нет — задайте размеры или выберите шаблон' : 'None yet — set dimensions or pick a template'}
                    </span>
                  )}
                </button>
              );
            })()}

            <div style={{ display: 'grid', gap: 5 }}>
              {/* Vertical stepper: number, label, hint for the active step; cabinet steps are disabled until a cabinet exists. */}
              <div style={{ display: 'grid', gap: 2 }}>
                {steps.map((step, index) => {
                  const isActive = step.id === activeDesktopAnchor;
                  const unavailable = step.id !== 'quick-cabinet' && !hasCabinet;
                  const isLast = index === steps.length - 1;
                  return (
                    <div key={step.id} style={{ position: 'relative' }}>
                      <button
                        className="nav-row"
                        onClick={() => requestDesktopAnchor(step.id)}
                        disabled={unavailable}
                        aria-current={isActive ? 'step' : undefined}
                        title={unavailable ? (language === 'ru' ? 'Сначала создайте шкаф' : 'Create a cabinet first') : step.hint}
                        style={{
                          width: '100%',
                          display: 'grid',
                          gridTemplateColumns: '22px 1fr',
                          gap: 8,
                          alignItems: 'start',
                          padding: '6px 8px 6px 9px',
                          borderRadius: 8,
                          border: 'none',
                          textAlign: 'left',
                          background: isActive ? navActiveBg : 'transparent',
                          boxShadow: isActive ? 'inset 3px 0 0 #f59e0b' : undefined,
                          color: isActive ? navActiveText : navText,
                          cursor: unavailable ? 'default' : 'pointer',
                          opacity: unavailable ? 0.45 : 1,
                        }}
                      >
                        <span
                          style={{
                            width: 22,
                            height: 22,
                            boxSizing: 'border-box',
                            borderRadius: '50%',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 11,
                            fontWeight: 700,
                            border: `1px solid ${isActive ? '#f59e0b' : navBorder}`,
                            background: isActive ? '#f59e0b' : (isDarkBlue ? '#18181b' : '#fafaf9'),
                            color: isActive ? '#111' : navMuted,
                          }}
                        >
                          {index + 1}
                        </span>
                        <span style={{ minWidth: 0, paddingTop: 2 }}>
                          <span style={{ display: 'block', fontSize: 12, fontWeight: isActive ? 600 : 500, lineHeight: 1.35 }}>{step.label.replace(/^\d+\.\s/, '')}</span>
                          {isActive ? <span style={{ display: 'block', fontSize: 10, marginTop: 2, color: navMuted, lineHeight: 1.35 }}>{step.hint}</span> : null}
                        </span>
                      </button>
                      {/* Connector between step circles */}
                      {!isLast ? <span aria-hidden="true" style={{ position: 'absolute', left: 20, top: 29, bottom: -7, width: 1, background: navBorder, pointerEvents: 'none' }} /> : null}
                    </div>
                  );
                })}
              </div>

              {!hasCabinet ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ ...navHeadingStyle, padding: '0 8px' }}>{language === 'ru' ? 'Быстрый старт' : 'Quick start'}</div>
                  <div style={{ display: 'grid', gap: 2 }}>
                    {[
                      { label: language === 'ru' ? 'Тумба' : 'Base cabinet', w: 800, h: 720, d: 560 },
                      { label: language === 'ru' ? 'Пенал' : 'Tall unit', w: 400, h: 2100, d: 560 },
                      { label: language === 'ru' ? 'Верхний шкаф' : 'Wall cabinet', w: 600, h: 720, d: 320 },
                      { label: language === 'ru' ? 'Шкаф' : 'Wardrobe', w: 1200, h: 2200, d: 600 },
                    ].map(({ label, w, h, d }) => (
                      <button
                        key={label}
                        className="nav-row"
                        onClick={() => {
                          // The draft update is synchronous, so the cabinet can be added right away.
                          updateCabinetDraft({ width: w, height: h, depth: d });
                          addCabinet();
                        }}
                        title={language === 'ru' ? `Добавить: ${label} ${w}×${h}×${d} мм` : `Add: ${label} ${w}×${h}×${d} mm`}
                        style={{ width: '100%', display: 'flex', alignItems: 'baseline', gap: 6, padding: '6px 8px', borderRadius: 7, border: 'none', background: 'transparent', color: navText, cursor: 'pointer', fontSize: 12, textAlign: 'left' }}
                      >
                        <span aria-hidden="true" style={{ color: '#f59e0b', fontWeight: 700 }}>+</span>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                        <span style={{ fontSize: 10, color: navMuted, fontVariantNumeric: 'tabular-nums' }}>{w}×{h}×{d}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Next step button */}
              {(() => {
                const currentIndex = steps.findIndex((s) => s.id === activeDesktopAnchor);
                const next = currentIndex >= 0 && currentIndex < steps.length - 1 ? steps[currentIndex + 1] : null;
                if (!next || !hasCabinet) return null;
                return (
                  <button
                    onClick={() => requestDesktopAnchor(next.id)}
                    style={{
                      marginTop: 6, width: '100%', padding: '7px 10px', borderRadius: 8,
                      border: '1px solid #f59e0b',
                      background: isDarkBlue ? '#f59e0b' : '#fb923c',
                      color: '#111', fontWeight: 600, cursor: 'pointer', fontSize: 11,
                    }}
                  >
                    {language === 'ru' ? `Далее: ${next.label.replace(/^\d+\.\s/, '')} →` : `Next: ${next.label.replace(/^\d+\.\s/, '')} →`}
                  </button>
                );
              })()}

              {/* Производственный раскрой и экспорт */}
              {project.parts.length > 0 ? (
                <div style={{ marginTop: 6, paddingTop: 8, borderTop: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}` }}>
                  <button
                    className="insp-toggle"
                    onClick={() => setCuttingPlanOpen((v) => !v)}
                    aria-expanded={cuttingPlanOpen}
                    style={{
                      width: '100%', textAlign: 'left', padding: '5px 6px',
                      borderRadius: 6, border: 'none', background: 'transparent',
                      color: isDarkBlue ? '#71717a' : '#a8a29e', cursor: 'pointer',
                      fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <span>{language === 'ru' ? 'Раскрой и экспорт' : 'Cutting & export'}</span>
                    <span style={{ fontSize: 8, display: 'inline-block', transform: cuttingPlanOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 150ms' }}>▼</span>
                  </button>
                </div>
              ) : null}
              {cuttingPlan && (() => {
                const { rows, plan } = cuttingPlan;
                if (rows.length === 0) return null;
                const totalSheets = plan.reduce((sum, group) => sum + group.sheetsNeeded, 0);
                const ru = language === 'ru';
                const mutedColor = isDarkBlue ? '#a1a1aa' : '#78716c';
                const borderColor = isDarkBlue ? '#3f3f46' : '#e7e5e4';
                const formatArea = (mm2: number) => (mm2 / 1_000_000).toLocaleString(ru ? 'ru-RU' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const sheetInputStyle: React.CSSProperties = {
                  width: '100%', minWidth: 0, padding: '4px 6px', borderRadius: 5, boxSizing: 'border-box', fontSize: 11,
                  border: `1px solid ${isDarkBlue ? '#3f3f46' : '#d6d3d1'}`, background: isDarkBlue ? '#27272a' : '#fff', color: isDarkBlue ? '#e5e7eb' : '#111',
                };
                const exportButtonStyle: React.CSSProperties = {
                  width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 7, textAlign: 'left', fontSize: 11, cursor: 'pointer',
                  border: `1px solid ${borderColor}`, background: isDarkBlue ? '#27272a' : '#fff', color: isDarkBlue ? '#e5e7eb' : '#111',
                };
                const formatTagStyle: React.CSSProperties = {
                  marginLeft: 'auto', padding: '1px 5px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                  background: isDarkBlue ? '#3f3f46' : '#f5f5f4', color: mutedColor,
                };
                const sheetsLabel = ru ? 'л.' : 'sh.';
                const partsLabel = ru ? 'дет.' : 'pcs';
                return (
                  <div style={{ marginTop: 4, display: 'grid', gap: 10 }}>
                    <div style={{ display: 'grid', gap: 3 }}>
                      <span style={{ fontSize: 10, color: mutedColor }}>{ru ? 'Размер листа, мм' : 'Sheet size, mm'}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {(['sheetWidth', 'sheetHeight'] as const).map((key, index) => (
                          <span key={key} style={{ display: 'contents' }}>
                            {index > 0 ? <span aria-hidden="true" style={{ color: mutedColor, fontSize: 11 }}>×</span> : null}
                            <input
                              type="number"
                              aria-label={key === 'sheetWidth' ? (ru ? 'Длина листа' : 'Sheet length') : (ru ? 'Ширина листа' : 'Sheet width')}
                              value={sheetOptions[key]}
                              min={500}
                              max={4000}
                              step={10}
                              onChange={(e) => setSheetOptions((prev) => ({ ...prev, [key]: Number(e.target.value) || prev[key] }))}
                              style={sheetInputStyle}
                            />
                          </span>
                        ))}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gap: 4 }}>
                      {plan.map((group) => (
                        <div key={group.thickness} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }}>{ru ? `ЛДСП ${group.thickness} мм` : `Board ${group.thickness} mm`}</div>
                            <div style={{ fontSize: 10, color: mutedColor }}>
                              {`${group.rows.length} ${partsLabel} · ${formatArea(group.totalAreaMm2)} ${ru ? 'м²' : 'm²'} · ${ru ? 'исп.' : 'yield'} ${group.efficiency}%`}
                            </div>
                          </div>
                          <span title={ru ? 'Листов' : 'Sheets'} style={{ flex: '0 0 auto', padding: '2px 7px', borderRadius: 999, background: '#f59e0b', color: '#111', fontWeight: 700, fontSize: 11 }}>
                            {group.sheetsNeeded} {sheetsLabel}
                          </span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, paddingTop: 6, borderTop: `1px solid ${borderColor}`, fontSize: 11, fontWeight: 700 }}>
                        <span>{ru ? 'Итого' : 'Total'}: {rows.length} {partsLabel}</span>
                        <span style={{ color: '#f59e0b' }}>{totalSheets} {sheetsLabel}</span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: 4 }}>
                      <button onClick={() => saveProductionCsvExport(project.parts, language)} title={ru ? 'Раскройный лист для Excel' : 'Cutting list for Excel'} style={exportButtonStyle}>
                        <span aria-hidden="true">⬇</span>
                        <span>{ru ? 'Раскрой' : 'Cutting list'}</span>
                        <span style={formatTagStyle}>CSV</span>
                      </button>
                      <button onClick={() => saveNcExport(project.parts)} title={ru ? 'Программа раскроя для Woodmaster' : 'Cutting program for Woodmaster'} style={exportButtonStyle}>
                        <span aria-hidden="true">⬇</span>
                        <span>{ru ? 'Раскрой для станка' : 'CNC cutting'}</span>
                        <span style={formatTagStyle}>NC</span>
                      </button>
                      <button onClick={() => savePresadkaZip(project.parts, project.name)} title={ru ? 'Программы присадки для Woodmaster' : 'Boring programs for Woodmaster'} style={exportButtonStyle}>
                        <span aria-hidden="true">⬇</span>
                        <span>{ru ? 'Присадка' : 'Boring'}</span>
                        <span style={formatTagStyle}>ZIP</span>
                      </button>
                      <button onClick={() => savePeredelkaZip(project.parts)} title={ru ? 'Пластевая обработка и контур для обрабатывающего центра' : 'Face machining and contour for the CNC router'} style={exportButtonStyle}>
                        <span aria-hidden="true">⬇</span>
                        <span>{ru ? 'Переделка' : 'Face machining'}</span>
                        <span style={formatTagStyle}>ZIP</span>
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Extra tools */}
              <div style={{ marginTop: 6, paddingTop: 8, borderTop: `1px solid ${navBorder}` }}>
                <button
                  className="insp-toggle"
                  onClick={() => setExtraToolsOpen((v) => !v)}
                  aria-expanded={extraToolsOpen}
                  style={{
                    width: '100%', textAlign: 'left', padding: '5px 6px',
                    borderRadius: 6, border: 'none', background: 'transparent',
                    color: isDarkBlue ? '#71717a' : '#a8a29e', cursor: 'pointer',
                    fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <span>{language === 'ru' ? 'Инструменты' : 'Tools'}</span>
                  <span style={{ fontSize: 8, display: 'inline-block', transform: extraToolsOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 150ms' }}>▼</span>
                </button>
                {extraToolsOpen && (
                  <div style={{ display: 'grid', gap: 2, marginTop: 4 }}>
                    {extraTools.map((tool) => {
                      const isActive = tool.id === activeDesktopAnchor;
                      return (
                        <button
                          key={tool.id}
                          className="nav-row"
                          onClick={() => setDesktopAnchorRequest({ id: tool.id, token: Date.now() })}
                          aria-current={isActive ? 'true' : undefined}
                          style={{
                            width: '100%', textAlign: 'left', padding: '6px 8px',
                            borderRadius: 7, fontSize: 12, border: 'none',
                            background: isActive ? navActiveBg : 'transparent',
                            boxShadow: isActive ? 'inset 3px 0 0 #f59e0b' : undefined,
                            color: isActive ? navActiveText : navText,
                            cursor: 'pointer',
                          }}
                        >
                          {tool.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Left resize divider */}
          <div
            style={{ cursor: 'col-resize', background: isDarkBlue ? '#3f3f46' : '#e7e5e4', transition: 'background 120ms', zIndex: 1 }}
            onMouseDown={(e) => { resizeDragRef.current = { side: 'left', startX: e.clientX, startWidth: desktopLeftPanelWidth }; e.preventDefault(); }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#f59e0b'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isDarkBlue ? '#3f3f46' : '#e7e5e4'; }}
          />

          <div style={{ minWidth: 0, minHeight: 0 }}><ErrorBoundary label="3D-сцена"><SceneRoot /></ErrorBoundary></div>

          {/* Right resize divider */}
          <div
            style={{ cursor: 'col-resize', background: isDarkBlue ? '#3f3f46' : '#e7e5e4', transition: 'background 120ms', zIndex: 1 }}
            onMouseDown={(e) => { resizeDragRef.current = { side: 'right', startX: e.clientX, startWidth: desktopPanelWidth }; e.preventDefault(); }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#f59e0b'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isDarkBlue ? '#3f3f46' : '#e7e5e4'; }}
          />

          <ErrorBoundary label="инспектор">
            <Inspector
              uiScale={desktopInspectorScale}
              anchorRequest={desktopAnchorRequest}
              onAnchorHandled={() => setDesktopAnchorRequest(null)}
              onActiveAnchorChange={handleActiveAnchorChange}
            />
          </ErrorBoundary>

          {/* Sketch window lives above the whole work area so it can overlap the left panel */}
          <SketchWindow defaultLeft={desktopLeftPanelWidth + 14} />
        </div>
      )}
    </div>
  );
}
