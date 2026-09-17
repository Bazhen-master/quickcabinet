import type { Part, PartRole } from './part';
import type { Lang } from '../i18n';

const EN_ROLE_LABELS: Record<PartRole | 'panel', string> = {
  panel: 'Panel',
  'left-side': 'Left side',
  'right-side': 'Right side',
  top: 'Top',
  bottom: 'Bottom',
  shelf: 'Shelf',
  partition: 'Partition',
  'tier-divider': 'Tier divider',
  'back-panel': 'Back panel',
  apron: 'Apron',
  'front-left': 'Left front',
  'front-right': 'Right front',
  'front-flap': 'Flap front',
  'drawer-front': 'Drawer front',
  'drawer-side-left': 'Drawer side left',
  'drawer-side-right': 'Drawer side right',
  'drawer-back': 'Drawer back',
  'drawer-inner-front': 'Drawer inner front',
  'drawer-bottom': 'Drawer bottom',
  'drawer-column': 'Drawer column divider',
  plinth: 'Plinth',
  'plinth-front': 'Plinth front',
  'back-rail': 'Back rail',
  'plinth-back': 'Plinth back',
  'plinth-brace': 'Plinth brace',
  'top-rail-front': 'Top rail front',
  'top-rail-support': 'Top rail support',
};

const RU_ROLE_LABELS: Record<PartRole | 'panel', string> = {
  panel: 'Панель',
  'left-side': 'Левая боковина',
  'right-side': 'Правая боковина',
  top: 'Крыша',
  bottom: 'Дно',
  shelf: 'Полка',
  partition: 'Перегородка',
  'tier-divider': 'Разделитель яруса',
  'back-panel': 'Задняя стенка',
  apron: 'Царга',
  'front-left': 'Левый фасад',
  'front-right': 'Правый фасад',
  'front-flap': 'Откидной фасад',
  'drawer-front': 'Фасад ящика',
  'drawer-side-left': 'Левая боковина ящика',
  'drawer-side-right': 'Правая боковина ящика',
  'drawer-back': 'Задняя стенка ящика',
  'drawer-inner-front': 'Внутренний фасад ящика',
  'drawer-bottom': 'Дно ящика',
  'drawer-column': 'Перегородка блока ящиков',
  plinth: 'Цоколь',
  'plinth-front': 'Передний цоколь',
  'back-rail': 'Задняя царга',
  'plinth-back': 'Задний цоколь',
  'plinth-brace': 'Перемычка цоколя',
  'top-rail-front': 'Передняя верхняя планка',
  'top-rail-support': 'Опора верхней планки',
};

function getLocalizedRoleLabel(role: PartRole | 'panel', lang: Lang) {
  return (lang === 'ru' ? RU_ROLE_LABELS : EN_ROLE_LABELS)[role] ?? role;
}

// Also matches the separator as mis-decoded in older saved files.
const NAME_SEPARATOR = /^(.*?)\s(?:·|В·|Р’В·)\s(.+)$/;

/** Splits "Cabinet 1 · Left side" into the cabinet prefix and the part's own label. */
export function splitPartName(name: string): { prefix: string | null; label: string } {
  const match = name.match(NAME_SEPARATOR);
  return match ? { prefix: match[1]!.trim(), label: match[2]!.trim() } : { prefix: null, label: name.trim() };
}

function isDefaultPartLabel(label: string, role: PartRole | 'panel') {
  const base = label.replace(/\s+\d+$/, '');
  return !base || base === EN_ROLE_LABELS[role] || base === RU_ROLE_LABELS[role] || base === EN_ROLE_LABELS.panel || base === RU_ROLE_LABELS.panel;
}

/** The part's own label: a user-given name if it was renamed, otherwise the localized role label. */
export function getPartOwnLabel(part: Pick<Part, 'name' | 'meta'>, lang: Lang) {
  const role = part.meta?.role ?? 'panel';
  const { label } = splitPartName(part.name);
  return isDefaultPartLabel(label, role) ? getLocalizedRoleLabel(role, lang) : label;
}

export function getLocalizedPartName(part: Part, lang: Lang) {
  const { prefix } = splitPartName(part.name);
  const ownLabel = getPartOwnLabel(part, lang);
  return prefix ? `${prefix} · ${ownLabel}` : ownLabel;
}

export function getLocalizedPartShortName(part: Part, lang: Lang) {
  const role = part.meta?.role ?? 'panel';
  return getLocalizedRoleLabel(role, lang);
}

