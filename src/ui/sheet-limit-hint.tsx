import { MAX_PART_SIZE_MM } from '../domain/part';
import type { ModuleSplit } from '../domain/module-split';
import type { Lang } from '../i18n';

function ruModules(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'модуль';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'модуля';
  return 'модулей';
}

function getHintText(plan: ModuleSplit, language: Lang, splitsExisting: boolean) {
  const count = plan.sizes.length;
  const sizes = plan.sizes.join(' + ');
  const mezzanine = plan.axis === 'height' && count === 2;
  const ru = language === 'ru';

  const title = ru ? `Лист материала — максимум ${MAX_PART_SIZE_MM} мм` : `Sheet material is limited to ${MAX_PART_SIZE_MM} mm`;
  const limited = ru
    ? `${plan.axis === 'width' ? 'Ширина' : 'Высота'} ${plan.requested} мм не помещается в один лист, размер ограничен до ${MAX_PART_SIZE_MM} мм.`
    : `${plan.axis === 'width' ? 'Width' : 'Height'} ${plan.requested} mm does not fit one sheet, so it was limited to ${MAX_PART_SIZE_MM} mm.`;

  let advice: string;
  let action: string;
  if (plan.axis === 'width') {
    advice = ru ? `Соберите конструкцию из ${count} ${ruModules(count)} рядом: ${sizes} мм.` : `Build it from ${count} modules side by side: ${sizes} mm.`;
    action = ru ? `${splitsExisting ? 'Разбить на' : 'Создать'} ${count} ${ruModules(count)}` : `${splitsExisting ? 'Split into' : 'Create'} ${count} modules`;
  } else if (mezzanine) {
    advice = ru
      ? `Соберите основной модуль ${plan.sizes[0]} мм и антресоль ${plan.sizes[1]} мм сверху.`
      : `Build a ${plan.sizes[0]} mm main module with a ${plan.sizes[1]} mm mezzanine on top.`;
    action = ru ? `${splitsExisting ? 'Разбить:' : 'Создать:'} модуль + антресоль` : `${splitsExisting ? 'Split into' : 'Create'} module + mezzanine`;
  } else {
    advice = ru ? `Соберите из ${count} ${ruModules(count)} друг на друге: ${sizes} мм.` : `Build it from ${count} stacked modules: ${sizes} mm.`;
    action = ru ? `${splitsExisting ? 'Разбить на' : 'Создать'} ${count} ${ruModules(count)}` : `${splitsExisting ? 'Split into' : 'Create'} ${count} modules`;
  }
  return { title, body: `${limited} ${advice}`, action };
}

/** Explains the sheet-size limit for an oversized cabinet and offers to build it from several modules. */
export function SheetLimitHint({
  plan,
  language,
  isDarkBlue,
  splitsExisting,
  onSplit,
  onDismiss,
}: {
  plan: ModuleSplit;
  language: Lang;
  isDarkBlue: boolean;
  /** true when the hint belongs to an existing cabinet (it will be replaced by the modules). */
  splitsExisting: boolean;
  onSplit: () => void;
  onDismiss: () => void;
}) {
  const { title, body, action } = getHintText(plan, language, splitsExisting);
  return (
    <div
      role="note"
      style={{
        gridColumn: '1 / -1', padding: '8px 10px', borderRadius: 8, fontSize: 12, lineHeight: 1.4,
        border: `1px solid ${isDarkBlue ? '#92400e' : '#fcd34d'}`,
        background: isDarkBlue ? '#2a1f0e' : '#fffbeb',
        color: isDarkBlue ? '#fde68a' : '#78350f',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, fontWeight: 700 }}>
        <span>⚠ {title}</span>
        <button
          onClick={onDismiss}
          aria-label={language === 'ru' ? 'Скрыть подсказку' : 'Dismiss hint'}
          style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1 }}
        >
          ✕
        </button>
      </div>
      <div style={{ marginTop: 4 }}>{body}</div>
      <button
        onClick={onSplit}
        title={splitsExisting ? (language === 'ru' ? 'Текущий шкаф будет заменён модулями (Ctrl+Z — отменить)' : 'The current cabinet will be replaced by modules (Ctrl+Z to undo)') : undefined}
        style={{ marginTop: 8, padding: '6px 10px', borderRadius: 7, border: '1px solid #f59e0b', background: '#f59e0b', color: '#111', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
      >
        {action}
      </button>
    </div>
  );
}
