import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useAppStore, useProject } from '../app/store';
import { t, type Lang } from '../i18n';
import type { Part, PartRole } from '../domain/part';
import { getLocalizedPartName } from '../domain/part-label';
import { getCabinetModuleState } from '../domain/cabinet-builder';

type Selection = ReturnType<typeof useAppStore.getState>['selected'];

function groupTitle(parts: { name: string }[]) {
  const first = parts[0]?.name ?? 'Group';
  return first.split(' · ')[0] ?? first;
}

type PartCategoryId =
  | 'frame'
  | 'sections'
  | 'tiers'
  | 'fronts'
  | 'drawers'
  | 'back'
  | 'plinth'
  | 'decor'
  | 'other';

type PartCategory = {
  id: PartCategoryId;
  label: string;
  parts: Part[];
};

const CATEGORY_ORDER: PartCategoryId[] = ['frame', 'sections', 'tiers', 'fronts', 'drawers', 'back', 'plinth', 'decor', 'other'];

function getPartCategory(role?: PartRole): PartCategoryId {
  switch (role) {
    case 'left-side':
    case 'right-side':
    case 'top':
    case 'bottom':
    case 'panel':
      return 'frame';
    case 'partition':
    case 'shelf':
      return 'sections';
    case 'tier-divider':
    case 'apron':
      return 'tiers';
    case 'front-left':
    case 'front-right':
    case 'front-flap':
      return 'fronts';
    case 'drawer-front':
    case 'drawer-side-left':
    case 'drawer-side-right':
    case 'drawer-back':
    case 'drawer-inner-front':
    case 'drawer-bottom':
    case 'drawer-column':
      return 'drawers';
    case 'back-panel':
      return 'back';
    case 'plinth':
    case 'plinth-front':
    case 'plinth-back':
    case 'plinth-brace':
      return 'plinth';
    case 'top-rail-front':
    case 'top-rail-support':
      return 'decor';
    default:
      return 'other';
  }
}

function getCategoryLabel(category: PartCategoryId, language: Lang) {
  switch (category) {
    case 'frame':
      return t(language, 'categoryFrame');
    case 'sections':
      return t(language, 'categorySections');
    case 'tiers':
      return t(language, 'categoryTiers');
    case 'fronts':
      return t(language, 'categoryFronts');
    case 'drawers':
      return t(language, 'categoryDrawers');
    case 'back':
      return t(language, 'categoryBack');
    case 'plinth':
      return t(language, 'categoryPlinth');
    case 'decor':
      return t(language, 'categoryDecor');
    default:
      return t(language, 'categoryOther');
  }
}

function stripGroupPrefix(name: string, title: string) {
  return name.replace(`${title} · `, '');
}

/** Two largest dimensions, e.g. "2384×600": enough to tell same-named parts apart. */
function formatPartSize(part: Part) {
  const [first, second] = [part.width, part.height, part.thickness]
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a);
  return second ? `${Math.round(first)}×${Math.round(second)}` : '';
}

function isPartActive(part: Part, selected: Selection, selectedPartIds: string[]) {
  return selectedPartIds.includes(part.id) || ((selected?.type === 'part' || selected?.type === 'face') && selected.partId === part.id);
}

function getTreeColors(isDarkBlue: boolean) {
  return isDarkBlue
    ? { text: '#e5e7eb', muted: '#a1a1aa', faint: '#71717a', hoverBg: 'rgba(255,255,255,0.06)', sceneHoverBg: 'rgba(59,130,246,0.16)', activeBg: '#3f2c16', activeText: '#fde68a', groupActiveBg: 'rgba(245,158,11,0.06)', border: '#3f3f46' }
    : { text: '#1c1917', muted: '#57534e', faint: '#a8a29e', hoverBg: 'rgba(0,0,0,0.04)', sceneHoverBg: 'rgba(59,130,246,0.12)', activeBg: '#fff7ed', activeText: '#9a3412', groupActiveBg: 'rgba(245,158,11,0.06)', border: '#e7e5e4' };
}
type TreeColors = ReturnType<typeof getTreeColors>;

