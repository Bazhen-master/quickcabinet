import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useAppStore, useProject } from '../app/store';
import { t, type Lang } from '../i18n';
import type { Part, PartRole } from '../domain/part';

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
      return 'fronts';
    case 'drawer-front':
    case 'drawer-side-left':
    case 'drawer-side-right':
    case 'drawer-back':
    case 'drawer-inner-front':
    case 'drawer-bottom':
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

function shouldCategoryStartOpen(category: PartCategoryId) {
  return category !== 'drawers' && category !== 'other' && category !== 'decor';
}

function stripGroupPrefix(name: string, title: string) {
  return name.replace(`${title} · `, '');
}

function CompactPartRow({
  name,
  active,
  hidden,
  language,
  onSelect,
  onToggleHidden,
}: {
  name: string;
  active: boolean;
  hidden: boolean;
  language: Lang;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  onToggleHidden: () => void;
}) {
  const themeMode = useAppStore((s) => s.themeMode);
  const isDarkBlue = themeMode === 'dark-blue';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 4, alignItems: 'center' }}>
      <button
        onClick={onSelect}
        title={name}
        style={{
          textAlign: 'left',
          padding: '4px 7px',
          borderRadius: 7,
          border: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}`,
          background: active ? (isDarkBlue ? '#3a3a3f' : '#fef3c7') : (isDarkBlue ? '#27272a' : '#fff'),
          cursor: 'pointer',
          color: isDarkBlue ? '#e5e7eb' : '#111',
          opacity: hidden ? 0.5 : 1,
          fontSize: 11,
          lineHeight: 1.2,
          minHeight: 26,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}
      >
        {name}
      </button>
      <button
        onClick={onToggleHidden}
        style={{
          padding: '4px 7px',
          borderRadius: 7,
          border: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}`,
          background: isDarkBlue ? '#27272a' : '#fff',
          cursor: 'pointer',
          fontSize: 10,
          lineHeight: 1.1,
          minHeight: 26,
          color: isDarkBlue ? '#a1a1aa' : '#57534e',
        }}
      >
        {hidden ? t(language, 'show') : t(language, 'hide')}
      </button>
    </div>
  );
}

