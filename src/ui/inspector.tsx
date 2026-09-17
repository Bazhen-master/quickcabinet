import { useEffect, useMemo, useRef, useState } from 'react';
import { getDrillGroupToken } from '../domain/project';
import { isDrillOperation } from '../domain/drill';
import { useAppStore, useProject } from '../app/store';
import { IconEye, IconTrash, ProjectTree } from './project-tree';
import { DRAWER_RUNNER_LENGTHS, getAutoDrawerRunnerLength, getCabinetModuleState, getCabinetOpenings, getDefaultTierSection, getDrawerBlockFacadeHeight, getLeafSectionInnerSpan, getLeafTierSections, getLocalZonesForSection, getOpeningRange, type CabinetBackPanelKind, type CabinetPlinthKind } from '../domain/cabinet-builder';
import { DEFAULT_DRAWER_FALSE_PANEL_GAP, DEFAULT_DRAWER_SLOT_HEIGHT, MAX_DRAWER_BLOCK_COLUMNS, MIN_DRAWER_SLOT_HEIGHT, getCabinetTierSpecs, type CabinetFrontHinge, type CabinetFrontKind, type DrawerBlockAnchor, type DrawerRunnerLength, type DrawerRunnerLengthMode, type DrawerRunnerType, type DrawerFalsePanelSpec, type DrawerFrontMode } from '../domain/cabinet-layout';
import { buildSnapCandidates, formatBoundsSize, getBounds, type RelativePlacementRule } from '../domain/geometry';
import { createEmptySideJoinery, type JoineryType } from '../domain/joinery';
import { t, type Lang } from '../i18n';
import { getLocalizedPartName, getPartOwnLabel, splitPartName } from '../domain/part-label';
import { MAX_PART_SIZE_MM } from '../domain/part';
import { planModuleSplit, type SplitAxis } from '../domain/module-split';
import { SheetLimitHint } from './sheet-limit-hint';
import { CABINET_PRESETS } from '../domain/cabinet-presets';
import { FrontIcon } from './front-icons';

const EGGER_COLORS: { article: string; name: string; hex: string }[] = [
  { article: 'W980 ST2',    name: 'Белый',               hex: '#F5F2ED' },
  { article: 'W1000 ST9',   name: 'Белый матовый',       hex: '#EDE9E1' },
  { article: 'U961 ST2',    name: 'Кремово-белый',       hex: '#EBE0C6' },
  { article: 'U732 ST9',    name: 'Светло-серый',        hex: '#C6C3BC' },
  { article: 'U780 ST9',    name: 'Серебристо-серый',    hex: '#B0ADA6' },
  { article: 'U763 ST9',    name: 'Платиново-серый',     hex: '#969390' },
  { article: 'U702 ST9',    name: 'Антрацит',            hex: '#474744' },
  { article: 'U999 ST2',    name: 'Чёрный',              hex: '#1E1E1C' },
  { article: 'H3430 ST22',  name: 'Дуб Вотан светлый',  hex: '#C8975A' },
  { article: 'H3174 ST36',  name: 'Дуб Бардолино нат.', hex: '#B8834A' },
  { article: 'H1334 ST9',   name: 'Дуб Нагано',         hex: '#A07B50' },
  { article: 'H3840 ST9',   name: 'Дуб Гамильтон',      hex: '#8A7252' },
  { article: 'H3734 ST9',   name: 'Хикори Артизан',     hex: '#9A6844' },
  { article: 'H1145 ST10',  name: 'Орех Традиция',      hex: '#6B4028' },
];

export type InspectorAnchorId =
  | 'quick-cabinet'
  | 'cabinet'
  | 'cabinet-body'
  | 'tiers'
  | 'partitions-shelves'
  | 'drawers'
  | 'selection'
  | 'move'
  | 'view';
export type InspectorAnchorRequest = { id: InspectorAnchorId; token: number };

function Card({ title, children, isDarkBlue = false }: { title: string; children: React.ReactNode; isDarkBlue?: boolean }) {
  return (
    <section style={{ border: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}`, borderRadius: 12, background: isDarkBlue ? '#202124' : '#fff', padding: 12 }}>
      <h4 style={{ margin: '0 0 10px 0', fontSize: 14, fontWeight: 600, color: isDarkBlue ? '#e5e7eb' : '#111' }}>{title}</h4>
      {children}
    </section>
  );
}

const AXIS_COLORS = { x: '#ef4444', y: '#22c55e', z: '#3b82f6' } as const;

function PlinthKindSelect({ language, value, onChange, style, optionStyle }: { language: Lang; value: CabinetPlinthKind; onChange: (kind: CabinetPlinthKind) => void; style: React.CSSProperties; optionStyle: React.CSSProperties }) {
  return (
    <select
      aria-label={t(language, 'plinth')}
      value={value}
      onChange={(e) => onChange(e.target.value as CabinetPlinthKind)}
      style={{ ...style, maxWidth: 160 }}
    >
      <option style={optionStyle} value="frame">{t(language, 'plinthKindFrame')}</option>
      <option style={optionStyle} value="kitchen">{t(language, 'plinthKindKitchen')}</option>
    </select>
  );
}

/** Высоты задних царг через запятую: «500, 1548». Применяется по Enter или при уходе из поля. */
function BackRailElevationsField({ language, value, onChange, style }: { language: Lang; value: number[]; onChange: (elevations: number[]) => void; style: React.CSSProperties }) {
  const text = value.join(', ');
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);
  const commit = (raw: string) => {
    const next = raw.split(/[\s,;]+/).filter(Boolean).map(Number).filter((item) => Number.isFinite(item) && item >= 0);
    if (next.join(', ') !== text) onChange(next);
    else setDraft(text);
  };
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36, fontSize: 13 }}>
      <span style={{ flex: 1, minWidth: 0 }}>{t(language, 'backRails')}</span>
      <input
        type="text"
        inputMode="numeric"
        placeholder="500, 1548"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        style={{ ...style, maxWidth: 160 }}
      />
    </label>
  );
}

/** Checkbox option with an optional inline control on the same row (e.g. plinth height). */
function BackPanelKindSelect({ language, value, onChange, style, optionStyle }: { language: Lang; value: CabinetBackPanelKind; onChange: (kind: CabinetBackPanelKind) => void; style: React.CSSProperties; optionStyle: React.CSSProperties }) {
  return (
    <select
      aria-label={t(language, 'backPanel')}
      value={value}
      onChange={(e) => onChange(e.target.value as CabinetBackPanelKind)}
      style={{ ...style, maxWidth: 160 }}
    >
      <option style={optionStyle} value="panel">{t(language, 'backPanelKindPanel')}</option>
      <option style={optionStyle} value="hdf">{t(language, 'backPanelKindHdf')}</option>
      <option style={optionStyle} value="hdf-overlay">{t(language, 'backPanelKindHdfOverlay')}</option>
    </select>
  );
}

function OptionRow({ label, checked, onChange, children }: { label: string; checked: boolean; onChange: () => void; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36 }}>
      <label style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
        <input type="checkbox" checked={checked} onChange={onChange} />
        <span>{label}</span>
      </label>
      {children ? <div style={{ flex: '0 0 84px' }}>{children}</div> : null}
    </div>
  );
}

/** Text input that commits on blur/Enter (Esc cancels): one undo step per edit instead of one per keystroke. */
function CommitTextInput({ value, onCommit, ariaLabel, style }: { value: string; onCommit: (value: string) => void; ariaLabel: string; style: React.CSSProperties }) {
  const [draft, setDraft] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!isFocused) setDraft(value);
  }, [isFocused, value]);

  return (
    <input
      value={draft}
      onFocus={() => setIsFocused(true)}
      onBlur={() => {
        setIsFocused(false);
        const next = draft.trim();
        if (cancelRef.current || !next || next === value) {
          cancelRef.current = false;
          setDraft(value);
          return;
        }
        onCommit(next);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') cancelRef.current = true;
        if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
      }}
      aria-label={ariaLabel}
      title={ariaLabel}
      style={style}
    />
  );
}

// Hide the mouse-click focus ring on panel toggles but keep it for keyboard navigation.
const INSPECTOR_CSS = `
.insp-toggle:focus { outline: none; }
.insp-toggle:focus-visible { outline: 2px solid #f59e0b; outline-offset: -2px; }
`;

export const FRONT_CHOICES: Array<{ kind: CabinetFrontKind; hinge: CabinetFrontHinge; labelKey: 'frontDoorLeft' | 'frontDoorRight' | 'frontDouble' | 'frontFlapUp' | 'frontFlapDown' }> = [
  { kind: 'door', hinge: 'left', labelKey: 'frontDoorLeft' },
  { kind: 'door', hinge: 'right', labelKey: 'frontDoorRight' },
  { kind: 'double', hinge: 'left', labelKey: 'frontDouble' },
  { kind: 'flap', hinge: 'top', labelKey: 'frontFlapUp' },
  { kind: 'flap', hinge: 'bottom', labelKey: 'frontFlapDown' },
];

/** The drawer settings collapse state is a per-viewer convenience kept across reloads. */
const DRAWERS_OPEN_STORAGE_KEY = 'furniture_v9:inspector-drawers-open';

/** Collapsible section inside a panel (used for part tools: move, holes). */
function SubSection({ title, open, onToggle, isDarkBlue, sectionRef, children }: { title: string; open: boolean; onToggle: () => void; isDarkBlue: boolean; sectionRef?: React.Ref<HTMLDivElement>; children: React.ReactNode }) {
  return (
    <div ref={sectionRef} style={{ marginTop: 10, paddingTop: 6, borderTop: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}` }}>
      <button
        className="insp-toggle"
        onClick={onToggle}
        aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', border: 'none', background: 'transparent', cursor: 'pointer', color: isDarkBlue ? '#e5e7eb' : '#111', fontSize: 13, fontWeight: 600, textAlign: 'left' }}
      >
        <span style={{ fontSize: 9, lineHeight: 1, color: isDarkBlue ? '#a1a1aa' : '#78716c', display: 'inline-block', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 150ms ease' }}>▼</span>
        <span>{title}</span>
      </button>
      {open ? <div style={{ marginTop: 8 }}>{children}</div> : null}
    </div>
  );
}

function AccordionCard({ title, summary, open, onToggle, children, isDarkBlue = false, accent = false, order }: { title: string; /** Short state shown in the header, useful while collapsed. */ summary?: string; open: boolean; onToggle: () => void; children: React.ReactNode; isDarkBlue?: boolean; accent?: boolean; order?: number }) {
  const borderColor = accent ? '#f59e0b' : (isDarkBlue ? '#3f3f46' : '#e7e5e4');
  const headerBackground = accent ? (isDarkBlue ? '#3f2c16' : '#fff7ed') : (isDarkBlue ? '#202124' : '#fff');
  const headerColor = accent ? (isDarkBlue ? '#fde68a' : '#9a3412') : (isDarkBlue ? '#e5e7eb' : '#111');

  return (
    <section style={{ order, border: `1px solid ${borderColor}`, borderRadius: 12, background: isDarkBlue ? '#202124' : '#fff', overflow: 'hidden' }}>
      <button
        className="insp-toggle"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '9px 12px',
          background: headerBackground,
          border: 'none',
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 600,
          color: headerColor,
          textAlign: 'left',
        }}
      >
        <span style={{ flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right', fontSize: 11, fontWeight: 400, color: isDarkBlue ? '#a1a1aa' : '#78716c' }}>{summary ?? ''}</span>
        <span style={{ flex: '0 0 auto', fontSize: 10, lineHeight: 1, color: isDarkBlue ? '#a1a1aa' : '#78716c', display: 'inline-block', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 150ms ease' }}>▼</span>
      </button>
      {open ? <div style={{ padding: '10px 12px 12px 12px' }}>{children}</div> : null}
    </section>
  );
}

function formatNumberFieldValue(value: number) {
  return Number.isFinite(value) ? String(value) : '';
}

function NumberField({ label, ariaLabel, value, onChange, step = 1, accent = false }: { label?: string; /** Accessible name when the visible label is omitted (inline fields). */ ariaLabel?: string; value: number; onChange: (value: number) => void; step?: number; accent?: boolean }) {
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
    // Leaving an untouched field must not rebuild the cabinet or add an undo step.
    if (parsed !== value) onChange(parsed);
    setDraft(String(parsed));
  };

  return (
    <label>
      {label ? <div style={{ fontSize: 12, marginBottom: 4, color: accent ? (isDarkBlue ? '#fde68a' : '#9a3412') : undefined }}>{label}</div> : null}
      <input
        type="number"
        aria-label={ariaLabel}
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
          // Typing only edits the draft (committed on Enter/blur): applying "5" → "56" → "560" would rebuild the
          // cabinet with every intermediate value. Spinner arrows and ↑/↓ carry no inputType and apply at once.
          if ((e.nativeEvent as InputEvent).inputType) return;
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

/**
 * Edits only the part's own label and keeps the cabinet prefix ("Cabinet 1 ›") as context.
 * Commits on blur/Enter (Esc cancels), so a rename is one undo step instead of one per keystroke.
 */
function PartNameField({
  part,
  language,
  inputStyle,
  mutedColor,
  onRename,
}: {
  part: Parameters<typeof getPartOwnLabel>[0];
  language: Lang;
  inputStyle: React.CSSProperties;
  mutedColor: string;
  onRename: (name: string) => void;
}) {
  const { prefix } = splitPartName(part.name);
  const ownLabel = getPartOwnLabel(part, language);
  const [draft, setDraft] = useState(ownLabel);
  const [isFocused, setIsFocused] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!isFocused) setDraft(ownLabel);
  }, [isFocused, ownLabel]);

  const commit = () => {
    const next = draft.trim();
    if (cancelRef.current || !next || next === ownLabel) {
      cancelRef.current = false;
      setDraft(ownLabel);
      return;
    }
    onRename(prefix ? `${prefix} · ${next}` : next);
  };

  return (
    <div style={{ marginBottom: 8 }}>
      {prefix ? (
        <div style={{ fontSize: 11, color: mutedColor, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prefix} ›</div>
      ) : null}
      <input
        value={draft}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          commit();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancelRef.current = true;
          if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
        }}
        aria-label={t(language, 'partName')}
        title={t(language, 'partName')}
        style={inputStyle}
      />
    </div>
  );
}

function getSelectStyle(isDarkBlue: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: 8,
    // Same fill as number inputs, so selects and fields read as one control family.
    background: isDarkBlue ? '#27272a' : '#fff',
    color: isDarkBlue ? '#e5e7eb' : '#111',
    border: `1px solid ${isDarkBlue ? '#3f3f46' : '#d6d3d1'}`,
    borderRadius: 6,
  };
}