// Row controls appear on hover (always on touch screens); inline styles can't express :hover.
const TREE_CSS = `
.pt-row { transition: background-color 120ms ease; }
.pt-row:hover { background-color: var(--pt-hover-bg); }
.pt-hover { opacity: 0; transition: opacity 120ms ease; }
.pt-row:hover .pt-hover, .pt-row:focus-within .pt-hover { opacity: 1; }
@media (hover: none) { .pt-hover { opacity: 1; } }
.pt-row button:focus { outline: none; }
.pt-row button:focus-visible { outline: 2px solid #f59e0b; outline-offset: -2px; border-radius: 5px; }
`;

const iconButtonStyle = (color: string): React.CSSProperties => ({
  width: 22,
  height: 22,
  flex: '0 0 auto',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  border: 'none',
  borderRadius: 5,
  background: 'transparent',
  color,
  cursor: 'pointer',
});

const rowButtonStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
};

const ellipsis: React.CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" style={{ flex: '0 0 auto', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms ease' }}>
      <path d="M3.5 2L7 5L3.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconEye({ off }: { off: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
      {off ? <path d="M2.5 13.5L13.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /> : null}
    </svg>
  );
}

function IconSelectAll() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="1.8" fill="currentColor" />
    </svg>
  );
}

export function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M2.5 4h10M6 4V2.5h3V4M3.8 4l.7 8.5h6l.7-8.5M6.3 6.5v4M8.7 6.5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const NO_PART_IDS: string[] = [];

/**
 * Invisible marker: while `active` (a part hovered in the 3D view), scrolls its parent row into view.
 * The short dwell keeps the panel from jerking while the cursor sweeps across the scene.
 */
function SceneHoverScrollAnchor({ active }: { active: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => ref.current?.parentElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 150);
    return () => window.clearTimeout(timer);
  }, [active]);
  return <span ref={ref} aria-hidden="true" style={{ display: 'none' }} />;
}

function PartRow({
  name,
  size,
  active,
  hidden,
  language,
  colors,
  onSelect,
  onToggleHidden,
  onHoverChange,
  sceneHovered,
}: {
  name: string;
  size: string;
  sceneHovered: boolean;
  active: boolean;
  hidden: boolean;
  language: Lang;
  colors: TreeColors;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  onToggleHidden: () => void;
  onHoverChange: (hovering: boolean) => void;
}) {
  const hideLabel = t(language, hidden ? 'show' : 'hide');
  return (
    <div
      className="pt-row"
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        height: 26,
        padding: '0 2px 0 8px',
        borderRadius: 5,
        background: active ? colors.activeBg : sceneHovered ? colors.sceneHoverBg : undefined,
        boxShadow: active ? 'inset 3px 0 0 #f59e0b' : sceneHovered ? 'inset 3px 0 0 #3b82f6' : undefined,
      }}
    >
      <SceneHoverScrollAnchor active={sceneHovered} />
      <button
        onClick={onSelect}
        title={size ? `${name} · ${size}` : name}
        style={{ ...rowButtonStyle, paddingRight: 6, color: active ? colors.activeText : colors.text, opacity: hidden ? 0.45 : 1, fontSize: 12 }}
      >
        <span style={{ ...ellipsis, flex: 1, fontWeight: active ? 600 : 400 }}>{name}</span>
        {size ? <span style={{ flex: '0 0 auto', fontSize: 10, color: colors.faint, fontVariantNumeric: 'tabular-nums' }}>{size}</span> : null}
      </button>
      <button
        className={hidden ? undefined : 'pt-hover'}
        onClick={onToggleHidden}
        title={hideLabel}
        aria-label={`${hideLabel}: ${name}`}
        style={iconButtonStyle(colors.muted)}
      >
        <IconEye off={hidden} />
      </button>
    </div>
  );
}