function CategoryBlock({
  groupId,
  category,
  title,
  selected,
  selectedPartIds,
  language,
  selectPart,
  selectPartSet,
  setPartHidden,
}: {
  groupId: string;
  category: PartCategory;
  title: string;
  selected: ReturnType<typeof useAppStore.getState>['selected'];
  selectedPartIds: string[];
  language: Lang;
  selectPart: (partId: string, additive?: boolean) => void;
  selectPartSet: (partIds: string[]) => void;
  setPartHidden: (partId: string, hidden: boolean) => void;
}) {
  const themeMode = useAppStore((s) => s.themeMode);
  const isDarkBlue = themeMode === 'dark-blue';
  const collapseKey = `${groupId}:${category.id}`;
  const [open, setOpen] = useState(() => shouldCategoryStartOpen(category.id));

  useEffect(() => {
    if (category.parts.length === 0) return;
    const hasActive = category.parts.some((part) => selectedPartIds.includes(part.id) || ((selected?.type === 'part' || selected?.type === 'face') && selected.partId === part.id));
    if (hasActive) setOpen(true);
  }, [category.parts, selected, selectedPartIds, collapseKey]);

  const hiddenCount = category.parts.filter((part) => part.meta?.hidden).length;
  const categoryPartIds = category.parts.map((part) => part.id);
  const categoryActive = categoryPartIds.length > 0 && categoryPartIds.every((id) => selectedPartIds.includes(id));

  return (
    <div style={{ border: `1px solid ${isDarkBlue ? '#3f3f46' : '#eee7df'}`, borderRadius: 8, background: categoryActive ? (isDarkBlue ? '#33363a' : '#fff7ed') : (isDarkBlue ? '#202124' : '#fff') }}>
      <div style={{ padding: '4px 4px 0 4px' }}>
        <button
          onClick={() => selectPartSet(categoryPartIds)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '5px 8px',
            background: categoryActive ? (isDarkBlue ? '#3a3a3f' : '#fef3c7') : (isDarkBlue ? '#202124' : '#fff'),
            border: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}`,
            cursor: 'pointer',
            borderRadius: 8,
            fontSize: 11,
            color: isDarkBlue ? '#e5e7eb' : '#57534e',
            fontWeight: 600,
            textAlign: 'left',
          }}
        >
          <span>{category.label}</span>
          <span style={{ fontSize: 10, color: isDarkBlue ? '#a1a1aa' : '#78716c' }}>
            {t(language, 'selectGroup')}
          </span>
        </button>
      </div>
      <button
        onClick={() => setOpen((value) => !value)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '5px 8px',
          background: isDarkBlue ? '#202124' : '#fff',
          border: 'none',
          cursor: 'pointer',
          borderRadius: 8,
          fontSize: 11,
          color: isDarkBlue ? '#e5e7eb' : '#57534e',
          fontWeight: 600,
        }}
      >
        <span>{category.label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: isDarkBlue ? '#a1a1aa' : '#78716c' }}>
          <span>{category.parts.length}{hiddenCount > 0 ? ` · ${hiddenCount} ${t(language, 'hidden')}` : ''}</span>
          <span>{open ? '−' : '+'}</span>
        </span>
      </button>
      {open ? (
        <div style={{ display: 'grid', gap: 4, padding: '0 6px 6px 6px' }}>
          {category.parts.map((part) => {
            const active = selectedPartIds.includes(part.id) || ((selected?.type === 'part' || selected?.type === 'face') && selected.partId === part.id);
            return (
              <CompactPartRow
                key={part.id}
                name={stripGroupPrefix(part.name, title)}
                active={active}
                hidden={Boolean(part.meta?.hidden)}
                language={language}
                onSelect={(e) => selectPart(part.id, e.ctrlKey || e.metaKey)}
                onToggleHidden={() => setPartHidden(part.id, !part.meta?.hidden)}
              />
            );
          })}
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
  const setPartHidden = useAppStore((s) => s.setPartHidden);
  const language = useAppStore((s) => s.language);
  const themeMode = useAppStore((s) => s.themeMode);
  const isDarkBlue = themeMode === 'dark-blue';
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

  useEffect(() => {
    setOpenGroups((current) => {
      const next = { ...current };
      for (const [groupId, parts] of grouped.groups.entries()) {
        if (next[groupId] !== undefined) continue;
        const hasActive = parts.some((part) => selectedPartIds.includes(part.id) || ((selected?.type === 'part' || selected?.type === 'face') && selected.partId === part.id));
        next[groupId] = hasActive;
      }
      return next;
    });
  }, [grouped.groups, selected, selectedPartIds]);

  useEffect(() => {
    if (selected?.type !== 'group') return;
    setOpenGroups((current) => ({ ...current, [selected.groupId]: true }));
  }, [selected]);

  return (
    <div style={{ borderBottom: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}`, paddingBottom: 10, marginBottom: 10 }}>
      <h4 style={{ margin: '0 0 8px 0', fontSize: 16 }}>{t(language, 'projectTree')}</h4>
      {project.parts.length === 0 ? (
        <div style={{ color: isDarkBlue ? '#a1a1aa' : '#666', fontSize: 12 }}>{t(language, 'noPartsYet')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {grouped.singles.map((part) => {
            const active = selectedPartIds.includes(part.id) || ((selected?.type === 'part' || selected?.type === 'face') && selected.partId === part.id);
            return (
              <CompactPartRow
                key={part.id}
                name={part.name}
                active={active}
                hidden={Boolean(part.meta?.hidden)}
                language={language}
                onSelect={(e) => selectPart(part.id, e.ctrlKey || e.metaKey)}
                onToggleHidden={() => setPartHidden(part.id, !part.meta?.hidden)}
              />
            );
          })}

          {[...grouped.groups.entries()].map(([groupId, parts]) => {
            const title = groupTitle(parts);
            const groupActive = selected?.type === 'group' && selected.groupId === groupId;
            const categories = buildCategories(parts, language);
            const groupHiddenCount = parts.filter((part) => part.meta?.hidden).length;
            const open = openGroups[groupId] ?? false;

            return (
              <div key={groupId} style={{ border: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}`, borderRadius: 10, padding: 6, background: groupActive ? (isDarkBlue ? '#33363a' : '#fff7ed') : (isDarkBlue ? '#202124' : '#fafaf9') }}>
                <button
                  onClick={() => {
                    selectGroup(groupId);
                    setOpenGroups((current) => ({ ...current, [groupId]: !open }));
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    textAlign: 'left',
                    padding: '6px 8px',
                    borderRadius: 8,
                    border: `1px solid ${isDarkBlue ? '#3f3f46' : '#ddd'}`,
                    background: groupActive ? (isDarkBlue ? '#3a3a3f' : '#fed7aa') : (isDarkBlue ? '#27272a' : '#fff'),
                    cursor: 'pointer',
                    marginBottom: open ? 6 : 0,
                    fontSize: 12,
                    fontWeight: 600,
                    color: isDarkBlue ? '#e5e7eb' : '#111',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: isDarkBlue ? '#a1a1aa' : '#57534e' }}>
                    <span>{parts.length}{groupHiddenCount > 0 ? ` · ${groupHiddenCount} ${t(language, 'hidden')}` : ''}</span>
                    <span>{open ? '−' : '+'}</span>
                  </span>
                </button>
                {open ? (
                  <div style={{ display: 'grid', gap: 5 }}>
                    {categories.map((category) => (
                      <CategoryBlock
                        key={`${groupId}:${category.id}`}
                        groupId={groupId}
                        category={category}
                        title={title}
                        selected={selected}
                        selectedPartIds={selectedPartIds}
                        language={language}
                        selectPart={selectPart}
                        selectPartSet={selectPartSet}
                        setPartHidden={setPartHidden}
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
