// ─── «Переделка»: пластевая обработка и контур на обрабатывающем центре ─────────
//
// Формат разобран по выгрузке «Базис Мебельщик», заказ 26163: 158 файлов «Переделки»
// и 11 файлов «Обратной стороны». Каждый файл — одна деталь, лежащая пластью вверх.
//
//   N10 G90 / G49 / G40 / G80 / G54        — шапка
//   M06 Tn / M03 S… / G43 Hn / G0 Z<T+20>  — смена инструмента
//   T1  S21000 паз:     G0 X Y / G1 Z F2500 / G1 X Y F4000 / G80
//   T3  S6000  метка:   G0 X Y / G1 Z  F3000 / G0 Z<T+20>
//   T6  S6000  сверло:  … F2500 (глухое и сквозное)
//   T7  S6000  Ø15:     … F1500
//   T8  S6000  чашка:   … F800
//   T2  S18000 контур:  G0 X+6 Y / G1 Z<T+5> F3000 / G1 X Y Z-0.1 / G1 … F6000 / …
//   G0 X0.0 Y2800.0 Z<T+50> / M05          — парковка
//
// Z отсчитывается от стола: глухое отверстие глубиной d — это Z = T - d, сквозное — Z-0.1.
// X всегда идёт вдоль короткой стороны детали, Y — вдоль длинной. Контур режется фрезой Ø6
// без коррекции (G40): траектория идёт по центру фрезы, на 3 мм снаружи детали, от поля 7.
// Поэтому кромка детали лежит на 10 от нуля, и отверстия с пазами отсчитываются от неё
// («Обратная сторона» — без поля и без фрезы, от нуля). Проверено по биркам 26163: бок ВМ6
// на бирке 420x319, контур 426x325; сквозные в боковине на X79 = 69 от кромки, как в присадке.

import { isDrillOperation, isGrooveOperation, type DrillOperation, type GrooveOperation } from './drill';
import { getFacePointWorld } from './face-coords';
import { getPlyFaces, numberParts, PRODUCT_NUMBER } from './nc-export';
import { getPartOutlineXY, type Part, type PartFace, type Vec3 } from './part';

export type PlyTool = 'T3' | 'T6' | 'T7' | 'T8';

export type PlyHole = {
  tool: PlyTool;
  /** Координаты на пласти в системе детали, мм (без смещения поля). */
  x: number;
  y: number;
  depth: number;
  through: boolean;
};

export type PlyGroove = {
  /** Траектория центра фрезы, мм в системе детали. */
  from: { x: number; y: number };
  to: { x: number; y: number };
  depth: number;
};

export type PeredelkaProgram = {
  thickness: number;
  /** Смещение детали в поле станка: 7 для лицевой стороны, 0 для обратной. */
  origin: number;
  grooves: PlyGroove[];
  holes: PlyHole[];
  /** Замкнутый контур без повтора первой точки; первая точка — начало реза. Нет — контур не режется. */
  contour: Array<{ x: number; y: number }> | null;
};

export const PEREDELKA_ORIGIN = 7;
/** Радиус контурной фрезы T2: контур уходит наружу детали, а сама деталь сдвигается в поле. */
export const CONTOUR_CUTTER_RADIUS = 3;
const NC_EOL = '\r\n';
const PARKING_Y = 2800;
const THROUGH_Z = -0.1;
const CONTOUR_LEAD_IN = 6;

const DRILL_TOOLS: Record<PlyTool, { spindle: number; feed: number }> = {
  T3: { spindle: 6000, feed: 3000 },
  T6: { spindle: 6000, feed: 2500 },
  T7: { spindle: 6000, feed: 1500 },
  T8: { spindle: 6000, feed: 800 },
};
const DRILL_TOOL_ORDER: PlyTool[] = ['T3', 'T6', 'T7', 'T8'];

/** 5 → «5.0», 423.501 → «423.501»: до трёх знаков, но хотя бы один после точки. */
function num(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  const text = String(rounded === 0 ? 0 : rounded);
  return text.includes('.') ? text : `${text}.0`;
}

function holeZ(hole: PlyHole, thickness: number) {
  return hole.through ? THROUGH_Z : thickness - hole.depth;
}