function getOptionStyle(isDarkBlue: boolean): React.CSSProperties {
  return {
    background: isDarkBlue ? '#27272a' : '#fff',
    color: isDarkBlue ? '#e5e7eb' : '#111',
  };
}

function StickySelectionBlock({ children, isDarkBlue = false }: { children: React.ReactNode; isDarkBlue?: boolean }) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 5,
        // Same background as the accordion body, otherwise the sticky wrapper shows as a dark band under the card.
        background: isDarkBlue ? '#202124' : '#fff',
      }}
    >
      <div
        style={{
          background: isDarkBlue ? '#202124' : '#fff',
          border: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}`,
          borderRadius: 12,
          padding: 12,
          boxShadow: isDarkBlue ? '0 2px 8px rgba(0,0,0,0.25)' : '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function Inspector({ uiScale = 1, anchorRequest, onAnchorHandled, onActiveAnchorChange }: { uiScale?: number; anchorRequest?: InspectorAnchorRequest | null; onAnchorHandled?: () => void; onActiveAnchorChange?: (id: InspectorAnchorId) => void }) {
  const panelScrollRef = useRef<HTMLDivElement | null>(null);
  const inspectorSelectionRef = useRef<HTMLDivElement | null>(null);
  const movePanelRef = useRef<HTMLDivElement | null>(null);
  const cabinetPanelRef = useRef<HTMLDivElement | null>(null);
  const quickCabinetPanelRef = useRef<HTMLDivElement | null>(null);
  const viewPanelRef = useRef<HTMLDivElement | null>(null);
  const cabinetBodyRef = useRef<HTMLDivElement | null>(null);
  const tiersRef = useRef<HTMLDivElement | null>(null);
  const drawersRef = useRef<HTMLDivElement | null>(null);
  const partitionsShelvesRef = useRef<HTMLDivElement | null>(null);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(true);
  const [moveOpen, setMoveOpen] = useState(false);
  const [cabinetOpen, setCabinetOpen] = useState(false);
  const [quickCabinetOpen, setQuickCabinetOpen] = useState(true);
  const [drawersOpen, setDrawersOpen] = useState(() => {
    try { return localStorage.getItem(DRAWERS_OPEN_STORAGE_KEY) !== '0'; } catch { return true; }
  });
  const toggleDrawersOpen = () => setDrawersOpen((value) => {
    try { localStorage.setItem(DRAWERS_OPEN_STORAGE_KEY, value ? '0' : '1'); } catch { /* storage unavailable: keep in memory only */ }
    return !value;
  });
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
  const kitchenMode = useAppStore((s) => s.kitchenMode);
  const showDrilling = useAppStore((s) => s.showDrilling);
  const xrayMode = useAppStore((s) => s.xrayMode);
  const materialColor = useAppStore((s) => s.materialColor);
  const setMaterialColor = useAppStore((s) => s.setMaterialColor);
  const setPartsColor = useAppStore((s) => s.setPartsColor);
  const setShowAxisIndicator = useAppStore((s) => s.setShowAxisIndicator);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const cabinetDraft = useAppStore((s) => s.cabinetDraft);
  const snapGrid = useAppStore((s) => s.snapGrid);
  const jointRules = useAppStore((s) => s.jointRules);
  const moveDraft = useAppStore((s) => s.moveDraft);
  const lastValidationErrors = useAppStore((s) => s.lastValidationErrors);
  const setExperimentalMoveMode = useAppStore((s) => s.setExperimentalMoveMode);
  const setShowDrilling = useAppStore((s) => s.setShowDrilling);
  const setXrayMode = useAppStore((s) => s.setXrayMode);
  const setThemeMode = useAppStore((s) => s.setThemeMode);
  const updateCabinetDraft = useAppStore((s) => s.updateCabinetDraft);
  const addCabinetPreset = useAppStore((s) => s.addCabinetPreset);
  const updateJointRules = useAppStore((s) => s.updateJointRules);
  const updatePartJoinery = useAppStore((s) => s.updatePartJoinery);
  const updatePartHingeEdge = useAppStore((s) => s.updatePartHingeEdge);
  const updateBatchPartJoinery = useAppStore((s) => s.updateBatchPartJoinery);
  const setSnapGrid = useAppStore((s) => s.setSnapGrid);
  const setMoveDraft = useAppStore((s) => s.setMoveDraft);
  const applyMoveByAxis = useAppStore((s) => s.applyMoveByAxis);
  const rotateSelected90 = useAppStore((s) => s.rotateSelected90);
  const applyRelativeMove = useAppStore((s) => s.applyRelativeMove);
  const applySnapCandidate = useAppStore((s) => s.applySnapCandidate);
  const updatePartName = useAppStore((s) => s.updatePartName);
  const setPartHidden = useAppStore((s) => s.setPartHidden);
  const updatePartSize = useAppStore((s) => s.updatePartSize);
  const updatePartsSize = useAppStore((s) => s.updatePartsSize);
  const setShelfApron = useAppStore((s) => s.setShelfApron);
  const moveSelectedDrillGroup = useAppStore((s) => s.moveSelectedDrillGroup);
  const updateCabinetModule = useAppStore((s) => s.updateCabinetModule);
  const splitCabinetIntoModules = useAppStore((s) => s.splitCabinetIntoModules);
  // Oversized size requests per axis; target is 'draft' (quick cabinet form) or a cabinet groupId.
  const [sizeLimitHints, setSizeLimitHints] = useState<Partial<Record<SplitAxis, { target: string; requested: number }>>>({});
  const dismissSizeLimitHint = (axis: SplitAxis) => setSizeLimitHints(({ [axis]: _removed, ...rest }) => rest);
  const handleCabinetSizeInput = (target: string, axis: SplitAxis, value: number) => {
    if (value > MAX_PART_SIZE_MM) {
      setSizeLimitHints((prev) => ({ ...prev, [axis]: { target, requested: value } }));
    } else if (sizeLimitHints[axis]?.target === target) {
      dismissSizeLimitHint(axis);
    }
  };
  const renderSizeLimitHints = (target: string) => (['width', 'height'] as const).map((axis) => {
    const hint = sizeLimitHints[axis];
    const plan = hint && hint.target === target ? planModuleSplit(axis, hint.requested) : null;
    if (!plan) return null;
    return (
      <SheetLimitHint
        key={axis}
        plan={plan}
        language={language}
        isDarkBlue={isDarkBlue}
        splitsExisting={target !== 'draft'}
        onDismiss={() => dismissSizeLimitHint(axis)}
        onSplit={() => {
          splitCabinetIntoModules(target === 'draft' ? { kind: 'draft' } : { kind: 'module', groupId: target }, axis, plan.requested);
          dismissSizeLimitHint(axis);
        }}
      />
    );
  });
  const addCabinet = useAppStore((s) => s.addCabinet);
  const addShelfToSelectedGroup = useAppStore((s) => s.addShelfToSelectedGroup);
  const addPartitionToSelectedGroup = useAppStore((s) => s.addPartitionToSelectedGroup);
  const toggleBackPanelForSelectedGroup = useAppStore((s) => s.toggleBackPanelForSelectedGroup);
  const selectedOpening = useAppStore((s) => s.selectedOpening);
  const setFrontOnSelectedOpening = useAppStore((s) => s.setFrontOnSelectedOpening);
  const setFrontsOnAllOpenings = useAppStore((s) => s.setFrontsOnAllOpenings);
  const clearAllFronts = useAppStore((s) => s.clearAllFronts);
  const removeSelectedCabinetElement = useAppStore((s) => s.removeSelectedCabinetElement);
  const duplicateSelected = useAppStore((s) => s.duplicateSelected);
  const updateSelectedCabinetSectionWidths = useAppStore((s) => s.updateSelectedCabinetSectionWidths);
  const updateSelectedCabinetTierHeight = useAppStore((s) => s.updateSelectedCabinetTierHeight);
  const upsertSelectedSectionDrawerBlock = useAppStore((s) => s.upsertSelectedSectionDrawerBlock);
  const removeSelectedSectionDrawerBlock = useAppStore((s) => s.removeSelectedSectionDrawerBlock);
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
    return (selectedPart.operations ?? []).filter(isDrillOperation).find((op) => op.id === selectedDrill.opId) ?? null;
  }, [selectedDrill, selectedPart]);
  const selectedDrillToken = useMemo(
    () => (selectedDrill && selectedDrillOp ? getDrillGroupToken(selectedDrill.partId, selectedDrillOp) : null),
    [selectedDrill, selectedDrillOp]
  );
  const selectedDrillGroupCount = useMemo(() => {
    if (!selectedDrillToken) return 0;
    return project.parts.reduce((count, part) => count + (part.operations ?? []).filter(isDrillOperation).filter((op) => getDrillGroupToken(part.id, op) === selectedDrillToken).length, 0);
  }, [project.parts, selectedDrillToken]);
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
  const cabinetOpenings = useMemo(() => moduleState ? getCabinetOpenings(project.parts, moduleState.groupId) : [], [moduleState, project.parts]);
  // The opening picked in 3D, with the front exactly over it (for the pressed button) and whether any front overlaps it.
  const activeOpening = useMemo(() => {
    if (!moduleState || selectedOpening?.groupId !== moduleState.groupId) return null;
    const range = getOpeningRange(cabinetOpenings, selectedOpening);
    if (!range) return null;
    const first = range.cells[range.from]!;
    const last = range.cells[range.to]!;
    const pickedCells = range.cells.slice(range.from, range.to + 1);
    // Fronts of every tier: a tall one may reach into the picked opening from another tier.
    const overlapping = getCabinetTierSpecs(moduleState.layout)
      .flatMap((tier) => (tier.layout.fronts ?? []).map((spec) => ({ spec, specRange: getOpeningRange(cabinetOpenings, { ...spec, tierId: tier.id }) })))
      .filter(({ specRange }) => specRange && specRange.cells.slice(specRange.from, specRange.to + 1).some((cell) => pickedCells.includes(cell)));
    const front = overlapping.find(({ specRange }) => specRange!.cells[specRange!.from] === first && specRange!.cells[specRange!.to] === last)?.spec ?? null;
    const hasFront = overlapping.length > 0;
    return {
      tierIndex: first.tierIndex,
      sectionNumber: leafSections.filter((section) => section.tierId === selectedOpening.tierId).findIndex((section) => section.id === selectedOpening.sectionId) + 1,
      width: first.endX - first.startX,
      height: last.endY - first.startY,
      front,
      hasFront,
    };
  }, [cabinetOpenings, leafSections, moduleState, selectedOpening]);
  const activeSection = useMemo(() => {
    if (!moduleState) return null;
    return leafSections.find((section) => selectedSection?.groupId === moduleState.groupId && section.id === selectedSection.sectionId && (!selectedSection.tierId || section.tierId === selectedSection.tierId)) ?? getDefaultTierSection(leafSections);
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
  const [drawerBlockAnchor, setDrawerBlockAnchor] = useState<DrawerBlockAnchor>('bottom');
  const [drawerBlockDraft, setDrawerBlockDraft] = useState({
    offset: 0,
    drawerCount: 3,
    columns: 1,
    slotHeight: DEFAULT_DRAWER_SLOT_HEIGHT,
    withBackPanel: true,
    fill: false,
    falsePanel: null as DrawerFalsePanelSpec | null,
    // null = not set on the block (recess 0, the cabinet's front mode) — a door put over the block may set them.
    recess: null as number | null,
    frontMode: null as DrawerFrontMode | null,
    runnerLengthMode: 'auto' as DrawerRunnerLengthMode,
    runnerLength: 450 as DrawerRunnerLength,
  });
  const activeDrawerBlock = useMemo(() => {
    if (!moduleState || !activeSection) return null;
    return getCabinetTierSpecs(moduleState.layout)
      .flatMap((tier) => tier.id === activeSection.tierId ? tier.layout.drawers ?? [] : [])
      .find((drawer) => drawer.sectionId === activeSection.id && drawer.block?.anchor === drawerBlockAnchor) ?? null;
  }, [activeSection, drawerBlockAnchor, moduleState]);
  // An existing block is edited live; before it exists the form is a draft.
  const drawerBlockValues: typeof drawerBlockDraft = activeDrawerBlock?.block
    ? {
        offset: activeDrawerBlock.block.offset ?? 0,
        drawerCount: activeDrawerBlock.drawerCount,
        columns: activeDrawerBlock.block.columns,
        slotHeight: activeDrawerBlock.block.slotHeight,
        withBackPanel: activeDrawerBlock.block.withBackPanel,
        fill: Boolean(activeDrawerBlock.block.fill),
        falsePanel: activeDrawerBlock.block.falsePanel ?? null,
        recess: activeDrawerBlock.block.recess ?? null,
        frontMode: activeDrawerBlock.block.frontMode ?? null,
        runnerLengthMode: activeDrawerBlock.runnerLengthMode ?? 'manual',
        runnerLength: activeDrawerBlock.runnerLength,
      }
    : drawerBlockDraft;
  const activeAutoDrawerRunnerLength = getAutoDrawerRunnerLength((moduleState?.depth ?? cabinetDraft.depth) - (drawerBlockValues.recess ?? 0));
  const drawerNicheSpan = drawerBlockValues.offset > 0 ? drawerBlockValues.offset + (moduleState?.thickness ?? 16) : 0;
  // A full-height block has no inner divider and no drawer height of its own: only the minimum drawer height limits it.
  const maxBlockDrawerCount = activeSection && moduleState
    ? drawerBlockValues.fill
      ? Math.max(1, Math.floor((activeSection.clearHeight - drawerNicheSpan) / MIN_DRAWER_SLOT_HEIGHT))
      : Math.max(1, Math.floor((activeSection.clearHeight - moduleState.thickness * 2 - 40 - drawerNicheSpan) / Math.max(1, drawerBlockValues.slotHeight)))
    : 1;
  const maxDrawerBlockOffset = activeSection && moduleState
    ? drawerBlockValues.fill
      ? Math.max(0, Math.round(activeSection.clearHeight - moduleState.thickness - drawerBlockValues.drawerCount * MIN_DRAWER_SLOT_HEIGHT))
      : Math.max(0, Math.round(activeSection.clearHeight - moduleState.thickness * 3 - 40 - drawerBlockValues.drawerCount * drawerBlockValues.slotHeight))
    : 0;
  const commitDrawerBlock = (values: typeof drawerBlockDraft) => upsertSelectedSectionDrawerBlock({
    anchor: drawerBlockAnchor,
    offset: Math.min(values.offset, maxDrawerBlockOffset),
    drawerCount: Math.min(values.drawerCount, maxBlockDrawerCount),
    columns: values.columns,
    slotHeight: values.slotHeight,
    withBackPanel: values.withBackPanel,
    fill: values.fill,
    falsePanel: values.falsePanel ?? undefined,
    recess: values.recess ?? undefined,
    frontMode: values.frontMode ?? undefined,
    runnerType: 'hidden-unihoper',
    runnerLengthMode: values.runnerLengthMode,
    runnerLength: values.runnerLengthMode === 'auto' ? activeAutoDrawerRunnerLength : values.runnerLength,
  });
  // The built false panel carries its fastening (rebuilds keep it); a new panel goes to the side the section's door hinges on.
  const drawerFalsePanelPart = activeDrawerBlock
    ? project.parts.find((part) => part.meta?.groupId === moduleState?.groupId && part.meta?.role === 'drawer-false-panel' && part.meta.sourceId === `${activeDrawerBlock.id}:false-panel`) ?? null
    : null;
  const sectionDoorHinge = moduleState && activeSection
    ? getCabinetTierSpecs(moduleState.layout)
      .flatMap((tier) => tier.layout.fronts ?? [])
      .find((front) => front.kind === 'door' && (front.sectionId === activeSection.id || front.topSectionId === activeSection.id))?.hinge
    : undefined;
  const updateDrawerBlockField = (patch: Partial<typeof drawerBlockDraft>) => {
    const next = { ...drawerBlockValues, ...patch };
    if (activeDrawerBlock) commitDrawerBlock(next);
    else setDrawerBlockDraft(next);
  };
  const hasTierSectionControls = Boolean(
    (activeSection && moduleState?.tierCount && moduleState.tierCount > 1)
    || tierOptions.length > 1
    || activeTierSections.length > 1
    || localZones.length > 1
  );
  const groupBounds = useMemo(() => {
    if (!moduleState) return null;
    return getBounds(project.parts.filter((part) => part.meta?.groupId === moduleState.groupId));
  }, [moduleState, project.parts]);
  const localizedValidationErrors = useMemo(
    () =>
      lastValidationErrors.map((err) => {
        if (language === 'ru') {
          if (err === 'Move blocked: parts would intersect' || err === 'Move blocked by intersection') return 'Нужно сместить деталь';
          if (err === 'Select a target part for relative move') return 'Выберите целевую деталь для относительного перемещения';
          if (err === 'Target part must be different from moved selection') return 'Целевая деталь должна отличаться от перемещаемой';
        }
        return err;
      }),
    [lastValidationErrors, language]
  );

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
    { id: 'confirmat-dowel', label: t(language, 'joineryConfirmatDowel') },
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

  // Rafix is offered for shelves only among horizontal panels.
  const singleJoineryOptions = selectedPart?.meta?.role === 'shelf'
    ? joineryOptions
    : standardJoineryOptions.filter((item) => item.id !== 'shelf_pin');
  const partitionJoineryOptions = joineryOptions.filter((item) => item.id !== 'shelf_pin');
  const tierDividerJoineryOptions = standardJoineryOptions.filter((item) => item.id !== 'shelf_pin');
  // Конфирмат со шкантом пока только у корпуса и перегородок: задние стенки и царги его не умеют.
  const frameJoineryOptions = joineryOptions.filter((item) => item.id === 'none' || item.id === 'confirmat' || item.id === 'minifix-dowel' || item.id === 'rafix');
  const nonBackPanelFrameJoineryOptions = standardJoineryOptions.filter((item) => item.id === 'none' || item.id === 'confirmat');
  const batchJoineryOptions = batchRole === 'shelf'
    ? joineryOptions
    : standardJoineryOptions.filter((item) => item.id !== 'shelf_pin');
  const removableSelectedPart = Boolean(selectedPart);
  const prioritizeCabinetPanel = Boolean(moduleState);
  // Panels follow the project hierarchy: tree → cabinet → part. In an empty project "Create cabinet" leads.
  // `order` must sit on the grid's direct children (the panel wrappers), not on the inner cards.
  const hasCabinets = project.parts.some((part) => Boolean(part.meta?.groupId));
  const panelOrder = hasCabinets
    ? { tree: 0, cabinet: 1, selection: 2, quickCabinet: 3, view: 4 }
    : { quickCabinet: 0, tree: 1, selection: 2, cabinet: 3, view: 4 };
  const selectedPartJoinery = selectedPart?.meta?.joinery ?? createEmptySideJoinery();
  const selectedShelfSpec = selectedPart?.meta?.role === 'shelf' && selectedPart.meta.sourceId && moduleState
    ? getCabinetTierSpecs(moduleState.layout).flatMap((tier) => tier.layout.shelves).find((shelf) => shelf.id === selectedPart.meta?.sourceId) ?? null
    : null;

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

  useEffect(() => {
    const container = panelScrollRef.current;
    if (!container || !onActiveAnchorChange) return;

    const pickActive = () => {
      const anchors: Array<{ id: InspectorAnchorId; el: HTMLDivElement | null }> = [
        { id: 'quick-cabinet', el: quickCabinetPanelRef.current },
        { id: 'cabinet', el: cabinetPanelRef.current },
        { id: 'cabinet-body', el: cabinetBodyRef.current },
        { id: 'tiers', el: tiersRef.current },
        { id: 'partitions-shelves', el: partitionsShelvesRef.current },
        { id: 'drawers', el: drawersRef.current },
        { id: 'selection', el: inspectorSelectionRef.current },
        { id: 'move', el: movePanelRef.current },
        { id: 'view', el: viewPanelRef.current },
      ];

      if (anchors.length === 0) return;
      const containerRect = container.getBoundingClientRect();
      let best = anchors.find((item) => item.el) ?? anchors[0];
      let bestDist = Number.POSITIVE_INFINITY;
      for (const item of anchors) {
        if (!item.el) continue;
        const rect = item.el.getBoundingClientRect();
        const dist = Math.abs((rect.top - containerRect.top) - 24);
        if (dist < bestDist) {
          best = item;
          bestDist = dist;
        }
      }
      onActiveAnchorChange(best.id);
    };

    pickActive();
    container.addEventListener('scroll', pickActive, { passive: true });
    return () => container.removeEventListener('scroll', pickActive);
  }, [onActiveAnchorChange, cabinetOpen, selectionOpen, moveOpen, quickCabinetOpen]);

  // Panels follow the selection: a part opens its properties, a cabinet opens the cabinet panel.
  // Runs only when the selected object changes, and before the anchor effect so explicit navigation wins.
  const selectionKey = selected?.type === 'group' ? `group:${selected.groupId}` : selected ? `part:${selected.partId}` : '';
  const prevSelectionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevSelectionKeyRef.current === selectionKey) return;
    prevSelectionKeyRef.current = selectionKey;
    if (selectionKey.startsWith('part:')) {
      setSelectionOpen(true);
      setCabinetOpen(false);
      setQuickCabinetOpen(false);
    } else if (selectionKey.startsWith('group:')) {
      setCabinetOpen(true);
      setSelectionOpen(false);
      setQuickCabinetOpen(false);
    } else {
      setSelectionOpen(false);
    }
  }, [selectionKey]);

  useEffect(() => {
    if (!anchorRequest) return;
    const container = panelScrollRef.current;
    if (!container) return;

    if (anchorRequest.id === 'selection') setSelectionOpen(true);
    if (anchorRequest.id === 'move') {
      setSelectionOpen(true);
      setMoveOpen(true);
    }
    if (anchorRequest.id === 'cabinet' || anchorRequest.id === 'cabinet-body' || anchorRequest.id === 'tiers' || anchorRequest.id === 'drawers' || anchorRequest.id === 'partitions-shelves') {
      setCabinetOpen(true);
      // If there is no selected cabinet yet, open quick cabinet as a safe fallback target.
      if (!moduleState) setQuickCabinetOpen(true);
    }
    if (anchorRequest.id === 'drawers') setDrawersOpen(true);
    if (anchorRequest.id === 'quick-cabinet') setQuickCabinetOpen(true);

    const resolveTarget = () => {
      if (anchorRequest.id === 'selection') return inspectorSelectionRef.current;
      // Move and hole tools render only with a selection; otherwise land on the properties panel.
      if (anchorRequest.id === 'move') return movePanelRef.current ?? inspectorSelectionRef.current;
      if (anchorRequest.id === 'cabinet') return cabinetPanelRef.current ?? quickCabinetPanelRef.current;
      if (anchorRequest.id === 'cabinet-body') return cabinetBodyRef.current ?? cabinetPanelRef.current;
      if (anchorRequest.id === 'tiers') return tiersRef.current ?? cabinetPanelRef.current ?? quickCabinetPanelRef.current;
      if (anchorRequest.id === 'drawers') return drawersRef.current ?? cabinetPanelRef.current ?? quickCabinetPanelRef.current;
      if (anchorRequest.id === 'partitions-shelves') return partitionsShelvesRef.current ?? cabinetPanelRef.current ?? quickCabinetPanelRef.current;
      if (anchorRequest.id === 'quick-cabinet') return quickCabinetPanelRef.current;
      if (anchorRequest.id === 'view') return viewPanelRef.current;
      return null;
    };

    // Wait for accordion open state to render, then scroll to fresh target.
    const t = window.setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const target = resolveTarget();
          if (!target) {
            onAnchorHandled?.();
            return;
          }
          const containerRect = container.getBoundingClientRect();
          const panelRect = target.getBoundingClientRect();
          const nextTop = container.scrollTop + (panelRect.top - containerRect.top) - 8;
          container.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
          onAnchorHandled?.();
        });
      });
    }, 0);

    return () => window.clearTimeout(t);
  }, [anchorRequest, moduleState, onAnchorHandled]);

  const mutedTextColor = isDarkBlue ? '#a1a1aa' : '#57534e';
  const sectionHeadingStyle: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: isDarkBlue ? '#a1a1aa' : '#78716c', marginBottom: 6 };
  const textInputStyle: React.CSSProperties = { width: '100%', padding: 8, boxSizing: 'border-box', background: isDarkBlue ? '#27272a' : '#fff', color: isDarkBlue ? '#e5e7eb' : '#111', border: `1px solid ${isDarkBlue ? '#3f3f46' : '#d6d3d1'}`, borderRadius: 6 };
  const partActionButtonStyle: React.CSSProperties = { flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 8px', borderRadius: 7, border: `1px solid ${panelControlBorder}`, background: panelControlBg, color: panelControlText, cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' };
  const partDangerButtonStyle: React.CSSProperties = { flex: '0 0 auto', width: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, borderRadius: 7, border: `1px solid ${isDarkBlue ? '#7f1d1d' : '#fca5a5'}`, background: 'transparent', color: '#ef4444', cursor: 'pointer' };
  const selectedPartCutSummary = selectedPart
    ? (() => {
        const [first = 0, second = 0, third = 0] = [selectedPart.width, selectedPart.height, selectedPart.thickness].sort((a, b) => b - a);
        return language === 'ru'
          ? `Раскрой ${Math.round(first)}×${Math.round(second)} мм · толщина ${Math.round(third)} мм`
          : `Cut size ${Math.round(first)}×${Math.round(second)} mm · thickness ${Math.round(third)} mm`;
      })()
    : '';
  // jointRules are project-wide, not per part: say so, otherwise it looks like a property of the selected part.
  const jointRuleFields = (
    <div style={{ gridColumn: '1 / -1', marginTop: 2 }}>
      <div style={{ fontSize: 10, color: mutedTextColor, marginBottom: 6 }}>
        {language === 'ru' ? 'Отступы и шаг крепежа — общие для всего проекта' : 'Offsets and fastener spacing apply to the whole project'}
      </div>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <NumberField label={language === 'ru' ? 'Спереди' : 'Front'} value={jointRules.frontOffset} onChange={(value) => updateJointRules({ frontOffset: value })} />
        <NumberField label={language === 'ru' ? 'Сзади' : 'Back'} value={jointRules.backOffset} onChange={(value) => updateJointRules({ backOffset: value })} />
        <NumberField label={language === 'ru' ? 'Шаг' : 'Spacing'} value={jointRules.camDowelSpacing} onChange={(value) => updateJointRules({ camDowelSpacing: value })} />
      </div>
    </div>
  );

  // Move by a positive distance in the chosen direction; the store action reads the signed draft distance.
  const moveAlongAxis = (sign: 1 | -1) => {
    const distance = Math.abs(moveDraft.distance);
    if (!distance) return;
    setMoveDraft({ distance: sign * distance });
    applyMoveByAxis();
    setMoveDraft({ distance });
  };

  // Cabinet panel: flat groups separated by a hairline instead of nested colored cards.
  const fieldLabelStyle: React.CSSProperties = { fontSize: 12, marginBottom: 4 };
  const hintStyle: React.CSSProperties = { fontSize: 11, lineHeight: 1.4, color: mutedTextColor, marginBottom: 8 };
  const cabinetGroupStyle: React.CSSProperties = { marginTop: 14, paddingTop: 12, borderTop: `1px solid ${panelControlBorder}` };
  const gridButtonStyle: React.CSSProperties = { ...partActionButtonStyle, width: '100%', minHeight: 34, whiteSpace: 'normal', lineHeight: 1.25 };
  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    border: `1px solid ${active ? '#f59e0b' : panelControlBorder}`,
    background: active ? (isDarkBlue ? '#3f2c16' : '#fff7ed') : panelControlBg,
    color: active ? (isDarkBlue ? '#fde68a' : '#9a3412') : panelControlText,
  });
  const activeSectionLabel = moduleState && activeSection
    ? `${t(language, 'tier')} ${activeSection.tierIndex + 1} · ${t(language, 'section')} ${Math.max(1, activeTierSections.findIndex((section) => section.id === activeSection.id) + 1)} · ${Math.round(getLeafSectionInnerSpan(moduleState, activeSection).width)} ${language === 'ru' ? 'мм' : 'mm'}`
    : '';

  // Header summaries keep collapsed panels informative.
  const ruPlural = (count: number, one: string, few: string, many: string) => {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  };
  const formatSize = (width: number, height: number, depth: number) => `${Math.round(width)}×${Math.round(height)}×${Math.round(depth)}`;
  const cabinetCount = new Set(project.parts.map((part) => part.meta?.groupId).filter(Boolean)).size;
  const treeSummary = project.parts.length === 0
    ? ''
    : language === 'ru'
      ? `${cabinetCount > 0 ? `${cabinetCount} ${ruPlural(cabinetCount, 'шкаф', 'шкафа', 'шкафов')} · ` : ''}${project.parts.length} дет.`
      : `${cabinetCount > 0 ? `${cabinetCount} cabinet${cabinetCount === 1 ? '' : 's'} · ` : ''}${project.parts.length} parts`;
  const selectionSummary = isMultiSelect
    ? (language === 'ru' ? `${selectedPartIds.length} дет.` : `${selectedPartIds.length} parts`)
    : selectedPart
      ? getPartOwnLabel(selectedPart, language)
      : selected?.type === 'group' && moduleState
        ? moduleState.name
        : '';
  const cabinetSummary = moduleState ? `${moduleState.name} · ${formatSize(moduleState.width, moduleState.height, moduleState.depth)}` : '';
  const quickCabinetSummary = formatSize(cabinetDraft.width, cabinetDraft.height, cabinetDraft.depth);

  return (
    <div ref={panelScrollRef} style={{ zoom: uiScale, fontSize: '80%', width: '100%', borderLeft: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}`, background: isDarkBlue ? '#18181b' : '#fafaf9', color: isDarkBlue ? '#e5e7eb' : '#111', padding: 12, overflow: 'auto', boxSizing: 'border-box' }}>
      <style>{INSPECTOR_CSS}</style>
      <div style={{ display: 'grid', gap: 12 }}>
        {/* Tree first: pick a part here, then edit it in the properties panel below. */}
        <AccordionCard title={t(language, 'projectTree')} summary={treeSummary} open={treeOpen} onToggle={() => setTreeOpen((value) => !value)} isDarkBlue={isDarkBlue} order={panelOrder.tree}>
          <ProjectTree />
        </AccordionCard>

        <div ref={inspectorSelectionRef} style={{ order: panelOrder.selection }}>
          <AccordionCard title={t(language, 'inspectorSelection')} summary={selectionSummary} open={selectionOpen} onToggle={() => setSelectionOpen((value) => !value)} isDarkBlue={isDarkBlue}>
            {isMultiSelect ? (
            <StickySelectionBlock isDarkBlue={isDarkBlue}>
              <div style={{ marginBottom: 12, fontSize: 14, color: panelControlText }}>
                <div><b>{multiSelectedParts.length}</b> {t(language, 'partsSelected')}</div>
                <div style={{ color: mutedTextColor, marginTop: 4, fontSize: 12 }}>
                  {batchRole ? `${t(language, 'batchJoineryAvailableFor')} ${batchRole}s.` : t(language, 'batchJoineryAvailableHint')}
                </div>
              </div>
              {multiSelectedParts.length > 0 ? (() => {
                // Fields show the first part's size; an edit sets that dimension on every selected part.
                const first = multiSelectedParts[0]!;
                const mixed = (key: 'width' | 'height' | 'thickness') => multiSelectedParts.some((part) => Math.abs(part[key] - first[key]) > 0.001);
                const mixedMark = language === 'ru' ? ' · разные' : ' · mixed';
                return (
                  <div style={{ marginBottom: 12 }}>
                    <div style={sectionHeadingStyle}>{language === 'ru' ? 'Размеры, мм (для всех)' : 'Size, mm (all selected)'}</div>
                    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                      <NumberField label={`${language === 'ru' ? 'X · ширина' : 'X · width'}${mixed('width') ? mixedMark : ''}`} value={first.width} onChange={(value) => updatePartsSize(selectedPartIds, { width: value })} />
                      <NumberField label={`${language === 'ru' ? 'Y · высота' : 'Y · height'}${mixed('height') ? mixedMark : ''}`} value={first.height} onChange={(value) => updatePartsSize(selectedPartIds, { height: value })} />
                      <NumberField label={`${language === 'ru' ? 'Z · глубина' : 'Z · depth'}${mixed('thickness') ? mixedMark : ''}`} value={first.thickness} onChange={(value) => updatePartsSize(selectedPartIds, { thickness: value })} />
                    </div>
                  </div>
                );
              })() : null}
              {batchRole ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={sectionHeadingStyle}>{t(language, 'batchJoinery')}</div>
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
                    {jointRuleFields}
                  </div>
                  {batchRole === 'shelf' ? <div style={{ fontSize: 12, color: mutedTextColor, marginTop: 8 }}>{`${t(language, 'joineryShelfPin')}: ${jointRules.shelfPinDiameter} mm`}</div> : null}
                </div>
              ) : null}
            </StickySelectionBlock>
          ) : selectedPart ? (
            <StickySelectionBlock isDarkBlue={isDarkBlue}>
              <PartNameField
                key={selectedPart.id}
                part={selectedPart}
                language={language}
                inputStyle={{ ...textInputStyle, fontWeight: 600 }}
                mutedColor={mutedTextColor}
                onRename={(name) => updatePartName(selectedPart.id, name)}
              />
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <button onClick={() => setPartHidden(selectedPart.id, !selectedPart.meta?.hidden)} title={selectedPart.meta?.hidden ? t(language, 'showElement') : t(language, 'hideElement')} style={partActionButtonStyle}>
                  <IconEye off={Boolean(selectedPart.meta?.hidden)} />
                  {selectedPart.meta?.hidden ? t(language, 'show') : t(language, 'hide')}
                </button>
                <button onClick={duplicateSelected} title={t(language, 'duplicateElement')} style={partActionButtonStyle}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M10.5 3.5V3a.5.5 0 0 0-.5-.5H3a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5h.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  {language === 'ru' ? 'Дублировать' : 'Duplicate'}
                </button>
                {removableSelectedPart ? (
                  <button onClick={removeSelectedCabinetElement} title={t(language, 'removeElement')} aria-label={t(language, 'removeElement')} style={partDangerButtonStyle}>
                    <IconTrash />
                  </button>
                ) : null}
              </div>
              <div style={{ fontSize: 11, color: mutedTextColor, marginBottom: 12 }}>{selectedPartCutSummary}</div>
              <div style={sectionHeadingStyle}>{language === 'ru' ? 'Размеры, мм' : 'Size, mm'}</div>
              {/* Part box axes: width → X, height → Y, thickness → Z (depth for vertical panels). */}
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginBottom: 12 }}>
                <NumberField label={language === 'ru' ? 'X · ширина' : 'X · width'} value={selectedPart.width} onChange={(value) => updatePartSize(selectedPart.id, { width: value })} />
                <NumberField label={language === 'ru' ? 'Y · высота' : 'Y · height'} value={selectedPart.height} onChange={(value) => updatePartSize(selectedPart.id, { height: value })} />
                <NumberField label={language === 'ru' ? 'Z · глубина' : 'Z · depth'} value={selectedPart.thickness} onChange={(value) => updatePartSize(selectedPart.id, { thickness: value })} />
              </div>
              {selectedPart.meta?.role === 'front-left' || selectedPart.meta?.role === 'front-right' || selectedPart.meta?.role === 'front-flap' ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={sectionHeadingStyle}>{t(language, 'hinges')}</div>
                  {selectedPart.meta?.hingeType ? (
                    <div style={{ ...hintStyle, marginBottom: 6 }}>
                      {`${t(language, 'hingeType')}: ${t(language, selectedPart.meta.hingeType === 'inset' ? 'hingeTypeInset' : selectedPart.meta.hingeType === 'half-overlay' ? 'hingeTypeHalfOverlay' : 'hingeTypeOverlay')}`}
                    </div>
                  ) : null}
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
              {selectedPart.meta?.role === 'shelf' || selectedPart.meta?.role === 'bottom' || selectedPart.meta?.role === 'top' ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={sectionHeadingStyle}>{t(language, 'connections')}</div>
                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                    <label>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'leftJoinery')}</div>
                      <select value={selectedPartJoinery.left} onChange={(e) => updatePartJoinery(selectedPart.id, { left: e.target.value as JoineryType })} style={selectControlStyle}>
                        {singleJoineryOptions.map((item) => <option style={optionStyle} key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'rightJoinery')}</div>
                      <select value={selectedPartJoinery.right} onChange={(e) => updatePartJoinery(selectedPart.id, { right: e.target.value as JoineryType })} style={selectControlStyle}>
                        {singleJoineryOptions.map((item) => <option style={optionStyle} key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                    </label>
                    {jointRuleFields}
                  </div>
                  {selectedShelfSpec ? (
                    <div style={{ marginTop: 6 }}>
                      <OptionRow label={t(language, 'shelfApron')} checked={Boolean(selectedShelfSpec.withApron)} onChange={() => setShelfApron(selectedPart.id, !selectedShelfSpec.withApron)} />
                    </div>
                  ) : null}
                </div>
              ) : null}
              {selectedPart.meta?.role === 'partition' || selectedPart.meta?.role === 'drawer-column' || selectedPart.meta?.role === 'drawer-false-panel' ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={sectionHeadingStyle}>{t(language, 'connections')}</div>
                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                    <label>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'topJoinery')}</div>
                      <select value={selectedPartJoinery.top} onChange={(e) => updatePartJoinery(selectedPart.id, { top: e.target.value as JoineryType })} style={selectControlStyle}>
                        {partitionJoineryOptions.map((item) => <option style={optionStyle} key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'bottomJoinery')}</div>
                      <select value={selectedPartJoinery.bottom} onChange={(e) => updatePartJoinery(selectedPart.id, { bottom: e.target.value as JoineryType })} style={selectControlStyle}>
                        {partitionJoineryOptions.map((item) => <option style={optionStyle} key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                    </label>
                    {jointRuleFields}
                  </div>
                </div>
              ) : null}
              {selectedPart.meta?.role === 'apron' || selectedPart.meta?.role === 'back-panel' || selectedPart.meta?.role === 'tier-divider' ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={sectionHeadingStyle}>{t(language, 'connections')}</div>
                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                    {selectedPart.meta?.role !== 'tier-divider' ? (
                      <>
                        <label>
                          <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'topJoinery')}</div>
                          <select value={selectedPartJoinery.top} onChange={(e) => updatePartJoinery(selectedPart.id, { top: e.target.value as JoineryType })} style={selectControlStyle}>
                            {((selectedPart.meta?.role === 'back-panel' || selectedPart.meta?.role === 'apron') ? frameJoineryOptions : nonBackPanelFrameJoineryOptions).map((item) => <option style={optionStyle} key={item.id} value={item.id}>{item.label}</option>)}
                          </select>
                        </label>
                        <label>
                          <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'bottomJoinery')}</div>
                          <select value={selectedPartJoinery.bottom} onChange={(e) => updatePartJoinery(selectedPart.id, { bottom: e.target.value as JoineryType })} style={selectControlStyle}>
                            {((selectedPart.meta?.role === 'back-panel' || selectedPart.meta?.role === 'apron') ? frameJoineryOptions : nonBackPanelFrameJoineryOptions).map((item) => <option style={optionStyle} key={item.id} value={item.id}>{item.label}</option>)}
                          </select>
                        </label>
                      </>
                    ) : null}
                    <label>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'leftJoinery')}</div>
                      <select value={selectedPartJoinery.left} onChange={(e) => updatePartJoinery(selectedPart.id, { left: e.target.value as JoineryType })} style={selectControlStyle}>
                        {(selectedPart.meta?.role === 'tier-divider'
                          ? tierDividerJoineryOptions
                          : selectedPart.meta?.role === 'back-panel' || selectedPart.meta?.role === 'apron'
                            ? frameJoineryOptions
                            : nonBackPanelFrameJoineryOptions).map((item) => <option style={optionStyle} key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'rightJoinery')}</div>
                      <select value={selectedPartJoinery.right} onChange={(e) => updatePartJoinery(selectedPart.id, { right: e.target.value as JoineryType })} style={selectControlStyle}>
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
              {selectedDrillOp ? (
                <div style={{ marginBottom: 12, padding: 10, border: `1px solid ${panelControlBorder}`, borderRadius: 8, background: isDarkBlue ? '#18181b' : '#fafaf9' }}>
                  <div style={sectionHeadingStyle}>{t(language, 'holeMove')}</div>
                  <div style={{ fontSize: 12, color: mutedTextColor, marginBottom: 8 }}>
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

            </StickySelectionBlock>
          ) : selected?.type === 'group' && moduleState ? (
            <StickySelectionBlock isDarkBlue={isDarkBlue}>
              <div style={{ color: panelControlText }}>{t(language, 'selectedGroup')}: <b>{moduleState.name}</b></div>
              <div style={{ marginTop: 12 }}>
                <button onClick={duplicateSelected} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${panelControlBorder}`, background: panelControlBg, color: panelControlText, cursor: 'pointer' }}>
                  {t(language, 'duplicateCabinet')}
                </button>
              </div>
            </StickySelectionBlock>
          ) : (
            <StickySelectionBlock isDarkBlue={isDarkBlue}>
              <div style={{ color: mutedTextColor }}>{t(language, 'nothingSelected')}</div>
            </StickySelectionBlock>
          )}

          {/* Part tools live inside the properties panel: they only act on the current selection. */}
          {selected ? (
            <SubSection sectionRef={movePanelRef} title={t(language, 'moveRelativePanel')} open={moveOpen} onToggle={() => setMoveOpen((value) => !value)} isDarkBlue={isDarkBlue}>
            <div style={sectionHeadingStyle}>{language === 'ru' ? 'Сдвиг по оси' : 'Move along axis'}</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
              {/* Axis colors follow the 3D convention: X red, Y green, Z blue. */}
              <div role="radiogroup" aria-label={t(language, 'axis')} style={{ flex: '0 0 auto', display: 'flex', height: 35, border: `1px solid ${panelControlBorder}`, borderRadius: 7, overflow: 'hidden' }}>
                {(['x', 'y', 'z'] as const).map((axis) => {
                  const axisActive = moveDraft.axis === axis;
                  return (
                    <button
                      key={axis}
                      role="radio"
                      aria-checked={axisActive}
                      onClick={() => setMoveDraft({ axis })}
                      style={{ width: 32, border: 'none', borderRight: axis !== 'z' ? `1px solid ${panelControlBorder}` : 'none', background: axisActive ? AXIS_COLORS[axis] : panelControlBg, color: axisActive ? '#fff' : AXIS_COLORS[axis], fontWeight: 700, cursor: 'pointer' }}
                    >
                      {axis.toUpperCase()}
                    </button>
                  );
                })}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <NumberField label={language === 'ru' ? 'Расстояние, мм' : 'Distance, mm'} value={Math.abs(moveDraft.distance)} onChange={(value) => setMoveDraft({ distance: Math.abs(value) })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {([-1, 1] as const).map((sign) => (
                <button
                  key={sign}
                  onClick={() => moveAlongAxis(sign)}
                  disabled={!moveDraft.distance}
                  title={language === 'ru' ? `Сдвинуть на ${sign < 0 ? '−' : '+'}${Math.abs(moveDraft.distance)} мм по ${moveDraft.axis.toUpperCase()}` : `Move ${sign < 0 ? '−' : '+'}${Math.abs(moveDraft.distance)} mm along ${moveDraft.axis.toUpperCase()}`}
                  style={{ ...partActionButtonStyle, fontWeight: 600, opacity: moveDraft.distance ? 1 : 0.5, cursor: moveDraft.distance ? 'pointer' : 'default' }}
                >
                  {`${sign < 0 ? '−' : '+'}${moveDraft.axis.toUpperCase()}`}
                </button>
              ))}
              <button onClick={rotateSelected90} title={t(language, 'rotate90')} style={{ ...partActionButtonStyle, flex: '0 0 auto' }}>↻ 90°</button>
            </div>
            {localizedValidationErrors.length > 0 ? (
              <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: isDarkBlue ? '#3b1515' : '#fef2f2', border: `1px solid ${isDarkBlue ? '#7f1d1d' : '#fecaca'}`, color: isDarkBlue ? '#fca5a5' : '#991b1b', fontSize: 12 }}>
                {localizedValidationErrors.map((err) => <div key={err}>{err}</div>)}
              </div>
            ) : null}
            <div style={{ ...sectionHeadingStyle, marginTop: 14 }}>{t(language, 'moveRelative')}</div>
            <div style={{ display: 'grid', gap: 8 }}>
              <label>
                <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'targetPart')}</div>
                <select value={moveDraft.targetPartId} onChange={(e) => setMoveDraft({ targetPartId: e.target.value })} style={selectControlStyle}>
                  <option style={optionStyle} value="">{language === 'ru' ? 'Выберите деталь…' : 'Choose a part…'}</option>
                  {targetOptions.map((part) => <option style={optionStyle} key={part.id} value={part.id}>{getLocalizedPartName(part, language)}</option>)}
                </select>
              </label>
              <label>
                <div style={{ fontSize: 12, marginBottom: 4 }}>{t(language, 'relativeRule')}</div>
                <select value={moveDraft.relativeRule} onChange={(e) => setMoveDraft({ relativeRule: e.target.value as RelativePlacementRule })} style={selectControlStyle}>
                  {ruleOptions.map((item) => <option style={optionStyle} key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <NumberField label={language === 'ru' ? 'Отступ, мм' : 'Offset, mm'} value={moveDraft.offset} onChange={(value) => setMoveDraft({ offset: value })} />
                </div>
                <button
                  onClick={applyRelativeMove}
                  disabled={!moveDraft.targetPartId}
                  title={t(language, 'applyRelative')}
                  style={{ flex: '0 0 auto', height: 35, padding: '0 14px', borderRadius: 7, border: '1px solid #f59e0b', background: moveDraft.targetPartId ? '#f59e0b' : 'transparent', color: moveDraft.targetPartId ? '#111' : mutedTextColor, fontWeight: 600, cursor: moveDraft.targetPartId ? 'pointer' : 'default', opacity: moveDraft.targetPartId ? 1 : 0.6 }}
                >
                  {language === 'ru' ? 'Поставить' : 'Place'}
                </button>
              </div>
            </div>
            {experimentalMoveMode ? (
              <div style={{ marginTop: 14, padding: 10, border: `1px solid ${panelControlBorder}`, borderRadius: 10, background: isDarkBlue ? '#18181b' : '#fafaf9' }}>
                <div style={sectionHeadingStyle}>{t(language, 'smartSnap')}</div>
              {snapCandidates.length === 0 ? <div style={{ color: isDarkBlue ? '#a1a1aa' : '#666', fontSize: 13 }}>{t(language, 'noCandidates')}</div> : <div style={{ display: 'grid', gap: 8 }}>{snapCandidates.map((candidate) => <button key={candidate.id} onClick={() => applySnapCandidate(candidate.id)} style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: `1px solid ${panelControlBorder}`, background: panelControlBg, color: panelControlText, cursor: 'pointer' }}>{candidate.label}</button>)}</div>}
              </div>
            ) : null}
            </SubSection>
          ) : null}

          </AccordionCard>
        </div>

        {moduleState ? (
          <div ref={cabinetPanelRef} style={{ order: panelOrder.cabinet }}>
          <AccordionCard title={t(language, 'cabinet')} summary={cabinetSummary} open={cabinetOpen} onToggle={() => setCabinetOpen((value) => !value)} isDarkBlue={isDarkBlue}>
            <CommitTextInput
              value={moduleState.name}
              onCommit={(name) => updateCabinetModule(moduleState.groupId, { name })}
              ariaLabel={t(language, 'moduleName')}
              style={{ ...textInputStyle, fontWeight: 600 }}
            />

            <div ref={cabinetBodyRef} style={cabinetGroupStyle}>
              <div style={sectionHeadingStyle}>{language === 'ru' ? 'Корпус, мм' : 'Body, mm'}</div>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                <NumberField label={t(language, 'width')} value={moduleState.width} onChange={(value) => { handleCabinetSizeInput(moduleState.groupId, 'width', value); updateCabinetModule(moduleState.groupId, { width: value }); }} />
                <NumberField label={t(language, 'height')} value={moduleState.height} onChange={(value) => { handleCabinetSizeInput(moduleState.groupId, 'height', value); updateCabinetModule(moduleState.groupId, { height: value }); }} />
                <NumberField label={t(language, 'depth')} value={moduleState.depth} onChange={(value) => updateCabinetModule(moduleState.groupId, { depth: value })} />
                {renderSizeLimitHints(moduleState.groupId)}
              </div>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', marginTop: 8 }}>
                <NumberField label={t(language, 'thickness')} value={moduleState.thickness} onChange={(value) => updateCabinetModule(moduleState.groupId, { thickness: value })} />
                <label>
                  <div style={fieldLabelStyle}>{t(language, 'topMode')}</div>
                  <select value={moduleState.topMode} onChange={(e) => updateCabinetModule(moduleState.groupId, { topMode: e.target.value as 'overlay' | 'inset' })} style={selectControlStyle}>
                    <option style={optionStyle} value="overlay">{t(language, 'topOverlay')}</option>
                    <option style={optionStyle} value="inset">{t(language, 'topInset')}</option>
                  </select>
                </label>
              </div>
              <div style={{ marginTop: 6 }}>
                <OptionRow label={t(language, 'backPanel')} checked={moduleState.withBackPanel} onChange={() => updateCabinetModule(moduleState.groupId, { withBackPanel: !moduleState.withBackPanel })}>
                  {moduleState.withBackPanel ? (
                    <BackPanelKindSelect language={language} value={moduleState.backPanelKind} onChange={(backPanelKind) => updateCabinetModule(moduleState.groupId, { backPanelKind })} style={selectControlStyle} optionStyle={optionStyle} />
                  ) : null}
                </OptionRow>
                {moduleState.withBackPanel && moduleState.backPanelKind !== 'panel' ? (
                  <OptionRow label={t(language, 'wallHangers')} checked={moduleState.withHangers} onChange={() => updateCabinetModule(moduleState.groupId, { withHangers: !moduleState.withHangers })} />
                ) : null}
                <OptionRow label={t(language, 'plinth')} checked={moduleState.withPlinth} onChange={() => updateCabinetModule(moduleState.groupId, { withPlinth: !moduleState.withPlinth })}>
                  {moduleState.withPlinth ? <NumberField ariaLabel={t(language, 'plinthHeight')} value={moduleState.plinthHeight} onChange={(value) => updateCabinetModule(moduleState.groupId, { plinthHeight: value })} /> : null}
                  {moduleState.withPlinth && (kitchenMode || moduleState.plinthKind === 'kitchen') ? <PlinthKindSelect language={language} value={moduleState.plinthKind} onChange={(plinthKind) => updateCabinetModule(moduleState.groupId, { plinthKind })} style={selectControlStyle} optionStyle={optionStyle} /> : null}
                </OptionRow>
                {kitchenMode || moduleState.backRailElevations.length > 0 ? <BackRailElevationsField language={language} value={moduleState.backRailElevations} onChange={(backRailElevations) => updateCabinetModule(moduleState.groupId, { backRailElevations })} style={selectControlStyle} /> : null}
                <OptionRow label={t(language, 'topDecorRails')} checked={moduleState.withTopRails} onChange={() => updateCabinetModule(moduleState.groupId, { withTopRails: !moduleState.withTopRails })}>
                  {moduleState.withTopRails ? <NumberField ariaLabel={t(language, 'topRailHeight')} value={moduleState.topRailHeight} onChange={(value) => updateCabinetModule(moduleState.groupId, { topRailHeight: value })} /> : null}
                </OptionRow>
                <OptionRow label={t(language, 'aprons')} checked={moduleState.withAprons} onChange={() => updateCabinetModule(moduleState.groupId, { withAprons: !moduleState.withAprons })} />
                <OptionRow label={t(language, 'topOverFronts')} checked={moduleState.topOverFronts} onChange={() => updateCabinetModule(moduleState.groupId, { topOverFronts: !moduleState.topOverFronts })} />
              </div>
            </div>

            <div ref={tiersRef} style={cabinetGroupStyle}>
              <div style={sectionHeadingStyle}>{t(language, 'cabinetTiersSection')}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {tierOptions.map((tier) => {
                  const tierActive = activeSection?.tierId === tier.tierId;
                  return (
                    <button
                      key={tier.tierId}
                      aria-pressed={tierActive}
                      onClick={() => {
                        const nextSection = leafSections.find((section) => section.tierId === tier.tierId) ?? null;
                        setSelectedSection(moduleState.groupId, nextSection?.id ?? null, nextSection?.tierId ?? null, null);
                      }}
                      style={chipStyle(tierActive)}
                    >
                      {`${t(language, 'tier')} ${tier.tierIndex + 1}`}
                    </button>
                  );
                })}
                <button
                  onClick={() => updateCabinetModule(moduleState.groupId, { tierCount: Math.max(1, Math.round(moduleState.tierCount + 1)) })}
                  title={t(language, 'addTierAction')}
                  style={{ ...chipStyle(false), borderStyle: 'dashed' }}
                >
                  + {language === 'ru' ? 'Ярус' : 'Tier'}
                </button>
              </div>
              {activeSection && moduleState.tierCount > 1 ? (
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', marginTop: 8 }}>
                  <NumberField label={language === 'ru' ? 'Высота яруса, мм' : 'Tier height, mm'} value={Math.round(activeSection.clearHeight)} onChange={(value) => updateSelectedCabinetTierHeight(value)} />
                </div>
              ) : null}
              {activeTierSections.length > 0 ? (
                <>
                  <div style={{ ...fieldLabelStyle, marginTop: 10 }}>
                    {language === 'ru' ? 'Секции яруса, мм' : 'Tier sections, mm'}
                    {activeTierSections.length > 1 ? <span style={{ color: mutedTextColor }}>{language === 'ru' ? ' · нажмите название, чтобы выбрать' : ' · click a name to select'}</span> : null}
                  </div>
                  {/* Each card selects its section (name) and sets its clear width (field). */}
                  <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))' }}>
                    {activeTierSections.map((section, index) => {
                      const sectionActive = activeSection?.id === section.id;
                      return (
                        <div
                          key={section.id}
                          style={{
                            padding: 4,
                            borderRadius: 8,
                            border: `1px solid ${sectionActive ? '#f59e0b' : panelControlBorder}`,
                            background: sectionActive ? (isDarkBlue ? 'rgba(245,158,11,0.08)' : '#fff7ed') : 'transparent',
                          }}
                        >
                          <button
                            aria-pressed={sectionActive}
                            onClick={() => setSelectedSection(moduleState.groupId, section.id, section.tierId, null)}
                            style={{ width: '100%', padding: '2px 2px 4px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 11, fontWeight: 600, color: sectionActive ? (isDarkBlue ? '#fde68a' : '#9a3412') : panelControlText }}
                          >
                            {`${t(language, 'section')} ${index + 1}`}
                          </button>
                          {activeTierSections.length > 1 ? (
                            <NumberField
                              ariaLabel={`${t(language, 'section')} ${index + 1}`}
                              value={sectionWidths[index] ?? 0}
                              onChange={(value) => updateSelectedCabinetSectionWidths(activeTierSections.map((item, itemIndex) => itemIndex === index ? value : (sectionWidths[itemIndex] ?? Math.round(getLeafSectionInnerSpan(moduleState, item).width))), activeSection?.id, activeSection?.tierId, index)}
                            />
                          ) : (
                            <div style={{ padding: '6px 2px', fontSize: 13, color: mutedTextColor }}>{sectionWidths[index] ?? 0}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}
              {localZones.length > 1 ? (
                <label style={{ display: 'block', marginTop: 8 }}>
                  <div style={fieldLabelStyle}>{t(language, 'chooseLocalTier')}</div>
                  <select
                    value={activeLocalZone?.id ?? ''}
                    onChange={(e) => setSelectedSection(moduleState.groupId, activeSection?.id ?? null, activeSection?.tierId ?? null, e.target.value || null)}
                    style={selectControlStyle}
                  >
                    {localZones.map((zone) => (
                      <option style={optionStyle} key={zone.id} value={zone.id}>{`${t(language, 'localTier')} ${zone.zoneIndex + 1} (${Math.round(zone.clearHeight)} ${language === 'ru' ? 'мм' : 'mm'})`}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            <div ref={partitionsShelvesRef} style={cabinetGroupStyle}>
              <div style={sectionHeadingStyle}>{t(language, 'cabinetPartitionsShelvesSection')}</div>
              {activeSectionLabel ? <div style={hintStyle}>{activeSectionLabel}</div> : null}
              <div style={{ display: 'grid', gap: 6, gridTemplateColumns: '1fr 1fr' }}>
                <button onClick={addShelfToSelectedGroup} title={t(language, 'addShelfAction')} style={gridButtonStyle}>+ {language === 'ru' ? 'Полка' : 'Shelf'}</button>
                <button onClick={addPartitionToSelectedGroup} title={t(language, 'addPartitionAction')} style={gridButtonStyle}>+ {language === 'ru' ? 'Перегородка' : 'Partition'}</button>
                <button onClick={toggleBackPanelForSelectedGroup} title={t(language, 'toggleBackPanelAction')} style={gridButtonStyle}>⇄ {language === 'ru' ? 'Задняя стенка' : 'Back panel'}</button>
              </div>
            </div>

            {activeSection ? (
              <div ref={drawersRef} style={cabinetGroupStyle}>
                <button
                  className="insp-toggle"
                  onClick={toggleDrawersOpen}
                  aria-expanded={drawersOpen}
                  style={{ ...sectionHeadingStyle, width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ fontSize: 8, lineHeight: 1, display: 'inline-block', transform: drawersOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 150ms ease' }}>▼</span>
                  <span>{language === 'ru' ? 'Ящики' : 'Drawers'}</span>
                  {/* Collapsed: a short state so the block is still readable at a glance. */}
                  {!drawersOpen ? (
                    <span style={{ marginLeft: 'auto', fontWeight: 400, letterSpacing: 0, textTransform: 'none', fontSize: 11 }}>
                      {activeDrawerBlock
                        ? `${activeDrawerBlock.drawerCount} × ${drawerBlockValues.slotHeight} ${language === 'ru' ? 'мм' : 'mm'}`
                        : (language === 'ru' ? 'нет' : 'none')}
                    </span>
                  ) : null}
                </button>
                {drawersOpen ? (<>
                {activeSectionLabel ? <div style={hintStyle}>{activeSectionLabel}</div> : null}
                <div style={{ display: 'grid', gap: 6, gridTemplateColumns: '1fr 1fr', marginBottom: 8 }}>
                  {(['bottom', 'top'] as const).map((anchor) => (
                    <button
                      key={anchor}
                      aria-pressed={drawerBlockAnchor === anchor}
                      onClick={() => setDrawerBlockAnchor(anchor)}
                      style={{ ...gridButtonStyle, ...(drawerBlockAnchor === anchor ? { border: '1px solid #f59e0b', fontWeight: 700 } : null) }}
                    >
                      {anchor === 'bottom' ? (language === 'ru' ? 'Внизу секции' : 'Section bottom') : (language === 'ru' ? 'Вверху секции' : 'Section top')}
                    </button>
                  ))}
                </div>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, marginBottom: 8 }}>
                  <input type="checkbox" checked={drawerBlockValues.fill} onChange={(e) => updateDrawerBlockField({ fill: e.target.checked })} />
                  {t(language, 'drawerBlockFill')}
                </label>
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
                  <NumberField
                    label={language === 'ru' ? 'Ящиков (в колонке)' : 'Drawers (per column)'}
                    value={drawerBlockValues.drawerCount}
                    onChange={(value) => updateDrawerBlockField({ drawerCount: Math.max(1, Math.min(maxBlockDrawerCount, Math.round(value))) })}
                  />
                  {drawerBlockValues.fill ? (
                    <div style={{ ...hintStyle, alignSelf: 'end', marginBottom: 10 }}>{t(language, 'drawerBlockFillHint')}</div>
                  ) : (
                    <NumberField
                      label={language === 'ru' ? 'Высота ящика, мм' : 'Drawer height, mm'}
                      value={drawerBlockValues.slotHeight}
                      onChange={(value) => updateDrawerBlockField({ slotHeight: Math.max(MIN_DRAWER_SLOT_HEIGHT, Math.min(600, Math.round(value))) })}
                    />
                  )}
                </div>
                <div style={{ marginTop: 8 }}>
                  <NumberField
                    label={drawerBlockAnchor === 'bottom'
                      ? (language === 'ru' ? 'Ниша под ящиками, мм (0 — без ниши)' : 'Niche below drawers, mm (0 — none)')
                      : (language === 'ru' ? 'Ниша над ящиками, мм (0 — без ниши)' : 'Niche above drawers, mm (0 — none)')}
                    value={drawerBlockValues.offset}
                    onChange={(value) => updateDrawerBlockField({ offset: Math.max(0, Math.min(maxDrawerBlockOffset, Math.round(value))) })}
                  />
                </div>
                <div style={{ ...fieldLabelStyle, marginTop: 8 }}>{language === 'ru' ? 'Колонок' : 'Columns'}</div>
                <div style={{ display: 'grid', gap: 6, gridTemplateColumns: `repeat(${MAX_DRAWER_BLOCK_COLUMNS}, 1fr)` }}>
                  {Array.from({ length: MAX_DRAWER_BLOCK_COLUMNS }, (_, index) => index + 1).map((columns) => (
                    <button
                      key={columns}
                      aria-pressed={drawerBlockValues.columns === columns}
                      onClick={() => updateDrawerBlockField({ columns })}
                      style={{ ...gridButtonStyle, ...(drawerBlockValues.columns === columns ? { border: '1px solid #f59e0b', fontWeight: 700 } : null) }}
                    >
                      {columns}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', marginTop: 8 }}>
                  <label>
                    <div style={fieldLabelStyle}>{language === 'ru' ? 'Длина направляющих' : 'Runner length'}</div>
                    <select
                      value={drawerBlockValues.runnerLengthMode === 'auto' ? 'auto' : drawerBlockValues.runnerLength}
                      onChange={(e) => updateDrawerBlockField(e.target.value === 'auto'
                        ? { runnerLengthMode: 'auto' }
                        : { runnerLengthMode: 'manual', runnerLength: Number(e.target.value) as DrawerRunnerLength })}
                      title={t(language, 'runnerLength')}
                      style={selectControlStyle}
                    >
                      <option style={optionStyle} value="auto">{`${t(language, 'autoLength')} · ${activeAutoDrawerRunnerLength}`}</option>
                      {DRAWER_RUNNER_LENGTHS.map((length) => (
                        <option style={optionStyle} key={length} value={length}>{`${length}`}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <div style={fieldLabelStyle}>{language === 'ru' ? 'Открывание' : 'Opening'}</div>
                    <select value={moduleState.frontOpeningMode} onChange={(e) => updateCabinetModule(moduleState.groupId, { frontOpeningMode: e.target.value as 'handleless' | 'handles' })} title={t(language, 'openingModeDrawers')} style={selectControlStyle}>
                      <option style={optionStyle} value="handleless">{t(language, 'handlelessProfile')}</option>
                      <option style={optionStyle} value="handles">{t(language, 'installedHandles')}</option>
                    </select>
                  </label>
                </div>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, marginTop: 8 }}>
                  <input type="checkbox" checked={drawerBlockValues.withBackPanel} onChange={(e) => updateDrawerBlockField({ withBackPanel: e.target.checked })} />
                  {language === 'ru' ? 'Задняя стенка блока' : 'Block back panel'}
                </label>
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', marginTop: 8 }}>
                  <label>
                    <div style={fieldLabelStyle}>{t(language, 'drawerFrontMode')}</div>
                    <select
                      value={drawerBlockValues.frontMode ?? 'cabinet'}
                      onChange={(e) => updateDrawerBlockField({ frontMode: e.target.value === 'cabinet' ? null : e.target.value as DrawerFrontMode })}
                      style={selectControlStyle}
                    >
                      <option style={optionStyle} value="cabinet">{`${t(language, 'drawerFrontModeCabinet')} · ${t(language, moduleState.frontMode === 'inset' ? 'insetFronts' : 'overlayFronts').toLowerCase()}`}</option>
                      <option style={optionStyle} value="inset">{t(language, 'insetFronts')}</option>
                      <option style={optionStyle} value="overlay">{t(language, 'overlayFronts')}</option>
                    </select>
                  </label>
                  <NumberField
                    label={t(language, 'drawerRecess')}
                    value={drawerBlockValues.recess ?? 0}
                    onChange={(value) => updateDrawerBlockField({ recess: Math.max(0, Math.min(200, Math.round(value))) })}
                  />
                </div>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(drawerBlockValues.falsePanel)}
                    onChange={(e) => updateDrawerBlockField({
                      falsePanel: e.target.checked ? { side: sectionDoorHinge === 'right' ? 'right' : 'left', gap: DEFAULT_DRAWER_FALSE_PANEL_GAP } : null,
                    })}
                  />
                  {t(language, 'drawerFalsePanel')}
                </label>
                {drawerBlockValues.falsePanel ? (
                  <>
                    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', marginTop: 8 }}>
                      <label>
                        <div style={fieldLabelStyle}>{t(language, 'drawerFalsePanelSide')}</div>
                        <select
                          value={drawerBlockValues.falsePanel.side}
                          onChange={(e) => updateDrawerBlockField({ falsePanel: { ...drawerBlockValues.falsePanel!, side: e.target.value as DrawerFalsePanelSpec['side'] } })}
                          style={selectControlStyle}
                        >
                          <option style={optionStyle} value="left">{t(language, 'left')}</option>
                          <option style={optionStyle} value="right">{t(language, 'right')}</option>
                        </select>
                      </label>
                      <NumberField
                        label={t(language, 'drawerFalsePanelGap')}
                        value={drawerBlockValues.falsePanel.gap}
                        onChange={(value) => updateDrawerBlockField({ falsePanel: { ...drawerBlockValues.falsePanel!, gap: Math.max(0, Math.min(300, Math.round(value))) } })}
                      />
                    </div>
                    {drawerFalsePanelPart ? (
                      <label style={{ display: 'block', marginTop: 8 }}>
                        <div style={fieldLabelStyle}>{t(language, 'drawerFalsePanelFastening')}</div>
                        <select
                          value={drawerFalsePanelPart.meta?.joinery?.top === 'rafix' ? 'rafix' : 'confirmat'}
                          onChange={(e) => updatePartJoinery(drawerFalsePanelPart.id, { top: e.target.value as JoineryType, bottom: e.target.value as JoineryType })}
                          style={selectControlStyle}
                        >
                          <option style={optionStyle} value="confirmat">{t(language, 'joineryConfirmat')}</option>
                          <option style={optionStyle} value="rafix">{t(language, 'joineryRafix')}</option>
                        </select>
                      </label>
                    ) : null}
                    <div style={{ ...hintStyle, marginTop: 6, marginBottom: 0 }}>{t(language, 'drawerFalsePanelHint')}</div>
                  </>
                ) : null}
                <div style={{ ...hintStyle, marginTop: 8, marginBottom: 0 }}>
                  {/* A built block shows its real front height (overlay fronts reach over the panels); a draft uses the formula. */}
                  {`${t(language, 'drawerFrontHeight')}: ${Math.round(
                    (activeDrawerBlock
                      ? project.parts.find((part) => part.meta?.groupId === moduleState.groupId && part.meta?.role === 'drawer-front' && (part.meta.sourceId ?? '').startsWith(`${activeDrawerBlock.id}:`))?.height
                      : undefined)
                    ?? getDrawerBlockFacadeHeight(drawerBlockValues.slotHeight, drawerBlockValues.drawerCount, moduleState.frontOpeningMode)
                  )} ${language === 'ru' ? 'мм' : 'mm'} · `}
                  {language === 'ru'
                    ? `Высота блока: ${drawerBlockValues.fill ? 'вся секция' : `${drawerBlockValues.drawerCount * drawerBlockValues.slotHeight} мм`} · макс. ящиков: ${maxBlockDrawerCount}`
                    : `Block height: ${drawerBlockValues.fill ? 'whole section' : `${drawerBlockValues.drawerCount * drawerBlockValues.slotHeight} mm`} · max drawers: ${maxBlockDrawerCount}`}
                </div>
                <button
                  onClick={() => (activeDrawerBlock ? removeSelectedSectionDrawerBlock(drawerBlockAnchor) : commitDrawerBlock(drawerBlockValues))}
                  style={{ ...gridButtonStyle, marginTop: 8, width: '100%' }}
                >
                  {activeDrawerBlock ? (language === 'ru' ? 'Удалить ящики' : 'Remove drawers') : (language === 'ru' ? '+ Ящики' : '+ Drawers')}
                </button>
                </>) : null}
              </div>
            ) : null}

            <div style={cabinetGroupStyle}>
              <div style={sectionHeadingStyle}>{language === 'ru' ? 'Фасады' : 'Fronts'}</div>
              <label style={{ display: 'block' }}>
                <div style={fieldLabelStyle}>{t(language, 'frontMode')}</div>
                <select value={moduleState.frontMode} onChange={(e) => updateCabinetModule(moduleState.groupId, { frontMode: e.target.value as 'overlay' | 'inset' })} style={selectControlStyle}>
                  <option style={optionStyle} value="inset">{t(language, 'insetFronts')}</option>
                  <option style={optionStyle} value="overlay">{t(language, 'overlayFronts')}</option>
                </select>
              </label>
              {/* The opening is picked in 3D; these buttons only say what goes into it. */}
              <div style={{ ...hintStyle, marginTop: 8 }}>
                {activeOpening
                  ? `${t(language, 'opening')}: ${t(language, 'tier')} ${activeOpening.tierIndex + 1} · ${t(language, 'section')} ${activeOpening.sectionNumber} · ${Math.round(activeOpening.height)} × ${Math.round(activeOpening.width)} ${language === 'ru' ? 'мм' : 'mm'}`
                  : t(language, 'pickOpeningHint')}
              </div>
              {activeOpening ? (
                <div style={{ display: 'grid', gap: 6, gridTemplateColumns: '1fr 1fr' }}>
                  {FRONT_CHOICES.map((choice) => {
                    const active = activeOpening.front?.kind === choice.kind && (choice.kind === 'double' || activeOpening.front?.hinge === choice.hinge);
                    return (
                      <button
                        key={choice.labelKey}
                        aria-pressed={active}
                        onClick={() => setFrontOnSelectedOpening({ kind: choice.kind, hinge: choice.hinge })}
                        style={{ ...gridButtonStyle, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', ...(active ? { border: '1px solid #f59e0b', fontWeight: 700 } : null) }}
                      >
                        <FrontIcon kind={choice.kind} hinge={choice.hinge} size={26} />
                        <span style={{ minWidth: 0 }}>{t(language, choice.labelKey)}</span>
                      </button>
                    );
                  })}
                  <button onClick={() => setFrontOnSelectedOpening(null)} disabled={!activeOpening.hasFront} style={{ ...gridButtonStyle, opacity: activeOpening.hasFront ? 1 : 0.5 }}>
                    {`✕ ${t(language, 'removeFront')}`}
                  </button>
                </div>
              ) : null}
              <div style={{ display: 'grid', gap: 6, gridTemplateColumns: '1fr 1fr', marginTop: 8 }}>
                <button onClick={() => setFrontsOnAllOpenings(moduleState.groupId)} style={gridButtonStyle}>{t(language, 'frontsOnAllSections')}</button>
                <button onClick={() => clearAllFronts(moduleState.groupId)} style={gridButtonStyle}>{t(language, 'removeAllFronts')}</button>
              </div>
            </div>
          </AccordionCard>
          </div>
        ) : null}

        <div ref={quickCabinetPanelRef} style={{ order: panelOrder.quickCabinet }}>
        <AccordionCard title={t(language, 'quickCabinet')} summary={quickCabinetSummary} open={quickCabinetOpen} onToggle={() => setQuickCabinetOpen((value) => !value)} isDarkBlue={isDarkBlue} accent={!hasCabinets}>
          {/* A preset builds a finished piece (drawers, doors) at once; the fields below are for a custom cabinet. */}
          <div style={sectionHeadingStyle}>{t(language, 'presets')}</div>
          <div style={{ display: 'grid', gap: 6, gridTemplateColumns: '1fr 1fr', marginBottom: 12 }}>
            {CABINET_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => addCabinetPreset(preset.id)}
                title={`${t(language, preset.labelKey)} · ${preset.input.width}×${preset.input.height}×${preset.input.depth} ${language === 'ru' ? 'мм' : 'mm'}`}
                style={gridButtonStyle}
              >
                + {t(language, preset.labelKey)}
              </button>
            ))}
          </div>
          <div style={sectionHeadingStyle}>{language === 'ru' ? 'Размеры, мм' : 'Size, mm'}</div>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <NumberField label={t(language, 'width')} value={cabinetDraft.width} onChange={(value) => { handleCabinetSizeInput('draft', 'width', value); updateCabinetDraft({ width: value }); }} />
            <NumberField label={t(language, 'height')} value={cabinetDraft.height} onChange={(value) => { handleCabinetSizeInput('draft', 'height', value); updateCabinetDraft({ height: value }); }} />
            <NumberField label={t(language, 'depth')} value={cabinetDraft.depth} onChange={(value) => updateCabinetDraft({ depth: value })} />
            {renderSizeLimitHints('draft')}
          </div>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', marginTop: 8 }}>
            <NumberField label={t(language, 'thickness')} value={cabinetDraft.thickness} onChange={(value) => updateCabinetDraft({ thickness: value })} />
            <label>
              <div style={fieldLabelStyle}>{t(language, 'topMode')}</div>
              <select value={cabinetDraft.topMode} onChange={(e) => updateCabinetDraft({ topMode: e.target.value as 'overlay' | 'inset' })} style={selectControlStyle}>
                <option style={optionStyle} value="overlay">{t(language, 'topOverlay')}</option>
                <option style={optionStyle} value="inset">{t(language, 'topInset')}</option>
              </select>
            </label>
          </div>

          <div style={cabinetGroupStyle}>
            <div style={sectionHeadingStyle}>{language === 'ru' ? 'Структура' : 'Layout'}</div>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              <NumberField label={t(language, 'tiers')} value={cabinetDraft.tierCount} onChange={(value) => updateCabinetDraft({ tierCount: Math.max(1, Math.round(value)) })} />
              <NumberField label={t(language, 'partitions')} value={cabinetDraft.partitionCount} onChange={(value) => updateCabinetDraft({ partitionCount: Math.max(0, Math.round(value)) })} />
            </div>
            <OptionRow label={t(language, 'withFronts')} checked={cabinetDraft.withFronts} onChange={() => updateCabinetDraft({ withFronts: !cabinetDraft.withFronts })} />
            <label style={{ display: 'block' }}>
              <div style={fieldLabelStyle}>{t(language, 'openingModeDrawers')}</div>
              <select value={cabinetDraft.frontOpeningMode} onChange={(e) => updateCabinetDraft({ frontOpeningMode: e.target.value as 'handleless' | 'handles' })} style={selectControlStyle}>
                <option style={optionStyle} value="handleless">{t(language, 'handlelessProfile')}</option>
                <option style={optionStyle} value="handles">{t(language, 'installedHandles')}</option>
              </select>
            </label>
          </div>

          <div style={cabinetGroupStyle}>
            <div style={sectionHeadingStyle}>{language === 'ru' ? 'Корпус' : 'Body'}</div>
            <OptionRow label={t(language, 'backPanel')} checked={cabinetDraft.withBackPanel} onChange={() => updateCabinetDraft({ withBackPanel: !cabinetDraft.withBackPanel })}>
              {cabinetDraft.withBackPanel ? (
                <BackPanelKindSelect language={language} value={cabinetDraft.backPanelKind} onChange={(backPanelKind) => updateCabinetDraft({ backPanelKind })} style={selectControlStyle} optionStyle={optionStyle} />
              ) : null}
            </OptionRow>
            {cabinetDraft.withBackPanel && cabinetDraft.backPanelKind !== 'panel' ? (
              <OptionRow label={t(language, 'wallHangers')} checked={cabinetDraft.withHangers} onChange={() => updateCabinetDraft({ withHangers: !cabinetDraft.withHangers })} />
            ) : null}
            <OptionRow label={t(language, 'plinth')} checked={cabinetDraft.withPlinth} onChange={() => updateCabinetDraft({ withPlinth: !cabinetDraft.withPlinth })}>
              {cabinetDraft.withPlinth ? <NumberField ariaLabel={t(language, 'plinthHeight')} value={cabinetDraft.plinthHeight} onChange={(value) => updateCabinetDraft({ plinthHeight: value })} /> : null}
              {cabinetDraft.withPlinth && (kitchenMode || cabinetDraft.plinthKind === 'kitchen') ? <PlinthKindSelect language={language} value={cabinetDraft.plinthKind} onChange={(plinthKind) => updateCabinetDraft({ plinthKind })} style={selectControlStyle} optionStyle={optionStyle} /> : null}
            </OptionRow>
            {kitchenMode || cabinetDraft.backRailElevations.length > 0 ? <BackRailElevationsField language={language} value={cabinetDraft.backRailElevations} onChange={(backRailElevations) => updateCabinetDraft({ backRailElevations })} style={selectControlStyle} /> : null}
            <OptionRow label={t(language, 'topDecorRails')} checked={cabinetDraft.withTopRails} onChange={() => updateCabinetDraft({ withTopRails: !cabinetDraft.withTopRails })}>
              {cabinetDraft.withTopRails ? <NumberField ariaLabel={t(language, 'topRailHeight')} value={cabinetDraft.topRailHeight} onChange={(value) => updateCabinetDraft({ topRailHeight: value })} /> : null}
            </OptionRow>
            <OptionRow label={t(language, 'aprons')} checked={cabinetDraft.withAprons} onChange={() => updateCabinetDraft({ withAprons: !cabinetDraft.withAprons })} />
            <OptionRow label={t(language, 'topOverFronts')} checked={cabinetDraft.topOverFronts} onChange={() => updateCabinetDraft({ topOverFronts: !cabinetDraft.topOverFronts })} />
          </div>

          <div style={cabinetGroupStyle}>
            <div style={sectionHeadingStyle}>{language === 'ru' ? 'Крепёж' : 'Fasteners'}</div>
            {/* The two quick presets are mutually exclusive in the store, so they are one choice here. */}
            <div role="radiogroup" aria-label={language === 'ru' ? 'Крепёж' : 'Fasteners'} style={{ display: 'flex', border: `1px solid ${panelControlBorder}`, borderRadius: 7, overflow: 'hidden' }}>
              {([
                ['rules', language === 'ru' ? 'По правилам' : 'By rules', undefined],
                ['minifix', language === 'ru' ? 'Минификс' : 'Minifix', t(language, 'quickAllMinifix')],
                ['confirmat', language === 'ru' ? 'Конфирмат' : 'Confirmat', t(language, 'quickAllConfirmat')],
              ] as const).map(([preset, label, title], index) => {
                const presetActive = (cabinetDraft.quickAllMinifix ? 'minifix' : cabinetDraft.quickAllConfirmat ? 'confirmat' : 'rules') === preset;
                return (
                  <button
                    key={preset}
                    role="radio"
                    aria-checked={presetActive}
                    title={title}
                    onClick={() => updateCabinetDraft({ quickAllMinifix: preset === 'minifix', quickAllConfirmat: preset === 'confirmat' })}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: '7px 4px',
                      border: 'none',
                      borderLeft: index > 0 ? `1px solid ${panelControlBorder}` : 'none',
                      background: presetActive ? (isDarkBlue ? '#3f2c16' : '#fff7ed') : panelControlBg,
                      color: presetActive ? (isDarkBlue ? '#fde68a' : '#9a3412') : panelControlText,
                      fontSize: 12,
                      fontWeight: presetActive ? 600 : 400,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <button onClick={addCabinet} style={{ ...createCabinetButtonStyle, marginTop: 14 }}>+ {t(language, 'addCabinet')}</button>
        </AccordionCard>
        </div>

        <div ref={viewPanelRef} style={{ order: panelOrder.view }}>
        {/* View toggles live on the 3D view overlay now; this panel keeps the colors (and the 'view' anchor of the Summary step). */}
        <Card title={language === 'ru' ? 'Цвет' : 'Color'} isDarkBlue={isDarkBlue}>
          {(() => {
            // Multi-selection first (otherwise only the primary part got the color); a selected face counts as its part.
            const selectionIds: string[] = selectedPartIds.length > 1
              ? selectedPartIds
              : selected?.type === 'part' || selected?.type === 'face'
              ? [selected.partId]
              : selected?.type === 'group'
              ? project.parts.filter((p) => p.meta?.groupId === selected.groupId).map((p) => p.id)
              : selectedPartIds.length > 0
              ? selectedPartIds
              : [];
            const hasSelection = selectionIds.length > 0;
            const selectionParts = hasSelection ? project.parts.filter((p) => selectionIds.includes(p.id)) : [];
            const selectionColor = hasSelection ? (selectionParts[0]?.meta?.displayColor ?? null) : null;
            const activeColor = hasSelection ? selectionColor : materialColor;
            const handleClick = (hex: string) => {
              if (hasSelection) setPartsColor(selectionIds, activeColor === hex ? null : hex);
              else setMaterialColor(activeColor === hex ? null : hex);
            };
            const handleReset = () => {
              if (hasSelection) setPartsColor(selectionIds, null);
              else setMaterialColor(null);
            };
            const selectionLabel = selected?.type === 'group'
              ? (language === 'ru' ? 'Цвет шкафа (EGGER)' : 'Cabinet color (EGGER)')
              : selectedPartIds.length > 1
              ? (language === 'ru' ? 'Цвет выбранных деталей (EGGER)' : 'Selection color (EGGER)')
              : selected?.type === 'part' || selected?.type === 'face'
              ? (language === 'ru' ? 'Цвет детали (EGGER)' : 'Part color (EGGER)')
              : selectedPartIds.length > 0
              ? (language === 'ru' ? 'Цвет выбранных деталей (EGGER)' : 'Selection color (EGGER)')
              : (language === 'ru' ? 'Цвет материала (EGGER)' : 'Material color (EGGER)');
            return (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: isDarkBlue ? '#fde68a' : '#9a3412' }}>
                  {selectionLabel}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
                  {EGGER_COLORS.map((color) => {
                    const isActive = activeColor === color.hex;
                    return (
                      <button
                        key={color.article}
                        title={`${color.article} — ${color.name}`}
                        onClick={() => handleClick(color.hex)}
                        style={{
                          width: '100%',
                          aspectRatio: '1',
                          borderRadius: 5,
                          border: isActive ? '2px solid #f59e0b' : `1px solid ${isDarkBlue ? '#52525b' : '#d6d3d1'}`,
                          background: color.hex,
                          cursor: 'pointer',
                          padding: 0,
                          boxShadow: isActive ? '0 0 0 1px #f59e0b' : 'none',
                          outline: 'none',
                          transition: 'border 100ms, box-shadow 100ms',
                        }}
                      />
                    );
                  })}
                </div>
                {activeColor ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: isDarkBlue ? '#a1a1aa' : '#78716c' }}>
                    <span>
                      {(() => {
                        const found = EGGER_COLORS.find((c) => c.hex === activeColor);
                        return found ? `${found.article} — ${found.name}` : activeColor;
                      })()}
                    </span>
                    <button
                      onClick={handleReset}
                      style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, border: `1px solid ${isDarkBlue ? '#52525b' : '#d6d3d1'}`, background: 'transparent', color: isDarkBlue ? '#a1a1aa' : '#78716c', cursor: 'pointer' }}
                    >
                      {language === 'ru' ? 'Сбросить' : 'Reset'}
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: isDarkBlue ? '#71717a' : '#a8a29e' }}>
                    {language === 'ru' ? 'Нажмите на образец для выбора цвета' : 'Click a swatch to apply color'}
                  </div>
                )}
              </div>
            );
          })()}
        </Card>
        </div>

      </div>
    </div>
  );
}




