import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, useProject } from '../app/store';
import { buildCuttingList, cuttingListToCsv } from '../domain/cutting-list';
import { saveNcExport } from '../infra/export-nc';
import { saveSelectedPartMap } from '../infra/export-part-map';
import { saveProjectToFile, listSaveSlots, type SlotMeta } from '../infra/save-load';
import { t } from '../i18n';
import { IconTrash } from './project-tree';
import { FRONT_CHOICES } from './inspector';

function IconPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <line x1="7.5" y1="2" x2="7.5" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="2" y1="7.5" x2="13" y2="7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}
function IconCursor() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M2.5 2L2.5 11.5L5.5 8.5L7.8 13L9.4 12.4L7 7.5L11 7.5L2.5 2Z" fill="currentColor"/>
    </svg>
  );
}
function IconRuler() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <rect x="1" y="5" width="13" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <line x1="3.5" y1="6.5" x2="3.5" y2="7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="5.5" y1="6.5" x2="5.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="7.5" y1="6.5" x2="7.5" y2="7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="9.5" y1="6.5" x2="9.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="11.5" y1="6.5" x2="11.5" y2="7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}
function IconDrill() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="7.5" cy="7.5" r="2" fill="currentColor"/>
    </svg>
  );
}
function IconFront() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <rect x="2.5" y="1.5" width="10" height="12" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="10" cy="7.5" r="0.9" fill="currentColor"/>
    </svg>
  );
}
function IconSun() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <circle cx="7.5" cy="7.5" r="2.8" stroke="currentColor" strokeWidth="1.4"/>
      <line x1="7.5" y1="1" x2="7.5" y2="2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="7.5" y1="12.5" x2="7.5" y2="14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="1" y1="7.5" x2="2.5" y2="7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="12.5" y1="7.5" x2="14" y2="7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="3.1" y1="3.1" x2="4.2" y2="4.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="10.8" y1="10.8" x2="11.9" y2="11.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="11.9" y1="3.1" x2="10.8" y2="4.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="4.2" y1="10.8" x2="3.1" y2="11.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}
function IconMoon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M12.5 9.5A5.5 5.5 0 0 1 5.5 2.5a5.5 5.5 0 1 0 7 7z" fill="currentColor"/>
    </svg>
  );
}

function IconSave() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 2.5h8l2.5 2.5v8a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M5 2.5v3h5v-3M5 13.5V9.5h6v4" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
function IconFolder() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 4.5a1 1 0 0 1 1-1h3.2l1.4 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
function IconFilePlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M9.5 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5L9.5 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8 7v5M5.5 9.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function IconUndo() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 4L3 7l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 7H10a3 3 0 0 1 0 6H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function IconRedo() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 7H6a3 3 0 0 0 0 6h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function IconChevronDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSketch() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <rect x="1.5" y="2" width="12" height="11" rx="1.2" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M3.5 11L6.2 7.6L8.1 9.6L9.6 8L11.5 11Z" fill="currentColor"/>
      <circle cx="10.2" cy="5" r="1.1" fill="currentColor"/>
    </svg>
  );
}