function CategoryBlock({
  category,
  title,
  selected,
  selectedPartIds,
  language,
  colors,
  selectPart,
  selectPartSet,
  setPartHidden,
  setPartsHidden,
  setHoveredPartIds,
  sceneHoveredPartIds,
}: {
  category: PartCategory;
  /** Parts hovered in the 3D view (empty when hovering the tree itself). */
  sceneHoveredPartIds: string[];
  title: string;
  selected: Selection;
  selectedPartIds: string[];
  language: Lang;
  colors: TreeColors;
  selectPart: (partId: string, additive?: boolean) => void;
  selectPartSet: (partIds: string[]) => void;
  setPartHidden: (partId: string, hidden: boolean) => void;
  setPartsHidden: (partIds: string[], hidden: boolean) => void;
  setHoveredPartIds: (partIds: string[]) => void;
}) {
  const hasActive = category.parts.some((part) => isPartActive(part, selected, selectedPartIds));
  // Only the category holding the selection starts open.
  const [open, setOpen] = useState(hasActive);

  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  // Same-named parts ("Partition") are numbered top-to-bottom, left-to-right so rows can be told apart.
  const rows = useMemo(() => {
    const names = category.parts.map((part) => stripGroupPrefix(getLocalizedPartName(part, language), title));
    const firstIndexByName = new Map<string, number>();
    const totals = new Map<string, number>();
    names.forEach((name, index) => {
      if (!firstIndexByName.has(name)) firstIndexByName.set(name, index);
      totals.set(name, (totals.get(name) ?? 0) + 1);
    });
    const ordered = category.parts
      .map((part, index) => ({ part, name: names[index]! }))
      .sort((a, b) =>
        (firstIndexByName.get(a.name)! - firstIndexByName.get(b.name)!)
        || (b.part.position.y - a.part.position.y)
        || (a.part.position.x - b.part.position.x)
      );
    const seen = new Map<string, number>();
    return ordered.map(({ part, name }) => {
      if ((totals.get(name) ?? 0) < 2) return { part, name };
      const number = (seen.get(name) ?? 0) + 1;
      seen.set(name, number);
      return { part, name: `${name} ${number}` };
    });
  }, [category.parts, language, title]);

  const hiddenCount = category.parts.filter((part) => part.meta?.hidden).length;
  const categoryPartIds = category.parts.map((part) => part.id);
  const categoryActive = categoryPartIds.length > 0 && categoryPartIds.every((id) => selectedPartIds.includes(id));
  const selectAllLabel = language === 'ru' ? 'Выбрать все детали категории' : 'Select all parts in category';
  const allHidden = category.parts.length > 0 && hiddenCount === category.parts.length;
  const hideAllLabel = t(language, allHidden ? 'showAllInCategory' : 'hideAllInCategory');
  // A collapsed category stands in for its hovered part instead of expanding under the cursor.
  const categorySceneHovered = !open && category.parts.some((part) => sceneHoveredPartIds.includes(part.id));

  return (
    <div>
      <div
        className="pt-row"
        onPointerEnter={() => setHoveredPartIds(categoryPartIds)}
        onPointerLeave={() => setHoveredPartIds([])}
        style={{ display: 'flex', alignItems: 'center', gap: 4, height: 26, padding: '0 2px 0 6px', borderRadius: 5, background: categoryActive ? colors.activeBg : categorySceneHovered ? colors.sceneHoverBg : undefined }}>
        <SceneHoverScrollAnchor active={categorySceneHovered} />
        <button
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          style={{ ...rowButtonStyle, color: categoryActive ? colors.activeText : colors.text, fontSize: 12, fontWeight: 600 }}
        >
          <IconChevron open={open} />
          <span style={ellipsis}>{category.label}</span>
          <span style={{ marginLeft: 'auto', flex: '0 0 auto', fontSize: 10, fontWeight: 400, color: colors.faint }}>
            {category.parts.length}{hiddenCount > 0 ? ` · ${hiddenCount} ${t(language, 'hidden')}` : ''}
          </span>
        </button>
        <button
          className={allHidden ? undefined : 'pt-hover'}
          onClick={() => setPartsHidden(categoryPartIds, !allHidden)}
          title={hideAllLabel}
          aria-label={hideAllLabel}
          style={iconButtonStyle(colors.muted)}
        >
          <IconEye off={allHidden} />
        </button>
        <button className="pt-hover" onClick={() => selectPartSet(categoryPartIds)} title={selectAllLabel} aria-label={selectAllLabel} style={iconButtonStyle(colors.muted)}>
          <IconSelectAll />
        </button>
      </div>
      {open ? (
        <div style={{ marginLeft: 10, paddingLeft: 4, borderLeft: `1px solid ${colors.border}` }}>
          {rows.map(({ part, name }) => (
            <PartRow
              key={part.id}
              name={name}
              size={formatPartSize(part)}
              sceneHovered={sceneHoveredPartIds.includes(part.id)}
              onHoverChange={(hovering) => setHoveredPartIds(hovering ? [part.id] : [])}
              active={isPartActive(part, selected, selectedPartIds)}
              hidden={Boolean(part.meta?.hidden)}
              language={language}
              colors={colors}
              onSelect={(e) => selectPart(part.id, e.ctrlKey || e.metaKey)}
              onToggleHidden={() => setPartHidden(part.id, !part.meta?.hidden)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function buildCategories(parts: Part[], language: Lang): PartCategory[] {
  const grouped = new Map<PartCategoryId, Part[]>();
  parts.forEach((part) => {
    const category = getPartCategory(part.meta?.role);
    grouped.set(category, [...(grouped.get(category) ?? []), part]);
  });

  return CATEGORY_ORDER
    .map((category) => {
      const categoryParts = grouped.get(category) ?? [];
      return {
        id: category,
        label: getCategoryLabel(category, language),
        parts: categoryParts,
      };
    })
    .filter((category) => category.parts.length > 0);
}

export function ProjectTree() {
  const project = useProject();
  const selected = useAppStore((s) => s.selected);
  const selectedPartIds = useAppStore((s) => s.selectedPartIds);
  const selectPart = useAppStore((s) => s.selectPart);
  const selectPartSet = useAppStore((s) => s.selectPartSet);
  const selectGroup = useAppStore((s) => s.selectGroup);
  const removeGroup = useAppStore((s) => s.removeGroup);
  const setPartHidden = useAppStore((s) => s.setPartHidden);
  const setPartsHidden = useAppStore((s) => s.setPartsHidden);
  const setHoveredPartIds = useAppStore((s) => s.setHoveredPartIds);
  const sceneHoveredPartIds = useAppStore((s) => (s.hoverSource === 'scene' ? s.hoveredPartIds : NO_PART_IDS));
  // Rows can disappear under the pointer (collapse, delete) without a pointerleave; never leave a stale highlight.
  useEffect(() => () => setHoveredPartIds([]), [setHoveredPartIds]);
  const language = useAppStore((s) => s.language);
  const themeMode = useAppStore((s) => s.themeMode);
  const colors = getTreeColors(themeMode === 'dark-blue');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof project.parts>();
    const singles: typeof project.parts = [];
    project.parts.forEach((part) => {
      const gid = part.meta?.groupId;
      if (!gid) singles.push(part);
      else groups.set(gid, [...(groups.get(gid) ?? []), part]);
    });
    return { groups, singles };
  }, [project.parts]);

  const dimensionsByGroup = useMemo(() => {
    const result = new Map<string, string>();
    for (const groupId of grouped.groups.keys()) {
      const module = getCabinetModuleState(project.parts, groupId);
      if (module) result.set(groupId, `${Math.round(module.width)}×${Math.round(module.height)}×${Math.round(module.depth)}`);
    }
    return result;
  }, [grouped.groups, project.parts]);

  useEffect(() => {
    setOpenGroups((current) => {
      const next = { ...current };
      for (const [groupId, parts] of grouped.groups.entries()) {
        if (next[groupId] !== undefined) continue;
        next[groupId] = parts.some((part) => isPartActive(part, selected, selectedPartIds));
      }
      return next;
    });
  }, [grouped.groups, selected, selectedPartIds]);

  useEffect(() => {
    if (selected?.type !== 'group') return;
    setOpenGroups((current) => {
      if (current[selected.groupId] !== undefined) return current;
      return { ...current, [selected.groupId]: true };
    });
  }, [selected]);

  const partsLabel = language === 'ru' ? 'дет.' : 'pcs';

  return (
    <div
      onPointerLeave={() => setHoveredPartIds([])}
      style={{ '--pt-hover-bg': colors.hoverBg } as React.CSSProperties}
    >
      <style>{TREE_CSS}</style>
      {project.parts.length === 0 ? (
        <div style={{ color: colors.muted, fontSize: 12 }}>{t(language, 'noPartsYet')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 4 }}>
          {grouped.singles.map((part) => (
            <PartRow
              key={part.id}
              name={getLocalizedPartName(part, language)}
              size={formatPartSize(part)}
              sceneHovered={sceneHoveredPartIds.includes(part.id)}
              onHoverChange={(hovering) => setHoveredPartIds(hovering ? [part.id] : [])}
              active={isPartActive(part, selected, selectedPartIds)}
              hidden={Boolean(part.meta?.hidden)}
              language={language}
              colors={colors}
              onSelect={(e) => selectPart(part.id, e.ctrlKey || e.metaKey)}
              onToggleHidden={() => setPartHidden(part.id, !part.meta?.hidden)}
            />
          ))}

          {[...grouped.groups.entries()].map(([groupId, parts]) => {
            const title = groupTitle(parts);
            const groupActive = selected?.type === 'group' && selected.groupId === groupId;
            const categories = buildCategories(parts, language);
            const groupHiddenCount = parts.filter((part) => part.meta?.hidden).length;
            const open = openGroups[groupId] ?? false;
            const dimensions = dimensionsByGroup.get(groupId);
            const toggleLabel = open ? (language === 'ru' ? 'Свернуть' : 'Collapse') : (language === 'ru' ? 'Развернуть' : 'Expand');
            const groupSceneHovered = !open && parts.some((part) => sceneHoveredPartIds.includes(part.id));

            return (
              <div
                key={groupId}
                style={{
                  borderRadius: 8,
                  padding: 2,
                  border: `1px solid ${groupActive ? '#f59e0b' : colors.border}`,
                  background: groupActive ? colors.groupActiveBg : 'transparent',
                }}
              >
                <div
                  className="pt-row"
                  onPointerEnter={() => setHoveredPartIds(parts.map((part) => part.id))}
                  onPointerLeave={() => setHoveredPartIds([])}
                  style={{ display: 'flex', alignItems: 'center', gap: 2, height: 30, paddingRight: 2, borderRadius: 6, background: groupSceneHovered ? colors.sceneHoverBg : undefined }}
                >
                  <SceneHoverScrollAnchor active={groupSceneHovered} />
                  <button
                    onClick={() => setOpenGroups((current) => ({ ...current, [groupId]: !open }))}
                    aria-expanded={open}
                    title={toggleLabel}
                    aria-label={`${toggleLabel}: ${title}`}
                    style={iconButtonStyle(colors.muted)}
                  >
                    <IconChevron open={open} />
                  </button>
                  <button
                    onClick={() => {
                      selectGroup(groupId);
                      setOpenGroups((current) => ({ ...current, [groupId]: true }));
                    }}
                    title={dimensions ? `${title} · ${dimensions}` : title}
                    style={{ ...rowButtonStyle, color: groupActive ? colors.activeText : colors.text }}
                  >
                    <span style={{ ...ellipsis, flex: '0 1 auto', fontSize: 13, fontWeight: 700 }}>{title}</span>
                    {dimensions ? <span style={{ ...ellipsis, flex: '0 1 auto', fontSize: 10, color: colors.faint, fontVariantNumeric: 'tabular-nums' }}>{dimensions}</span> : null}
                    <span style={{ marginLeft: 'auto', flex: '0 0 auto', fontSize: 10, color: colors.faint }}>
                      {parts.length} {partsLabel}{groupHiddenCount > 0 ? ` · ${groupHiddenCount} ${t(language, 'hidden')}` : ''}
                    </span>
                  </button>
                  <button
                    className="pt-hover"
                    onClick={() => {
                      if (window.confirm(`${title}\n\n${t(language, 'confirmDeleteGroup')}`)) removeGroup(groupId);
                    }}
                    title={t(language, 'deleteGroup')}
                    aria-label={`${t(language, 'deleteGroup')}: ${title}`}
                    style={iconButtonStyle('#ef4444')}
                  >
                    <IconTrash />
                  </button>
                </div>
                {open ? (
                  <div style={{ paddingBottom: 2 }}>
                    {categories.map((category) => (
                      <CategoryBlock
                        key={`${groupId}:${category.id}`}
                        category={category}
                        title={title}
                        selected={selected}
                        selectedPartIds={selectedPartIds}
                        language={language}
                        colors={colors}
                        selectPart={selectPart}
                        selectPartSet={selectPartSet}
                        setPartHidden={setPartHidden}
                        setPartsHidden={setPartsHidden}
                        setHoveredPartIds={setHoveredPartIds}
                        sceneHoveredPartIds={sceneHoveredPartIds}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