// Базис обходит отверстия одного инструмента группами по глубине — от мелких к глубоким
// (сквозные последними), а внутри группы жадно идёт к ближайшему.
function orderHoles(holes: PlyHole[], thickness: number): PlyHole[] {
  const byZ = new Map<number, PlyHole[]>();
  for (const hole of holes) {
    const z = holeZ(hole, thickness);
    byZ.set(z, [...(byZ.get(z) ?? []), hole]);
  }

  const ordered: PlyHole[] = [];
  for (const z of [...byZ.keys()].sort((a, b) => b - a)) {
    // Первым идёт отверстие с наименьшим Y (при равенстве — с наименьшим X), а не ближайшее
    // к нулю: в 26163-2-01-13 сквозные начинаются с X538 Y60, хотя X101 Y98 ближе к нулю.
    const pending = [...byZ.get(z)!].sort((a, b) => a.y - b.y || a.x - b.x);
    let at = pending[0];
    while (pending.length > 0) {
      let best = 0;
      let bestDistance = Infinity;
      pending.forEach((hole, index) => {
        const distance = Math.hypot(hole.x - at.x, hole.y - at.y);
        // При равном расстоянии Базис берёт отверстие с меньшим Y (26163-2-03-04: от Y521
        // до Y297 и до Y745 по 224 — идёт на 297), затем с меньшим X.
        const tie = Math.abs(distance - bestDistance) < 1e-6;
        const current = pending[best];
        if (tie ? hole.y < current.y || (hole.y === current.y && hole.x < current.x) : distance < bestDistance) {
          best = index;
          bestDistance = distance;
        }
      });
      const [next] = pending.splice(best, 1);
      ordered.push(next);
      at = next;
    }
  }
  return ordered;
}

export function buildPeredelkaNc(program: PeredelkaProgram): string {
  const { thickness, origin } = program;
  const safeZ = num(thickness + 20);
  const body: string[] = ['G90', 'G49', 'G40', 'G80', 'G54'];
  const X = (value: number) => num(value + origin);
  const Y = (value: number) => num(value + origin);

  const changeTool = (tool: string, spindle: number) => {
    const n = tool.slice(1);
    body.push(`M06 ${tool}`, `M03 S${spindle}`, `G43 H${n}`, `G0 Z${safeZ}`);
  };

  if (program.grooves.length > 0) {
    changeTool('T1', 21000);
    for (const groove of program.grooves) {
      body.push(
        'M03 S21000',
        `G0 X${X(groove.from.x)} Y${Y(groove.from.y)}`,
        `G1 Z${num(thickness - groove.depth)} F2500`,
        `G1 X${X(groove.to.x)} Y${Y(groove.to.y)} F4000`,
        'G80',
        `G0 Z${safeZ}`,
      );
    }
  }

  for (const tool of DRILL_TOOL_ORDER) {
    const holes = program.holes.filter((hole) => hole.tool === tool);
    if (holes.length === 0) continue;
    const { spindle, feed } = DRILL_TOOLS[tool];
    changeTool(tool, spindle);
    for (const hole of orderHoles(holes, thickness)) {
      // Двойной пробел перед F — так пишет постпроцессор Базиса у сверловки.
      body.push(`G0 X${X(hole.x)} Y${Y(hole.y)}`, `G1 Z${num(holeZ(hole, thickness))}  F${feed}`, `G0 Z${safeZ}`);
    }
  }

  if (program.contour && program.contour.length > 1) {
    const [start, ...rest] = program.contour;
    changeTool('T2', 18000);
    body.push(
      `G0 X${X(start.x + CONTOUR_LEAD_IN)} Y${Y(start.y)}`,
      `G1 Z${num(thickness + 5)} F3000`,
      `G1 X${X(start.x)} Y${Y(start.y)} Z${num(THROUGH_Z)}`,
    );
    [...rest, start].forEach((point, index) => {
      body.push(`G1 X${X(point.x)} Y${Y(point.y)}${index === 0 ? ' F6000' : ''}`);
    });
    body.push(`G0 Z${safeZ}`);
  }

  body.push(`G0 X0.0 Y${num(PARKING_Y)} Z${num(thickness + 50)}`, 'M05');
  return body.map((line, index) => `N${(index + 1) * 10} ${line}`).join(NC_EOL) + NC_EOL;
}

// ─── Деталь → программа ─────────────────────────────────────────────────────────