export function Toolbar({
  uiScale = 1,
  inspectorScale = 1,
  onInspectorScaleChange,
  inspectorScaleEnabled = false,
}: {
  uiScale?: number;
  inspectorScale?: number;
  onInspectorScaleChange?: (value: number) => void;
  inspectorScaleEnabled?: boolean;
}) {
  const project = useProject();
  const selected = useAppStore((s) => s.selected);
  const activeTool = useAppStore((s) => s.activeTool);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const addDemoPart = useAppStore((s) => s.addDemoPart);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const canUndo = useAppStore((s) => s.history.past.length > 0);
  const canRedo = useAppStore((s) => s.history.future.length > 0);
  const newProject = useAppStore((s) => s.newProject);
  const saveProgress = useAppStore((s) => s.saveProgress);
  const loadProgress = useAppStore((s) => s.loadProgress);
  const openProjectFile = useAppStore((s) => s.openProjectFile);
  const hasSavedProgress = useAppStore((s) => s.hasSavedProgress);
  const saveProgressMessage = useAppStore((s) => s.saveProgressMessage);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const themeMode = useAppStore((s) => s.themeMode);
  const setThemeMode = useAppStore((s) => s.setThemeMode);
  const measuredFaces = useAppStore((s) => s.measuredFaces);
  const holeDraft = useAppStore((s) => s.holeDraft);
  const updateHoleDraft = useAppStore((s) => s.updateHoleDraft);
  const selectedOpening = useAppStore((s) => s.selectedOpening);
  const setFrontOnSelectedOpening = useAppStore((s) => s.setFrontOnSelectedOpening);
  const updateProjectName = useAppStore((s) => s.updateProjectName);
  const saveToSlot = useAppStore((s) => s.saveToSlot);
  const loadSlot = useAppStore((s) => s.loadSlot);
  const deleteSlot = useAppStore((s) => s.deleteSlot);
  const sketchPanelOpen = useAppStore((s) => s.sketchPanelOpen);
  const setSketchPanelOpen = useAppStore((s) => s.setSketchPanelOpen);
  const experimentalMoveMode = useAppStore((s) => s.experimentalMoveMode);
  const setExperimentalMoveMode = useAppStore((s) => s.setExperimentalMoveMode);
  const sketchCount = project.sketches?.length ?? 0;
  const isDarkBlue = themeMode === 'dark-blue';
  const holeInputStyle: React.CSSProperties = {
    width: 56,
    height: 26,
    padding: '0 6px',
    boxSizing: 'border-box',
    borderRadius: 6,
    border: `1px solid ${isDarkBlue ? '#3f3f46' : '#d6d3d1'}`,
    background: isDarkBlue ? '#18181b' : '#fff',
    color: isDarkBlue ? '#e5e7eb' : '#111',
    fontSize: 12,
  };

  // Esc leaves the hole / front tool.
  useEffect(() => {
    if (activeTool !== 'place-hole' && activeTool !== 'place-front') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveTool('select');
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activeTool, setActiveTool]);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [cuttingListMessage, setCuttingListMessage] = useState<string | null>(null);
  const [showCuttingTable, setShowCuttingTable] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const projectMenuButtonRef = useRef<HTMLButtonElement>(null);

  // Close the project menu on an outside click or Esc.
  useEffect(() => {
    if (!projectMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (projectMenuRef.current?.contains(target) || projectMenuButtonRef.current?.contains(target)) return;
      setProjectMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProjectMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [projectMenuOpen]);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Close the shortcuts dialog on Esc.
  useEffect(() => {
    if (!showShortcuts) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowShortcuts(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showShortcuts]);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [slots, setSlots] = useState<Array<{ slot: number; meta: SlotMeta | null }>>([]);
  const refreshSlots = () => { void listSaveSlots().then(setSlots); };
  useEffect(() => { refreshSlots(); }, []);

  const selectedPart = selected?.type === 'part' || selected?.type === 'face'
    ? project.parts.find((part) => part.id === selected.partId) ?? null
    : null;

  const cuttingListRows = useMemo(() => buildCuttingList(project.parts, language), [project.parts, language]);

  const btn = (active: boolean): React.CSSProperties => ({
    padding: '8px 12px',
    borderRadius: 8,
    border: `1px solid ${isDarkBlue ? '#3f3f46' : '#d6d3d1'}`,
    background: active ? '#f59e0b' : (isDarkBlue ? '#27272a' : '#fff'),
    color: active ? '#111' : (isDarkBlue ? '#e5e7eb' : '#222'),
    cursor: 'pointer',
  });

  const handleCreateNewProject = () => {
    setShowNewProjectDialog(false);
    newProject();
  };

  const panelControlBorder = isDarkBlue ? '#3f3f46' : '#ddd';
  const panelControlBg = isDarkBlue ? '#27272a' : '#fff';
  const panelControlText = isDarkBlue ? '#e5e7eb' : '#111';
  const projectMenuButtonStyle: React.CSSProperties = {
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${panelControlBorder}`,
    background: panelControlBg,
    color: panelControlText,
    cursor: 'pointer',
  };
  const isRu = language === 'ru';
  const menuMuted = isDarkBlue ? '#a1a1aa' : '#78716c';
  const menuBorder = isDarkBlue ? '#3f3f46' : '#e7e5e4';
  const menuHeadingStyle: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: menuMuted, marginBottom: 6 };
  const menuSectionStyle: React.CSSProperties = { paddingTop: 12, borderTop: `1px solid ${menuBorder}` };
  const menuTileStyle: React.CSSProperties = { ...projectMenuButtonStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 6px', fontSize: 12 };
  const menuRowButtonStyle: React.CSSProperties = { ...projectMenuButtonStyle, flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 8px', fontSize: 12, whiteSpace: 'nowrap' };
  const menuDisabledStyle = (enabled: boolean): React.CSSProperties => (enabled ? {} : { opacity: 0.5, cursor: 'not-allowed' });
  const slotIconButtonStyle = (color?: string): React.CSSProperties => ({
    width: 28, height: 28, flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    borderRadius: 6, border: `1px solid ${panelControlBorder}`, background: panelControlBg, color: color ?? panelControlText, cursor: 'pointer',
  });
  // Loading replaces the project and resets undo history, so ask first.
  const replaceProjectConfirm = isRu ? 'Открыть сохранение? Текущий проект будет заменён.' : 'Load this save? The current project will be replaced.';

  // Toolbar: related buttons are joined into segmented groups instead of a row of identical squares.
  const toolbarBorder = isDarkBlue ? '#3f3f46' : '#d6d3d1';
  const toolbarMuted = isDarkBlue ? '#a1a1aa' : '#57534e';
  const toolbarGroupStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'stretch',
    height: 36,
    flex: '0 0 auto',
    boxSizing: 'border-box',
    border: `1px solid ${toolbarBorder}`,
    borderRadius: 8,
    overflow: 'hidden',
    background: isDarkBlue ? '#27272a' : '#fff',
  };
  const toolbarSegmentStyle = (active: boolean, first: boolean, enabled = true): React.CSSProperties => ({
    minWidth: 36,
    padding: '0 10px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    border: 'none',
    borderLeft: first ? 'none' : `1px solid ${toolbarBorder}`,
    background: active ? '#f59e0b' : 'transparent',
    color: active ? '#111' : (isDarkBlue ? '#e5e7eb' : '#222'),
    cursor: enabled ? 'pointer' : 'default',
    opacity: enabled ? 1 : 0.4,
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    whiteSpace: 'nowrap',
  });
  const toolbarButtonStyle = (active: boolean): React.CSSProperties => ({
    ...toolbarSegmentStyle(active, true),
    position: 'relative',
    height: 36,
    boxSizing: 'border-box',
    border: `1px solid ${toolbarBorder}`,
    borderRadius: 8,
    background: active ? '#f59e0b' : (isDarkBlue ? '#27272a' : '#fff'),
  });
  const toolbarDividerStyle: React.CSSProperties = { width: 1, height: 24, margin: '0 2px', flex: '0 0 auto', background: toolbarBorder };

  return (
    <div
      style={{
        zoom: uiScale,
        display: 'flex',
        gap: 8,
        padding: 12,
        borderBottom: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}`,
        background: isDarkBlue ? '#202124' : '#fff',
        flexWrap: 'wrap',
        alignItems: 'center',
        position: 'relative',
      }}
    >
      {/* Project: menu + name (click the name to rename) */}
      <div style={toolbarGroupStyle}>
        <button
          ref={projectMenuButtonRef}
          aria-expanded={projectMenuOpen}
          aria-haspopup="dialog"
          onClick={() => { setProjectMenuOpen((value) => !value); refreshSlots(); }}
          title={t(language, 'project')}
          style={toolbarSegmentStyle(projectMenuOpen, true)}
        >
          {t(language, 'project')}
          <IconChevronDown />
        </button>
        {editingName ? (
          <input
            autoFocus
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={() => { updateProjectName(nameValue); setEditingName(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { updateProjectName(nameValue); setEditingName(false); } if (e.key === 'Escape') setEditingName(false); }}
            aria-label={isRu ? 'Название проекта' : 'Project name'}
            style={{ width: 170, padding: '0 10px', border: 'none', borderLeft: `1px solid ${toolbarBorder}`, background: isDarkBlue ? '#18181b' : '#fffbeb', color: isDarkBlue ? '#e5e7eb' : '#111', fontSize: 13, fontWeight: 600, outline: 'none', boxShadow: 'inset 0 -2px 0 #f59e0b' }}
          />
        ) : (
          <button
            onClick={() => { setNameValue(project.name); setEditingName(true); }}
            title={isRu ? 'Нажмите, чтобы переименовать' : 'Click to rename'}
            style={{ ...toolbarSegmentStyle(false, false), maxWidth: 200, fontWeight: 600, color: toolbarMuted }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.name}</span>
          </button>
        )}
      </div>

      <span aria-hidden="true" style={toolbarDividerStyle} />

      <div role="group" aria-label={isRu ? 'Инструменты' : 'Tools'} style={toolbarGroupStyle}>
        <button
          onClick={() => setActiveTool('select')}
          aria-pressed={activeTool === 'select'}
          title={t(language, 'select')}
          aria-label={t(language, 'select')}
          style={{ ...toolbarSegmentStyle(activeTool === 'select', true), padding: 0 }}
        >
          <IconCursor />
        </button>
        <button
          onClick={() => setActiveTool('measure')}
          aria-pressed={activeTool === 'measure'}
          title={t(language, 'measure')}
          aria-label={t(language, 'measure')}
          style={{ ...toolbarSegmentStyle(activeTool === 'measure', false), padding: 0 }}
        >
          <IconRuler />
        </button>
        <button
          onClick={() => setActiveTool(activeTool === 'place-hole' ? 'select' : 'place-hole')}
          aria-pressed={activeTool === 'place-hole'}
          title={t(language, 'placeHole')}
          aria-label={t(language, 'placeHole')}
          style={{ ...toolbarSegmentStyle(activeTool === 'place-hole', false), padding: 0 }}
        >
          <IconDrill />
        </button>
        <button
          onClick={() => setActiveTool(activeTool === 'place-front' ? 'select' : 'place-front')}
          aria-pressed={activeTool === 'place-front'}
          title={t(language, 'placeFronts')}
          aria-label={t(language, 'placeFronts')}
          style={{ ...toolbarSegmentStyle(activeTool === 'place-front', false), padding: 0 }}
        >
          <IconFront />
        </button>
      </div>
      {/* Front tool: openings light up in 3D; pick one, then its front type here. */}
      {activeTool === 'place-front' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: toolbarMuted }}>
          <span style={{ color: '#f59e0b', fontWeight: 600 }}>{t(language, selectedOpening ? 'frontToolPicked' : 'pickOpeningHint')}</span>
          {selectedOpening ? (
            <>
              {FRONT_CHOICES.map((choice) => (
                <button
                  key={choice.labelKey}
                  onClick={() => setFrontOnSelectedOpening({ kind: choice.kind, hinge: choice.hinge })}
                  title={t(language, choice.labelKey)}
                  aria-label={t(language, choice.labelKey)}
                  style={{ ...toolbarButtonStyle(false), padding: '0 8px', fontSize: 15 }}
                >
                  {choice.icon}
                </button>
              ))}
              <button
                onClick={() => setFrontOnSelectedOpening(null)}
                title={t(language, 'removeFront')}
                aria-label={t(language, 'removeFront')}
                style={{ ...toolbarButtonStyle(false), padding: '0 8px' }}
              >
                ✕
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {activeTool === 'measure' ? (
        <span style={{ fontSize: 12, color: toolbarMuted, padding: '0 2px' }}>
          {measuredFaces[0] && measuredFaces[1] ? '2/2' : measuredFaces[0] ? '1/2' : t(language, 'measureHint')}
        </span>
      ) : null}
      {/* Hole settings sit next to the tool: pick the size here, then click the face in the scene. */}
      {activeTool === 'place-hole' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: toolbarMuted }}>
          <span style={{ color: '#f59e0b', fontWeight: 600 }}>{t(language, 'pickFaceHint')}</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            Ø
            <input type="number" min={1} value={holeDraft.diameter} onChange={(e) => updateHoleDraft({ diameter: Number(e.target.value) || 0 })} aria-label={t(language, 'diameter')} style={holeInputStyle} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {t(language, 'depth')}
            <input type="number" min={1} value={holeDraft.depth} disabled={holeDraft.through} onChange={(e) => updateHoleDraft({ depth: Number(e.target.value) || 0 })} aria-label={t(language, 'depth')} style={holeInputStyle} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={holeDraft.through} onChange={(e) => updateHoleDraft({ through: e.target.checked })} />
            {t(language, 'throughHole')}
          </label>
        </div>
      ) : null}
      <button onClick={addDemoPart} title={t(language, 'addPanel')} style={toolbarButtonStyle(false)}>
        <IconPlus />
        {isRu ? 'Панель' : 'Panel'}
      </button>
      <button
        onClick={() => setSketchPanelOpen(!sketchPanelOpen)}
        aria-pressed={sketchPanelOpen}
        title={t(language, 'sketchTitle')}
        aria-label={t(language, 'sketch')}
        style={{ ...toolbarButtonStyle(sketchPanelOpen), padding: 0 }}
      >
        <IconSketch />
        {sketchCount > 0 ? (
          <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 15, height: 15, padding: '0 3px', boxSizing: 'border-box', borderRadius: 8, background: sketchPanelOpen ? (isDarkBlue ? '#e5e7eb' : '#111') : '#f59e0b', color: sketchPanelOpen ? (isDarkBlue ? '#111' : '#fff') : '#111', fontSize: 9, fontWeight: 700, lineHeight: '15px' }}>
            {sketchCount}
          </span>
        ) : null}
      </button>

      <span aria-hidden="true" style={toolbarDividerStyle} />

      <div role="group" aria-label={isRu ? 'История' : 'History'} style={toolbarGroupStyle}>
        <button
          onClick={undo}
          disabled={!canUndo}
          title={`${t(language, 'undo')} (Ctrl+Z)`}
          aria-label={t(language, 'undo')}
          style={{ ...toolbarSegmentStyle(false, true, canUndo), padding: 0 }}
        >
          <IconUndo />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title={`${t(language, 'redo')} (Ctrl+Y)`}
          aria-label={t(language, 'redo')}
          style={{ ...toolbarSegmentStyle(false, false, canRedo), padding: 0 }}
        >
          <IconRedo />
        </button>
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        <label
          title={isRu ? 'Масштаб правой панели' : 'Right panel scale'}
          style={{ ...toolbarGroupStyle, alignItems: 'center', gap: 6, paddingLeft: 10, opacity: inspectorScaleEnabled ? 1 : 0.5 }}
        >
          <span style={{ fontSize: 12, color: toolbarMuted }}>{isRu ? 'Масштаб' : 'Scale'}</span>
          <select
            value={String(Math.round(inspectorScale * 100))}
            onChange={(e) => onInspectorScaleChange?.(Number(e.target.value) / 100)}
            disabled={!inspectorScaleEnabled}
            style={{ height: '100%', padding: '0 6px', border: 'none', borderLeft: `1px solid ${toolbarBorder}`, background: 'transparent', color: isDarkBlue ? '#e5e7eb' : '#111', fontSize: 13, cursor: inspectorScaleEnabled ? 'pointer' : 'not-allowed' }}
          >
            {[60, 70, 80, 90, 100, 110].map((pct) => (
              <option key={pct} value={pct} style={{ background: isDarkBlue ? '#27272a' : '#fff', color: isDarkBlue ? '#e5e7eb' : '#111' }}>{pct}%</option>
            ))}
          </select>
        </label>
        <div role="radiogroup" aria-label={t(language, 'language')} style={toolbarGroupStyle}>
          {(['ru', 'en'] as const).map((lang, index) => (
            <button
              key={lang}
              role="radio"
              aria-checked={language === lang}
              onClick={() => setLanguage(lang)}
              title={lang === 'ru' ? t(language, 'langRussian') : t(language, 'langEnglish')}
              style={{ ...toolbarSegmentStyle(language === lang, index === 0), fontSize: 12, fontWeight: 600 }}
            >
              {lang.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={() => setThemeMode(isDarkBlue ? 'light' : 'dark-blue')}
          title={isDarkBlue ? (isRu ? 'Светлая тема' : 'Light theme') : (isRu ? 'Тёмная тема' : 'Dark theme')}
          aria-label={isDarkBlue ? (isRu ? 'Светлая тема' : 'Light theme') : (isRu ? 'Тёмная тема' : 'Dark theme')}
          style={{ ...toolbarButtonStyle(false), padding: 0 }}
        >
          {isDarkBlue ? <IconSun /> : <IconMoon />}
        </button>
        <button
          onClick={() => setShowShortcuts((v) => !v)}
          aria-pressed={showShortcuts}
          title={isRu ? 'Горячие клавиши и настройки' : 'Keyboard shortcuts and settings'}
          aria-label={isRu ? 'Горячие клавиши и настройки' : 'Keyboard shortcuts and settings'}
          style={{ ...toolbarButtonStyle(showShortcuts), padding: 0, fontWeight: 700, fontSize: 15 }}
        >
          ?
        </button>
      </div>

      {showShortcuts && (() => {
        const dialogBorder = isDarkBlue ? '#3f3f46' : '#e7e5e4';
        const dialogMuted = isDarkBlue ? '#a1a1aa' : '#78716c';
        const kbdStyle: React.CSSProperties = {
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 22, height: 22, padding: '0 6px', boxSizing: 'border-box',
          borderRadius: 5, border: `1px solid ${isDarkBlue ? '#52525b' : '#d6d3d1'}`, borderBottomWidth: 2,
          background: isDarkBlue ? '#27272a' : '#fafaf9', color: isDarkBlue ? '#f4f4f5' : '#111',
          fontSize: 11, fontWeight: 600, fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', whiteSpace: 'nowrap',
        };
        // Each entry: alternative key combos (each combo is a list of keys), an optional muted note, and the action.
        type ShortcutEntry = { combos: string[][]; note?: string; action: string };
        const groups: Array<{ title: string; hint?: string; entries: ShortcutEntry[] }> = [
          {
            title: isRu ? 'Общие' : 'General',
            entries: [
              { combos: [['Ctrl', 'Z']], action: isRu ? 'Отменить' : 'Undo' },
              { combos: [['Ctrl', 'Y'], ['Ctrl', 'Shift', 'Z']], action: isRu ? 'Повторить' : 'Redo' },
              { combos: [['Delete']], action: isRu ? 'Удалить элемент или шкаф' : 'Delete element or cabinet' },
              { combos: [['Esc']], action: isRu ? 'Закрыть меню, отменить ввод' : 'Close menu, cancel input' },
            ],
          },
          {
            title: isRu ? 'Выбор' : 'Selection',
            entries: [
              { combos: [[isRu ? 'ЛКМ' : 'LMB']], note: isRu ? 'по детали' : 'on a part', action: isRu ? 'Выбрать деталь' : 'Select part' },
              { combos: [['Ctrl', isRu ? 'ЛКМ' : 'LMB']], action: isRu ? 'Добавить к выбору' : 'Add to selection' },
              { combos: [[isRu ? 'ЛКМ' : 'LMB']], note: isRu ? 'по пустому месту' : 'on empty space', action: isRu ? 'Снять выбор' : 'Clear selection' },
              { combos: [['F']], action: isRu ? 'Камера на выделенное' : 'Focus camera on selection' },
            ],
          },
          {
            title: isRu ? '3D-вид' : '3D view',
            entries: [
              { combos: [[isRu ? 'ЛКМ' : 'LMB']], note: isRu ? 'тянуть' : 'drag', action: isRu ? 'Вращать камеру' : 'Orbit camera' },
              { combos: [[isRu ? 'ПКМ' : 'RMB'], ['Shift', isRu ? 'ЛКМ' : 'LMB']], note: isRu ? 'тянуть' : 'drag', action: isRu ? 'Сдвинуть камеру' : 'Pan camera' },
              { combos: [[isRu ? 'Колесо' : 'Wheel']], action: isRu ? 'Приблизить / отдалить' : 'Zoom' },
            ],
          },
          {
            title: isRu ? 'Окно эскиза' : 'Sketch window',
            hint: isRu ? 'клавиши работают, когда курсор над окном' : 'keys work while the pointer is over the window',
            entries: [
              { combos: [['Ctrl', 'V']], action: isRu ? 'Вставить изображение' : 'Paste image' },
              { combos: [['0']], action: isRu ? 'Вписать изображение' : 'Fit image' },
              { combos: [['+'], ['−']], action: isRu ? 'Масштаб' : 'Zoom' },
              { combos: [['R']], action: isRu ? 'Повернуть на 90°' : 'Rotate 90°' },
              { combos: [[isRu ? '2× клик' : 'Double-click']], note: isRu ? 'по названию' : 'on the name', action: isRu ? 'Переименовать' : 'Rename' },
            ],
          },
        ];
        return (
          <div
            role="presentation"
            onClick={() => setShowShortcuts(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 100, padding: 16, boxSizing: 'border-box', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="shortcuts-dialog-title"
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 'min(600px, 100%)', maxHeight: 'calc(100vh - 32px)', overflow: 'auto', boxSizing: 'border-box',
                background: isDarkBlue ? '#202124' : '#fff', color: isDarkBlue ? '#e5e7eb' : '#111',
                border: `1px solid ${dialogBorder}`, borderRadius: 14, boxShadow: '0 16px 40px rgba(0,0,0,0.3)',
              }}
            >
              <div style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 20px 12px', background: isDarkBlue ? '#202124' : '#fff', borderBottom: `1px solid ${dialogBorder}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div id="shortcuts-dialog-title" style={{ fontWeight: 700, fontSize: 16 }}>{isRu ? 'Горячие клавиши' : 'Keyboard shortcuts'}</div>
                  <div style={{ marginTop: 2, fontSize: 11, color: dialogMuted }}>{isRu ? 'На Mac вместо Ctrl — ⌘' : 'On Mac, use ⌘ instead of Ctrl'}</div>
                </div>
                <button
                  onClick={() => setShowShortcuts(false)}
                  title={isRu ? 'Закрыть (Esc)' : 'Close (Esc)'}
                  aria-label={isRu ? 'Закрыть' : 'Close'}
                  style={{ width: 30, height: 30, flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, borderRadius: 8, border: `1px solid ${dialogBorder}`, background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 14 }}
                >
                  ✕
                </button>
              </div>

              <div style={{ padding: '14px 20px', display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                {groups.map((group) => (
                  <section key={group.title}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: dialogMuted }}>{group.title}</div>
                    {group.hint ? <div style={{ fontSize: 11, color: dialogMuted, marginTop: 2 }}>{group.hint}</div> : null}
                    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                      {group.entries.map((entry) => (
                        <div key={`${entry.action}-${entry.note ?? ''}`} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                          <span style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 3, maxWidth: '58%' }}>
                            {entry.combos.map((combo, comboIndex) => (
                              <span key={combo.join('+')} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                {comboIndex > 0 ? <span style={{ fontSize: 11, color: dialogMuted, margin: '0 2px' }}>{isRu ? 'или' : 'or'}</span> : null}
                                {combo.map((key, keyIndex) => (
                                  <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                    {keyIndex > 0 ? <span aria-hidden="true" style={{ fontSize: 11, color: dialogMuted }}>+</span> : null}
                                    <kbd style={kbdStyle}>{key}</kbd>
                                  </span>
                                ))}
                              </span>
                            ))}
                            {entry.note ? <span style={{ fontSize: 11, color: dialogMuted, marginLeft: 2 }}>{entry.note}</span> : null}
                          </span>
                          <span style={{ flex: 1, minWidth: 0, textAlign: 'right', color: isDarkBlue ? '#d4d4d8' : '#44403c' }}>{entry.action}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              {/* Experimental options are kept out of the main panels. */}
              <div style={{ padding: '12px 20px 16px', borderTop: `1px solid ${dialogBorder}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: dialogMuted, marginBottom: 8 }}>{isRu ? 'Экспериментальное' : 'Experimental'}</div>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={experimentalMoveMode} onChange={(e) => setExperimentalMoveMode(e.target.checked)} />
                  {t(language, 'experimentalMoveMode')}
                </label>
              </div>
            </div>
          </div>
        );
      })()}

      {projectMenuOpen ? (
        <div
          ref={projectMenuRef}
          role="dialog"
          aria-label={t(language, 'project')}
          style={{
            position: 'absolute',
            top: '100%',
            left: 12,
            marginTop: 8,
            width: 380,
            maxWidth: 'calc(100vw - 24px)',
            maxHeight: 'calc(100vh - 96px)',
            overflow: 'auto',
            background: isDarkBlue ? '#202124' : '#fff',
            border: `1px solid ${menuBorder}`,
            borderRadius: 12,
            boxShadow: isDarkBlue ? '0 10px 24px rgba(0,0,0,0.35)' : '0 10px 24px rgba(0,0,0,0.08)',
            padding: 12,
            zIndex: 20,
            display: 'grid',
            gap: 12,
          }}
        >
          <div>
            <div style={menuHeadingStyle}>{isRu ? 'Проект' : 'Project'}</div>
            <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              <button
                onClick={() => setShowNewProjectDialog((value) => !value)}
                aria-expanded={showNewProjectDialog}
                title={t(language, 'newProject')}
                style={{ ...menuTileStyle, ...(showNewProjectDialog ? { borderColor: '#f59e0b' } : {}) }}
              >
                <IconFilePlus />
                {isRu ? 'Новый' : 'New'}
              </button>
              <button onClick={() => { void openProjectFile(); }} title={t(language, 'openProjectFile')} style={menuTileStyle}>
                <IconFolder />
                {isRu ? 'Открыть' : 'Open'}
              </button>
              <button onClick={() => saveProjectToFile(project)} title={t(language, 'saveProjectFile')} style={menuTileStyle}>
                <IconSave />
                {isRu ? 'Сохранить' : 'Save'}
              </button>
            </div>
            {showNewProjectDialog ? (
              <div style={{ marginTop: 8, padding: 10, borderRadius: 8, border: '1px solid #f59e0b', background: isDarkBlue ? 'rgba(245,158,11,0.06)' : '#fffbeb', display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12, lineHeight: 1.4, color: panelControlText }}>{t(language, 'confirmNewProject')}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => saveProjectToFile(project)} style={menuRowButtonStyle}>
                    <IconSave />
                    {isRu ? 'Сохранить файл' : 'Save file'}
                  </button>
                  <button onClick={handleCreateNewProject} style={{ ...menuRowButtonStyle, borderColor: '#f59e0b', background: '#f59e0b', color: '#111', fontWeight: 600 }}>
                    {isRu ? 'Создать новый' : 'Create new'}
                  </button>
                  <button onClick={() => setShowNewProjectDialog(false)} style={{ ...menuRowButtonStyle, flex: '0 0 auto' }}>
                    {t(language, 'cancel')}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div style={menuSectionStyle}>
            <div style={menuHeadingStyle}>{isRu ? 'Быстрое сохранение · в этом браузере' : 'Quick save · this browser'}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={saveProgress} title={t(language, 'saveProgress')} style={menuRowButtonStyle}>
                <IconSave />
                {isRu ? 'Сохранить' : 'Save'}
              </button>
              <button
                onClick={() => { if (window.confirm(replaceProjectConfirm)) loadProgress(); }}
                disabled={!hasSavedProgress}
                title={t(language, 'loadSavedProgress')}
                style={{ ...menuRowButtonStyle, ...menuDisabledStyle(hasSavedProgress) }}
              >
                <IconFolder />
                {isRu ? 'Загрузить' : 'Load'}
              </button>
            </div>
            {saveProgressMessage ? <div style={{ marginTop: 6, fontSize: 11, color: menuMuted }}>{saveProgressMessage}</div> : null}
          </div>

          <div style={menuSectionStyle}>
            <div style={menuHeadingStyle}>{isRu ? 'Слоты сохранения' : 'Save slots'}</div>
            <div style={{ display: 'grid', gap: 4 }}>
              {slots.map(({ slot, meta }) => (
                <div
                  key={slot}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    minHeight: 40,
                    padding: '4px 6px',
                    borderRadius: 8,
                    border: `1px solid ${meta ? menuBorder : 'transparent'}`,
                    background: meta ? (isDarkBlue ? '#27272a' : '#fafaf9') : 'transparent',
                  }}
                >
                  <span style={{ width: 20, height: 20, flex: '0 0 auto', borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, background: meta ? '#f59e0b' : (isDarkBlue ? '#3f3f46' : '#e7e5e4'), color: meta ? '#111' : menuMuted }}>
                    {slot + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {meta ? (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.name}</div>
                        <div style={{ fontSize: 10, color: menuMuted }}>{`${meta.savedAt} · ${meta.partCount} ${isRu ? 'дет.' : 'pcs'}`}</div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: menuMuted }}>{isRu ? 'Пусто' : 'Empty'}</div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (meta && !window.confirm(isRu ? `Перезаписать слот ${slot + 1} («${meta.name}»)?` : `Overwrite slot ${slot + 1} ("${meta.name}")?`)) return;
                      void saveToSlot(slot).then(refreshSlots);
                    }}
                    title={isRu ? 'Сохранить в слот' : 'Save to slot'}
                    aria-label={isRu ? `Сохранить в слот ${slot + 1}` : `Save to slot ${slot + 1}`}
                    style={slotIconButtonStyle()}
                  >
                    <IconSave />
                  </button>
                  {meta ? (
                    <button
                      onClick={() => {
                        if (!window.confirm(replaceProjectConfirm)) return;
                        loadSlot(slot);
                        setProjectMenuOpen(false);
                      }}
                      title={isRu ? 'Открыть' : 'Load'}
                      aria-label={isRu ? `Открыть слот ${slot + 1}` : `Load slot ${slot + 1}`}
                      style={slotIconButtonStyle()}
                    >
                      <IconFolder />
                    </button>
                  ) : null}
                  {meta ? (
                    <button
                      onClick={() => {
                        if (!window.confirm(isRu ? `Удалить сохранение в слоте ${slot + 1}?` : `Delete the save in slot ${slot + 1}?`)) return;
                        void deleteSlot(slot).then(refreshSlots);
                      }}
                      title={isRu ? 'Удалить' : 'Delete'}
                      aria-label={isRu ? `Удалить слот ${slot + 1}` : `Delete slot ${slot + 1}`}
                      style={slotIconButtonStyle('#ef4444')}
                    >
                      <IconTrash />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div style={menuSectionStyle}>
            <div style={menuHeadingStyle}>{isRu ? 'Экспорт' : 'Export'}</div>
            <div style={{ display: 'grid', gap: 6, gridTemplateColumns: '1fr 1fr' }}>
              <button
                onClick={() => {
                  const csv = cuttingListToCsv(cuttingListRows);
                  void navigator.clipboard.writeText(csv).then(
                    () => setCuttingListMessage(t(language, 'cuttingListCopiedCsv')),
                    () => setCuttingListMessage(t(language, 'cuttingListCopyFailed')),
                  );
                }}
                disabled={cuttingListRows.length === 0}
                style={{ ...menuRowButtonStyle, ...menuDisabledStyle(cuttingListRows.length > 0) }}
              >
                {t(language, 'copyCsv')}
              </button>
              <button
                onClick={() => saveNcExport(project.parts)}
                disabled={cuttingListRows.length === 0}
                style={{ ...menuRowButtonStyle, ...menuDisabledStyle(cuttingListRows.length > 0) }}
              >
                {t(language, 'exportNc')}
              </button>
              <button
                onClick={() => selectedPart && saveSelectedPartMap(selectedPart)}
                disabled={!selectedPart}
                title={selectedPart ? undefined : (isRu ? 'Сначала выберите деталь' : 'Select a part first')}
                style={{ ...menuRowButtonStyle, gridColumn: '1 / -1', ...menuDisabledStyle(Boolean(selectedPart)) }}
              >
                {t(language, 'exportPartMap')}
              </button>
            </div>
            {cuttingListMessage ? <div style={{ marginTop: 6, fontSize: 11, color: menuMuted }}>{cuttingListMessage}</div> : null}

            <button
              onClick={() => setShowCuttingTable((value) => !value)}
              aria-expanded={showCuttingTable}
              style={{ marginTop: 10, width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', border: 'none', background: 'transparent', color: panelControlText, cursor: 'pointer', fontSize: 12, fontWeight: 600, textAlign: 'left' }}
            >
              <span style={{ fontSize: 9, color: menuMuted, display: 'inline-block', transform: showCuttingTable ? 'none' : 'rotate(-90deg)', transition: 'transform 150ms ease' }}>▼</span>
              {t(language, 'cuttingList')}
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 400, color: menuMuted }}>{cuttingListRows.length} {t(language, 'visibleParts')}</span>
            </button>
            {showCuttingTable ? (
              <div style={{ marginTop: 6, maxHeight: 260, overflow: 'auto', border: `1px solid ${menuBorder}`, borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>
                      {[
                        { label: t(language, 'cabinet'), align: 'left' as const },
                        { label: isRu ? 'Деталь' : 'Part', align: 'left' as const },
                        { label: isRu ? 'Размер, мм' : 'Size, mm', align: 'right' as const },
                      ].map((header) => (
                        <th key={header.label} style={{ textAlign: header.align, padding: '6px 8px', fontWeight: 600, color: menuMuted, borderBottom: `1px solid ${menuBorder}`, position: 'sticky', top: 0, background: isDarkBlue ? '#27272a' : '#f5f5f4' }}>{header.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cuttingListRows.length === 0 ? (
                      <tr><td colSpan={3} style={{ padding: 10, color: menuMuted }}>{t(language, 'noVisiblePartsYet')}</td></tr>
                    ) : cuttingListRows.map((row) => (
                      <tr key={row.id}>
                        <td style={{ padding: '5px 8px', borderBottom: `1px solid ${isDarkBlue ? '#27272a' : '#f5f5f4'}`, color: menuMuted, whiteSpace: 'nowrap' }}>{row.cabinet}</td>
                        <td style={{ padding: '5px 8px', borderBottom: `1px solid ${isDarkBlue ? '#27272a' : '#f5f5f4'}` }}>{row.partName}</td>
                        {/* Cut length × width × board thickness (previously the length/width columns were swapped). */}
                        <td style={{ padding: '5px 8px', borderBottom: `1px solid ${isDarkBlue ? '#27272a' : '#f5f5f4'}`, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {`${Math.round(row.width)}×${Math.round(row.height)}×${Math.round(row.thickness)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

