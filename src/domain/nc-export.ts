import type { DrillOperation } from './drill';
import { getFacePointWorld } from './face-coords';
import type { Part } from './part';

function asMm(value: number) {
  return Number.isFinite(value) ? value.toFixed(3) : '0.000';
}

function safeName(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function getCuttingDimensions(part: Part) {
  const [first, second] = [part.width, part.height, part.thickness]
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a);
  return {
    height: first ?? 0,
    width: second ?? 0,
  };
}

function drillToNcLine(op: DrillOperation) {
  return [
    'DRILL',
    `FACE=${op.face.toUpperCase()}`,
    `X=${asMm(op.x)}`,
    `Y=${asMm(op.y)}`,
    `DIA=${asMm(op.diameter)}`,
    `DEPTH=${asMm(op.depth)}`,
    `THROUGH=${op.through ? '1' : '0'}`,
  ].join(' ');
}

function getCabinetName(part: Part, groupIndexById: Map<string, number>): string {
  if (!part.meta?.groupId) return 'Loose';
  const index = groupIndexById.get(part.meta.groupId) ?? 1;
  const separatorMatch = part.name.match(/^(.*?)\s(?:·|В·|Р'В·)\s/);
  return separatorMatch?.[1]?.trim() || `Cabinet_${index}`;
}

export function buildNcProgram(parts: Part[]) {
  const visibleParts = parts.filter((part) => !part.meta?.hidden);
  const now = new Date();
  const dateStr = now.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // Собираем имена групп
  const groupIds = [...new Set(visibleParts.map((p) => p.meta?.groupId).filter((id): id is string => Boolean(id)))];
  const groupIndexById = new Map(groupIds.map((id, i) => [id, i + 1]));

  const lines: string[] = [];
  lines.push('; ================================================');
  lines.push('; Furniture CNC Export (Woodmaster compatible)');
  lines.push(`; Date: ${dateStr}`);
  lines.push(`; Total parts: ${visibleParts.length}`);
  lines.push(`; Cabinets: ${groupIds.length}`);
  lines.push('; Units: mm');
  lines.push('; ================================================');
  lines.push('');

  // Группируем по шкафам
  const byGroup = new Map<string, Part[]>();
  for (const part of visibleParts) {
    const key = part.meta?.groupId ?? '__loose__';
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(part);
  }

  let globalIndex = 1;
  for (const [groupKey, groupParts] of byGroup) {
    const cabinetLabel = groupKey === '__loose__' ? 'Loose parts' : getCabinetName(groupParts[0], groupIndexById);
    lines.push(`; --- ${cabinetLabel} (${groupParts.length} parts) ---`);
    for (const part of groupParts) {
      const dims = getCuttingDimensions(part);
      const drills = part.operations.filter((op): op is DrillOperation => op.type === 'drill');
      lines.push(`BEGIN PART ${globalIndex}`);
      lines.push(`  ID=${part.id}`);
      lines.push(`  CABINET="${safeName(cabinetLabel)}"`);
      lines.push(`  NAME="${safeName(part.name)}"`);
      lines.push(`  ROLE=${part.meta?.role ?? 'panel'}`);
      lines.push(`  L=${asMm(dims.height)}`);
      lines.push(`  W=${asMm(dims.width)}`);
      lines.push(`  T=${asMm(part.thickness)}`);
      lines.push(`  DRILLS=${drills.length}`);
      drills.forEach((op) => lines.push(`  ${drillToNcLine(op)}`));
      lines.push(`END PART`);
      lines.push('');
      globalIndex++;
    }
  }

  return lines.join('\n');
}

// ─── Woodmaster присадочный станок ───────────────────────────────────────────
//
// Каждый файл = одна деталь. Формат:
//   M6xx           — выбор торца (601=низ, 602=верх, 603=лево, 604=право)
//   Tx             — инструмент (T1=5мм шкант/полкодержатель, T2=8мм Minifix)
//   G00 Z8.000     — высота подхода (фиксированная)
//   G00 X[pos]     — позиция вдоль торца (мм)
//   G01 Y[depth]   — заглубление (мм)
//   G00 Y-5.00     — отвод
//   M00            — пауза (оператор переворачивает деталь)
//   G00 X0.000     — возврат в 0 в конце
//   M30            — конец программы

type FaceGroup = { mCode: string; ops: Array<{ x: number; depth: number; tool: string }> };

// Инструменты присадочного. В эталоне 26163 это 616 отверстий на 158 деталей, и во всех
// только T1 и T2. Инструмент выбирается по назначению отверстия, а не по диаметру: шкант
// Ø8 в торце Базис сверлит T1 (глубина 22), а отверстие под шток той же Ø8 — T2 (глубина 34).
// Какие диаметры у самих свёрл, из выгрузки не видно — уточняется на производстве.
const PRESADKA_TOOL_BY_FEATURE: Partial<Record<NonNullable<DrillOperation['feature']>, string>> = {
  dowel: 'T1',
  // Конфирмат в торце — T2, как в эталоне 26163 (глубина 34).
  confirmat: 'T2',
  'shelf-pin': 'T1',
  'connector-pin': 'T2',
};

// Отверстие без назначения (ручное) — по диаметру; вне таблицы запасное правило не даёт
// выгрузке упасть, но такое отверстие нужно показывать оператору.
const PRESADKA_TOOL_BY_DIAMETER: Record<number, string> = {
  5: 'T1',
  8: 'T2',
};

function getToolCode(op: DrillOperation) {
  const byFeature = op.feature ? PRESADKA_TOOL_BY_FEATURE[op.feature] : undefined;
  return byFeature ?? PRESADKA_TOOL_BY_DIAMETER[Math.round(op.diameter)] ?? (op.diameter <= 5 ? 'T1' : 'T2');
}

// Как деталь лежит на присадочном. Торцы и отсчёт X выведены из эталона 26163 через систему детали:
//   u — вдоль первого размера бирки: у вертикальных деталей высота (сверху вниз), у горизонтальных
//       ширина (справа налево);
//   v — вдоль второго: у горизонтальных от переда назад, у стоящих по глубине от зада вперёд,
//       у стоящих по ширине (фасад, цоколь, царга) справа налево.
// M601 — торец v=0 (X = u), M603 — v=W (X = L − u), M604 — торец u=0 (X = v), M602 — u=L (X = W − v).
// Сверено: верх антресоли 804x544 (M604 от переда, M602 от зада), перегородка антресоли 368x544
// (M604 от зада), цоколь пенала 80x804 (торцы на 50 от пола, M604 с 69 от правого конца, как метки в дне),
// дно ВМ2 568x319. Исключение эталона: дно и крыша ВМ6/ВМ5/ВМ4 развёрнуты при раскрое (на бирке
// первой идёт глубина), из модели это не выводится.
type Axis = 'x' | 'y' | 'z';
type Direction = { axis: Axis; sign: 1 | -1 };

const sizeAlong = (part: Part, axis: Axis) => (axis === 'x' ? part.width : axis === 'y' ? part.height : part.thickness);

// Детали у задней стенки лежат на присадочном перевёрнутыми: у задней царги пенала 2_02-06 высота
// на M601 идёт снизу (конфирмат 69 от низа), у цоколя 2_02-03 у переда — сверху (30 = 50 от пола).
const BACK_ROLES = new Set(['back-rail', 'plinth-back', 'back-panel', 'apron']);

function getPresadkaFrame(part: Part): { u: Direction; v: Direction } {
  const normal: Axis = part.thickness <= part.width && part.thickness <= part.height ? 'z' : part.width <= part.height ? 'x' : 'y';
  if (normal === 'y') return { u: { axis: 'x', sign: -1 }, v: { axis: 'z', sign: -1 } };
  if (normal === 'x') return { u: { axis: 'y', sign: -1 }, v: { axis: 'z', sign: 1 } };
  const atBack = BACK_ROLES.has(part.meta?.role ?? '');
  return { u: { axis: 'y', sign: atBack ? 1 : -1 }, v: { axis: 'x', sign: atBack ? 1 : -1 } };
}

/** Расстояние вдоль направления от края, с которого оно начинается. */
function alongDirection(part: Part, direction: Direction, value: number) {
  const half = sizeAlong(part, direction.axis) / 2;
  const offset = value - part.position[direction.axis];
  return direction.sign > 0 ? offset + half : half - offset;
}

const FACE_DIRECTION: Record<DrillOperation['face'], Direction> = {
  right: { axis: 'x', sign: 1 },
  left: { axis: 'x', sign: -1 },
  top: { axis: 'y', sign: 1 },
  bottom: { axis: 'y', sign: -1 },
  front: { axis: 'z', sign: 1 },
  back: { axis: 'z', sign: -1 },
};

/** Торец (M-код) и позиция вдоль него. Не округляем: Базис пишет истинную координату (в эталоне есть X218.350). */
function getPresadkaEdge(part: Part, op: DrillOperation): { mCode: string; x: number } {
  const { u, v } = getPresadkaFrame(part);
  const face = FACE_DIRECTION[op.face];
  const world = getFacePointWorld(part, op.face, op);
  const along = (direction: Direction) => alongDirection(part, direction, world[direction.axis]);
  // Торец в начале направления лежит там, куда направление смотрит против себя.
  if (face.axis === u.axis) {
    return face.sign === -u.sign
      ? { mCode: 'M604', x: along(v) }
      : { mCode: 'M602', x: sizeAlong(part, v.axis) - along(v) };
  }
  return face.sign === -v.sign
    ? { mCode: 'M601', x: along(u) }
    : { mCode: 'M603', x: sizeAlong(part, u.axis) - along(u) };
}

// Станок обходит деталь против часовой стрелки: низ слева направо, правый торец
// снизу вверх, верх справа налево, левый торец сверху вниз. По X это значит
// возрастание на M601/M604 и убывание на M602/M603.
const FACE_X_DESCENDING: Record<string, boolean> = {
  M601: false,
  M602: true,
  M603: true,
  M604: false,
};

const FACE_ORDER = ['M601', 'M602', 'M603', 'M604'];

// Базис пишет файлы с CRLF — станок ждёт того же.
const NC_EOL = '\r\n';

// Пласть — две грани, перпендикулярные наименьшему размеру детали. Какие именно это
// грани, зависит от ориентации: у стоящей боковины (16 x 790 x 325) пласти называются
// left/right, у лежащей полки — top/bottom. На линейном присадочном пласть не
// обрабатывается вовсе, её отверстия идут на обрабатывающий центр.
export function getPlyFaces(part: Part): ReadonlySet<DrillOperation['face']> {
  const min = Math.min(part.width, part.height, part.thickness);
  if (part.thickness === min) return new Set(['front', 'back'] as const);
  if (part.width === min) return new Set(['left', 'right'] as const);
  return new Set(['top', 'bottom'] as const);
}

export function buildPresadkaNc(part: Part): string {
  const plyFaces = getPlyFaces(part);
  const drills = part.operations.filter(
    (op): op is DrillOperation => op.type === 'drill' && !plyFaces.has(op.face),
  );
  if (drills.length === 0) return `M30${NC_EOL}`;

  // Группируем по грани (торцу)
  const grouped = new Map<string, FaceGroup>();
  for (const op of drills) {
    const { mCode, x } = getPresadkaEdge(part, op);
    if (!grouped.has(mCode)) grouped.set(mCode, { mCode, ops: [] });
    grouped.get(mCode)!.ops.push({
      x,
      depth: op.depth,
      tool: getToolCode(op),
    });
  }

  // Сортируем торцы в порядке M601→M602→M603→M604
  const groups = [...grouped.values()].sort((a, b) => FACE_ORDER.indexOf(a.mCode) - FACE_ORDER.indexOf(b.mCode));

  const lines: string[] = [];
  groups.forEach((group, idx) => {
    lines.push(group.mCode);
    const descending = FACE_X_DESCENDING[group.mCode] ?? false;
    const sortedOps = [...group.ops].sort((a, b) => (descending ? b.x - a.x : a.x - b.x));
    for (const op of sortedOps) {
      // Инструмент повторяется перед каждым отверстием, даже если он не сменился.
      lines.push(op.tool);
      lines.push(`G00 Z8.000`);
      lines.push(`G00 X${op.x.toFixed(3)}`);
      lines.push(`G01 Y${op.depth.toFixed(3)}`);
      lines.push(`G00 Y-5.00`);
    }
    if (idx < groups.length - 1) lines.push('M00');
  });

  lines.push('G00 X0.000');
  lines.push('M30');
  return lines.join(NC_EOL) + NC_EOL;
}

export type PresadkaFile = { filename: string; content: string };

/** Номер изделия в имени файла. У нас проект — одно изделие, шкафы идут модулями. */
export const PRODUCT_NUMBER = 1;

export type NumberedPart = { part: Part; module: string; index: string };

// Нумерация как в Базисе: модуль — порядковый номер шкафа, деталь нумеруется внутри
// своего модуля в порядке сборки, детали вне шкафов уходят в модуль 00. Общая для всех
// выгрузок, чтобы присадка и переделка одной детали назывались одинаково.
export function numberParts(parts: Part[]): NumberedPart[] {
  const visibleParts = parts.filter((p) => !p.meta?.hidden);
  const groupIds = [...new Set(visibleParts.map((p) => p.meta?.groupId).filter((id): id is string => Boolean(id)))];
  const groupIndexById = new Map(groupIds.map((id, i) => [id, i + 1]));
  const partCounters = new Map<string, number>();

  return visibleParts.map((part) => {
    const moduleNum = part.meta?.groupId ? groupIndexById.get(part.meta.groupId) ?? 1 : 0;
    const module = String(moduleNum).padStart(2, '0');
    const partNum = (partCounters.get(module) ?? 0) + 1;
    partCounters.set(module, partNum);
    return { part, module, index: String(partNum).padStart(2, '0') };
  });
}

// Имя как в Базисе: <заказ>-<изделие>-<модуль>-<деталь>.nc (26163-2-03-08.nc).
export function buildPresadkaFiles(parts: Part[], projectId: string): PresadkaFile[] {
  const orderId = projectId.replace(/[^a-zA-Z0-9А-Яа-яЁё]/g, '').slice(0, 10) || 'proj';
  return numberParts(parts).map(({ part, module, index }) => ({
    filename: `${orderId}-${PRODUCT_NUMBER}-${module}-${index}.nc`,
    content: buildPresadkaNc(part),
  }));
}