type Axis = 'x' | 'y' | 'z';
/** Единичный вектор вдоль мировой оси: ось и знак. */
type Direction = { axis: Axis; sign: 1 | -1 };

const FACE_NORMAL: Record<PartFace, Direction> = {
  right: { axis: 'x', sign: 1 },
  left: { axis: 'x', sign: -1 },
  top: { axis: 'y', sign: 1 },
  bottom: { axis: 'y', sign: -1 },
  front: { axis: 'z', sign: 1 },
  back: { axis: 'z', sign: -1 },
};

function cross(a: Direction, b: Direction): Direction {
  const next: Record<Axis, Axis> = { x: 'y', y: 'z', z: 'x' };
  const third = (['x', 'y', 'z'] as Axis[]).find((axis) => axis !== a.axis && axis !== b.axis)!;
  // e_x × e_y = e_z и циклически; в обратном порядке знак меняется.
  const cyclic = next[a.axis] === b.axis ? 1 : -1;
  return { axis: third, sign: (cyclic * a.sign * b.sign) as 1 | -1 };
}

function sizeAlong(part: Part, axis: Axis) {
  return axis === 'x' ? part.width : axis === 'y' ? part.height : part.thickness;
}

/** Расстояние от края детали, с которого начинается направление, до точки. */
function coordinateAlong(part: Part, direction: Direction, point: Vec3) {
  const half = sizeAlong(part, direction.axis) / 2;
  const offset = point[direction.axis] - part.position[direction.axis];
  return direction.sign > 0 ? offset + half : half - offset;
}

// Как деталь лежит на столе, если смотреть на пласть с нормалью n сверху.
// Y станка идёт вдоль длинной стороны в положительную мировую сторону, X = Y × n.
// По эталону 26163-1-01 это сходится на всех шести деталях: паз под ХДФ у крыши,
// дна и обеих боковин оказывается у задней кромки, чашки фасада — против меток
// планки на правой боковине, а обратная сторона дна зеркалится по X сама собой.
// Эталон симметричен относительно зеркала всего корпуса целиком, поэтому глобальный знак
// (Y вверх, а не вниз) из него не выводится — это проверяется только на станке.
//
// Уточнено по антресолям 26163 (2_06–2_08): в + мировую сторону направлена не всегда длинная ось,
// а у детали, стоящей по глубине (боковина, перегородка), — вертикаль, у лежащей — глубина, у стоящей
// поперёк (фасад, ХДФ) — длинная сторона; вторая ось зеркалится вместе с пластью. У боковин
// антресоли (400x544) так зеркалится глубина, идущая вдоль Y; у крыши и дна (804x544) X по глубине
// совпадает, как и у дна и крыши ВМ2; ХДФ 1_01-06 (774x394) — как прежде, по длинной стороне.
// Исключение — дно и крыша ВМ6, развёрнутые при раскрое.
const FIXED_AXIS_BY_NORMAL: Record<Axis, Axis | null> = { x: 'y', y: 'z', z: null };

function getPlyFrame(part: Part, face: PartFace) {
  const normal = FACE_NORMAL[face];
  const inPlane = (['y', 'x', 'z'] as Axis[]).filter((axis) => axis !== normal.axis);
  const longAxis = inPlane.reduce((best, axis) => (sizeAlong(part, axis) > sizeAlong(part, best) ? axis : best));
  // Лежащая деталь не зеркалится вовсе: у дна пенала 2_02-04 (пласть снизу) Y слева направо, X от зада,
  // как и у деталей с пластью сверху.
  if (normal.axis === 'y') {
    const shortAxis = inPlane.find((axis) => axis !== longAxis)!;
    return {
      xDirection: { axis: shortAxis, sign: 1 } as Direction,
      yDirection: { axis: longAxis, sign: 1 } as Direction,
      width: sizeAlong(part, shortAxis),
      length: sizeAlong(part, longAxis),
    };
  }
  const fixed: Direction = { axis: FIXED_AXIS_BY_NORMAL[normal.axis] ?? longAxis, sign: 1 };
  const yDirection: Direction = fixed.axis === longAxis ? fixed : cross(normal, fixed);
  const xDirection = fixed.axis === longAxis ? cross(yDirection, normal) : fixed;
  return {
    xDirection,
    yDirection,
    width: sizeAlong(part, xDirection.axis),
    length: sizeAlong(part, longAxis),
  };
}

// Инструменты пластевого сверления. Чашка петли и корпус эксцентрика узнаются по диаметру,
// метка — по глубине до 2 мм. Всё остальное Базис сверлит одним T6 — и глухие Ø5/Ø8,
// и сквозные: в эталоне 26163 других сверлильных кодов на пласти нет.
const PLY_TOOL_BY_DIAMETER: Record<number, PlyTool> = {
  35: 'T8',
  15: 'T7',
};
const MARK_MAX_DEPTH = 2;

function getPlyTool(op: DrillOperation): PlyTool {
  const byDiameter = PLY_TOOL_BY_DIAMETER[Math.round(op.diameter)];
  if (byDiameter) return byDiameter;
  return !op.through && op.depth <= MARK_MAX_DEPTH ? 'T3' : 'T6';
}

/** Толщина плиты — наименьший размер детали: у стоящей боковины `thickness` означает глубину. */
function getSheetThickness(part: Part) {
  return Math.min(part.width, part.height, part.thickness);
}

function isThroughOp(part: Part, op: DrillOperation) {
  return op.through || op.depth >= getSheetThickness(part);
}

function toPlyHole(part: Part, frame: ReturnType<typeof getPlyFrame>, op: DrillOperation, shift: number): PlyHole {
  const point = getFacePointWorld(part, op.face, op);
  const through = isThroughOp(part, op);
  return {
    tool: getPlyTool(op),
    x: coordinateAlong(part, frame.xDirection, point) + shift,
    y: coordinateAlong(part, frame.yDirection, point) + shift,
    depth: through ? getSheetThickness(part) : op.depth,
    through,
  };
}

// Паз в эталоне идёт по всей детали от торца до торца (боковина 420: Y430→Y10 на лицевой,
// Y420→Y0 на обратной) и режется вдоль Y сверху вниз, а вдоль X — слева направо (26163-1-02-03).
function toPlyGroove(part: Part, frame: ReturnType<typeof getPlyFrame>, op: GrooveOperation, shift: number): PlyGroove {
  const clampX = (value: number) => Math.max(0, Math.min(frame.width, value)) + shift;
  const clampY = (value: number) => Math.max(0, Math.min(frame.length, value)) + shift;
  const toFrame = (point: { x: number; y: number }) => {
    const world = getFacePointWorld(part, op.face, point);
    return {
      x: clampX(coordinateAlong(part, frame.xDirection, world)),
      y: clampY(coordinateAlong(part, frame.yDirection, world)),
    };
  };
  const [a, b] = [toFrame(op), toFrame({ x: op.x2, y: op.y2 })];
  const alongY = Math.abs(a.y - b.y) >= Math.abs(a.x - b.x);
  const [from, to] = alongY ? (a.y >= b.y ? [a, b] : [b, a]) : (a.x <= b.x ? [a, b] : [b, a]);
  return { from, to, depth: op.depth };
}

/**
 * Контур реза в системе станка — траектория центра фрезы, на её радиус снаружи детали. Угловые вырезы есть только у пластин в плоскости XY;
 * вершины переводятся в раскладку лицевой стороны, обход — против часовой стрелки
 * с вершины с наименьшим Y (при равенстве — X), как в эталоне: у 26163-1-01-06 рез
 * начинается с X30 Y0 после выреза, у прямоугольника — с нуля.
 */
function getPlyContour(part: Part, frame: ReturnType<typeof getPlyFrame>, shift: number) {
  const inPlane = Boolean(part.cornerNotches?.length) && getSheetThickness(part) === part.thickness;
  const points = inPlane
    ? getPartOutlineXY(part).map((point) => {
        const world = { x: part.position.x - part.width / 2 + point.x, y: part.position.y - part.height / 2 + point.y, z: part.position.z };
        return { x: coordinateAlong(part, frame.xDirection, world), y: coordinateAlong(part, frame.yDirection, world) };
      })
    : [
        { x: 0, y: 0 },
        { x: frame.width, y: 0 },
        { x: frame.width, y: frame.length },
        { x: 0, y: frame.length },
      ];
  const area = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
  const outline = area < 0 ? [...points].reverse() : points;
  // Контур деталей прямоугольный (углы 90°), поэтому вершина уходит наружу на радиус вдоль
  // нормалей обоих рёбер. Обход против часовой: наружная нормаль ребра (dx, dy) — (dy, -dx).
  const normal = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.y - a.y) / length, y: -(b.x - a.x) / length };
  };
  const ccw = outline.map((point, index) => {
    const prev = normal(outline[(index - 1 + outline.length) % outline.length], point);
    const next = normal(point, outline[(index + 1) % outline.length]);
    return {
      x: point.x + CONTOUR_CUTTER_RADIUS * (prev.x + next.x) + shift,
      y: point.y + CONTOUR_CUTTER_RADIUS * (prev.y + next.y) + shift,
    };
  });
  const start = ccw.reduce((best, point, index) => {
    const current = ccw[best];
    return point.y < current.y || (point.y === current.y && point.x < current.x) ? index : best;
  }, 0);
  return [...ccw.slice(start), ...ccw.slice(0, start)];
}

export type PeredelkaPrograms = { front: PeredelkaProgram; back: PeredelkaProgram | null };

// Лицевая сторона («Переделка») — пласть, на которой больше глухих операций (пазы считаются): в эталоне
// так у 9 из 11 деталей с обработкой с двух сторон, у двух оставшихся поровну.
// Сквозное отверстие сверлится с лицевой стороны, с какой бы пласти его ни поставили.
// Контур режется всегда и только с лицевой стороны.
export function buildPeredelkaPrograms(part: Part): PeredelkaPrograms {
  const [positive, negative] = [...getPlyFaces(part)].sort((a, b) => FACE_NORMAL[b].sign - FACE_NORMAL[a].sign);
  const onPly = (face: PartFace) => face === positive || face === negative;
  const drills = part.operations.filter(isDrillOperation).filter((op) => onPly(op.face));
  const grooves = part.operations.filter(isGrooveOperation).filter((op) => onPly(op.face));
  const thickness = getSheetThickness(part);
  const isThrough = (op: DrillOperation) => isThroughOp(part, op);
  const blindOn = (face: PartFace) => drills.filter((op) => op.face === face && !isThrough(op));
  const groovesOn = (face: PartFace) => grooves.filter((op) => op.face === face);
  const workOn = (face: PartFace) => blindOn(face).length + groovesOn(face).length;
  const frontFace = workOn(negative) > workOn(positive) ? negative : positive;
  const backFace = frontFace === positive ? negative : positive;

  const frontFrame = getPlyFrame(part, frontFace);
  const front: PeredelkaProgram = {
    thickness,
    origin: PEREDELKA_ORIGIN,
    grooves: groovesOn(frontFace).map((op) => toPlyGroove(part, frontFrame, op, CONTOUR_CUTTER_RADIUS)),
    holes: [...blindOn(frontFace), ...drills.filter(isThrough)].map((op) => toPlyHole(part, frontFrame, op, CONTOUR_CUTTER_RADIUS)),
    contour: getPlyContour(part, frontFrame, CONTOUR_CUTTER_RADIUS),
  };

  const backFrame = getPlyFrame(part, backFace);
  const backHoles = blindOn(backFace).map((op) => toPlyHole(part, backFrame, op, 0));
  const backGrooves = groovesOn(backFace).map((op) => toPlyGroove(part, backFrame, op, 0));
  const back = backHoles.length > 0 || backGrooves.length > 0
    ? { thickness, origin: 0, grooves: backGrooves, holes: backHoles, contour: null }
    : null;

  return { front, back };
}

export type PeredelkaFile = { path: string; content: string };

// Раскладка как у Базиса: «Переделка/<материал>/Detal-<изделие>_<модуль>-<деталь>.NC»,
// обратная сторона — отдельной папкой с тем же именем файла. Материала в модели нет,
// поэтому папку называем по толщине.
export function buildPeredelkaFiles(parts: Part[]): PeredelkaFile[] {
  return numberParts(parts).flatMap(({ part, module, index }) => {
    const { front, back } = buildPeredelkaPrograms(part);
    const material = `${getSheetThickness(part)}mm`;
    const filename = `Detal-${PRODUCT_NUMBER}_${module}-${index}.NC`;
    return [
      { path: `Переделка/${material}/${filename}`, content: buildPeredelkaNc(front) },
      ...(back ? [{ path: `Обратная сторона/${material}/${filename}`, content: buildPeredelkaNc(back) }] : []),
    ];
  });
}
