// Петли: расстановка чашек в фасаде и метки ответной планки на опорной панели.
import type { Part, PartFace } from '../part';
import { type DrillOperation, createDrillOperation, getFaceAxis } from '../drill';
import { getFacePointWorld, projectWorldPointToFace } from '../face-coords';
import { type WorldPoint, withGeneratedSource } from './core';

const HINGE_CUP_DIAMETER = 35;
// Чашка петли — по эталону Базиса (26163, все 22 фасада): центр в 21.5 от кромки, глубина 12.
const HINGE_CUP_DEPTH = 12;
const HINGE_CUP_CENTER_FROM_EDGE = 21.5;
// Ответная планка петли не сверлится, а намечается: по эталону Базиса (26163, все 22 фасада
// на петлях) две метки глубиной 2 на 37 от передней кромки корпуса, через 32, по центру —
// на высоте чашки (1_01: чашка на 85 от пола, метки на 69/101).
const HINGE_PLATE_SETBACK = 37;
const HINGE_PLATE_MARK_DIAMETER = 3;
const HINGE_PLATE_MARK_DEPTH = 2;
const HINGE_PLATE_SCREW_SPACING = 32;
/** Насколько далеко от кромки фасада может стоять внутренняя грань опорной панели: накладной фасад закрывает её торец целиком. */
const HINGE_SUPPORT_SEARCH = 40;
// Крайние петли — от линии, от которой отсчитан зазор фасада (край корпуса, середина полки): 82 при
// двух петлях, 122 при трёх и больше. На фасаде это минус зазор у торца: 80/120 при обычном зазоре 2,
// 82 у низа корпуса, где фасад стоит вровень (эталон 26163: антресоль 400 — метки и чашки двери 398
// на 82/318; ВМ — метки на 82 от боковин, чашки на 80 от торцов фасада 796; пенал — 120 от верха двери).
const HINGE_EDGE_OFFSET_TWO = 82;
const HINGE_EDGE_OFFSET_MANY = 122;
const HINGE_FRONT_EDGE_GAP = 2;
const HINGE_FLUSH_TOLERANCE = 0.5;
const HINGE_BLOCK_CLEARANCE = 28;
const HINGE_SEARCH_STEP = 32;

function parseMainFrontSourceId(sourceId?: string | null) {
  if (!sourceId?.startsWith('front-main:')) return null;
  const parts = sourceId.split(':');
  const isNewShape = parts.length >= 5;
  const tierId = isNewShape ? parts[2] : undefined;
  const hingeSide = isNewShape ? parts[4] : parts[3];
  const sectionId = isNewShape ? parts[5] : parts[4];
  if ((hingeSide !== 'left' && hingeSide !== 'right')) return null;
  return { tierId, hingeSide, sectionId: sectionId || undefined } as const;
}

function getFrontHingeCount(span: number) {
  if (span <= 1000) return 2;
  if (span <= 1500) return 3;
  if (span <= 2000) return 4;
  return Math.max(5, Math.ceil(span / 500));
}

function getHingeEdgeOffset(span: number) {
  return getFrontHingeCount(span) <= 2 ? HINGE_EDGE_OFFSET_TWO : HINGE_EDGE_OFFSET_MANY;
}

/** Отступ крайних чашек от начала и конца пролёта фасада с учётом зазора у каждого торца. */
type HingeEndGaps = { start: number; end: number };

function getPreferredHingeCenters(span: number, gaps: HingeEndGaps) {
  const count = getFrontHingeCount(span);
  const edge = getHingeEdgeOffset(span);
  const top = Math.min(span / 2, edge - gaps.start);
  const bottom = Math.max(top, span - (edge - gaps.end));
  if (count <= 1) return [span / 2];
  if (count === 2) return [top, bottom];
  const usableSpan = Math.max(0, bottom - top);
  const step = usableSpan / Math.max(1, count - 1);
  return Array.from({ length: count }, (_, index) => top + step * index);
}

function getBlockedHingeBands(groupParts: Part[], frontPart: Part, hingeEdge: 'left' | 'right' | 'top' | 'bottom') {
  const ignoredIds = new Set(
    groupParts
      .filter((part) => part.id === frontPart.id || part.meta?.role === 'left-side' || part.meta?.role === 'right-side' || part.meta?.role === 'front-left' || part.meta?.role === 'front-right' || part.meta?.role === 'front-flap')
      .map((part) => part.id)
  );
  return groupParts
    .filter((part) => !ignoredIds.has(part.id))
    .map((part) => ({
      min: hingeEdge === 'left' || hingeEdge === 'right'
        ? part.position.y - part.height / 2 - HINGE_BLOCK_CLEARANCE
        : part.position.x - part.width / 2 - HINGE_BLOCK_CLEARANCE,
      max: hingeEdge === 'left' || hingeEdge === 'right'
        ? part.position.y + part.height / 2 + HINGE_BLOCK_CLEARANCE
        : part.position.x + part.width / 2 + HINGE_BLOCK_CLEARANCE,
    }));
}

function isHingeCenterBlocked(center: number, blockedBands: Array<{ min: number; max: number }>, frontPart: Part, hingeEdge: 'left' | 'right' | 'top' | 'bottom') {
  const worldValue = hingeEdge === 'left' || hingeEdge === 'right'
    ? frontPart.position.y + frontPart.height / 2 - center
    : frontPart.position.x - frontPart.width / 2 + center;
  return blockedBands.some((band) => worldValue >= band.min && worldValue <= band.max);
}

// Двери отсчитывают пролёт от верхнего торца, откидные — от левого. Вровень с корпусом стоит только
// низ двери у дна: там зазора нет, у остальных торцов — обычный.
function getHingeEndGaps(groupParts: Part[], frontPart: Part, hingeEdge: 'left' | 'right' | 'top' | 'bottom'): HingeEndGaps {
  if (hingeEdge === 'top' || hingeEdge === 'bottom') return { start: HINGE_FRONT_EDGE_GAP, end: HINGE_FRONT_EDGE_GAP };
  const frontBottom = frontPart.position.y - frontPart.height / 2;
  const flushWithBottom = groupParts.some((part) =>
    part.meta?.role === 'bottom' && Math.abs(part.position.y - part.height / 2 - frontBottom) < HINGE_FLUSH_TOLERANCE);
  return { start: HINGE_FRONT_EDGE_GAP, end: flushWithBottom ? 0 : HINGE_FRONT_EDGE_GAP };
}

function resolveSafeHingeCenters(groupParts: Part[], frontPart: Part, hingeEdge: 'left' | 'right' | 'top' | 'bottom') {
  const span = hingeEdge === 'left' || hingeEdge === 'right' ? frontPart.height : frontPart.width;
  const preferred = getPreferredHingeCenters(span, getHingeEndGaps(groupParts, frontPart, hingeEdge));
  const blockedBands = getBlockedHingeBands(groupParts, frontPart, hingeEdge);
  const minY = Math.min(...preferred);
  const maxY = Math.max(minY, ...preferred);
  return preferred.map((center) => {
    if (!isHingeCenterBlocked(center, blockedBands, frontPart, hingeEdge)) return center;
    for (let step = 1; step <= 6; step += 1) {
      const up = Math.max(minY, Math.min(maxY, center - HINGE_SEARCH_STEP * step));
      if (!isHingeCenterBlocked(up, blockedBands, frontPart, hingeEdge)) return up;
      const down = Math.max(minY, Math.min(maxY, center + HINGE_SEARCH_STEP * step));
      if (!isHingeCenterBlocked(down, blockedBands, frontPart, hingeEdge)) return down;
    }
    return center;
  }).filter((value, index, array) => array.findIndex((item) => Math.abs(item - value) < 0.001) === index);
}

/** Hinge cups along the hinge edge of a door (left/right) or a flap (top/bottom). */
export function createFrontHingeOps(frontPart: Part, hingeEdge: 'left' | 'right' | 'top' | 'bottom', groupParts: Part[]): DrillOperation[] {
  const source = withGeneratedSource(frontPart, hingeEdge, 'hinge');
  const centers = resolveSafeHingeCenters(groupParts, frontPart, hingeEdge);
  const sideEdge = hingeEdge === 'left' || hingeEdge === 'right';
  const cupX = hingeEdge === 'left'
    ? Math.max(18, Math.min(frontPart.width - 18, HINGE_CUP_CENTER_FROM_EDGE))
    : Math.max(18, Math.min(frontPart.width - 18, frontPart.width - HINGE_CUP_CENTER_FROM_EDGE));
  const cupY = hingeEdge === 'top'
    ? Math.max(18, Math.min(frontPart.height - 18, HINGE_CUP_CENTER_FROM_EDGE))
    : Math.max(18, Math.min(frontPart.height - 18, frontPart.height - HINGE_CUP_CENTER_FROM_EDGE));
  return centers.map((center, index) =>
    createDrillOperation({
      source,
      face: 'back',
      axis: getFaceAxis('back'),
      x: sideEdge ? cupX : center,
      y: sideEdge ? center : cupY,
      diameter: HINGE_CUP_DIAMETER,
      depth: Math.min(HINGE_CUP_DEPTH, frontPart.thickness),
      through: false,
      templateName: `${frontPart.meta?.hingeType === 'inset' ? 'Inset' : frontPart.meta?.hingeType === 'half-overlay' ? 'Half-overlay' : 'Overlay'} hinge cup ${index + 1}`,
      feature: 'hinge-cup',
    })
  );
}

const HINGE_SUPPORT_ROLES = {
  vertical: new Set(['left-side', 'right-side', 'partition']),
  horizontal: new Set(['top', 'bottom', 'tier-divider', 'shelf']),
};

/**
 * Панель, к которой крепится ответная планка: её грань, обращённая к проёму, лежит у кромки
 * петель фасада и перекрывает чашку по длине. Ищется по геометрии, поэтому одинаково работает
 * для боковины (накладная петля), перегородки (полунакладная) и вкладного фасада.
 */
function findHingeSupport(frontPart: Part, hingeEdge: 'left' | 'right' | 'top' | 'bottom', cup: WorldPoint, groupParts: Part[]) {
  const sideEdge = hingeEdge === 'left' || hingeEdge === 'right';
  const edgeCoord = hingeEdge === 'left'
    ? frontPart.position.x - frontPart.width / 2
    : hingeEdge === 'right'
      ? frontPart.position.x + frontPart.width / 2
      : hingeEdge === 'top'
        ? frontPart.position.y + frontPart.height / 2
        : frontPart.position.y - frontPart.height / 2;
  // Грань опоры смотрит в проём: у левой кромки это правая грань панели слева, и так далее.
  const face: PartFace = hingeEdge === 'left' ? 'right' : hingeEdge === 'right' ? 'left' : hingeEdge === 'top' ? 'bottom' : 'top';
  const inward = hingeEdge === 'left' || hingeEdge === 'bottom' ? 1 : -1;
  const roles = sideEdge ? HINGE_SUPPORT_ROLES.vertical : HINGE_SUPPORT_ROLES.horizontal;

  const candidates = groupParts
    .filter((part) => roles.has(part.meta?.role ?? '') && !part.meta?.hidden)
    .map((part) => {
      const faceCoord = sideEdge
        ? part.position.x + (face === 'right' ? 1 : -1) * part.width / 2
        : part.position.y + (face === 'top' ? 1 : -1) * part.height / 2;
      // Сколько грань опоры отстоит от кромки фасада внутрь проёма (вкладной — чуть наружу).
      const offset = (faceCoord - edgeCoord) * inward;
      const spans = sideEdge
        ? Math.abs(part.position.y - cup.y) < part.height / 2
        : Math.abs(part.position.x - cup.x) < part.width / 2;
      return { part, offset, spans };
    })
    .filter((item) => item.spans && item.offset > -5 && item.offset <= HINGE_SUPPORT_SEARCH);

  const best = candidates.sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset))[0];
  return best ? { part: best.part, face } : null;
}

/** Две метки под ответную планку на опорной панели, по одной паре на каждую чашку. */
export function createHingePlateMarkOps(frontPart: Part, hingeEdge: 'left' | 'right' | 'top' | 'bottom', cupOps: DrillOperation[], groupParts: Part[]) {
  const source = withGeneratedSource(frontPart, hingeEdge, 'hinge-plate');
  const byPart = new Map<string, DrillOperation[]>();
  const sideEdge = hingeEdge === 'left' || hingeEdge === 'right';
  cupOps.forEach((cupOp, index) => {
    const cup = getFacePointWorld(frontPart, cupOp.face, cupOp);
    const support = findHingeSupport(frontPart, hingeEdge, cup, groupParts);
    if (!support) return;
    const { part, face } = support;
    // 40 считаются от внутренней плоскости фасада: у вкладного она утоплена в корпус.
    const carcassFront = part.position.z + part.thickness / 2;
    const frontInnerPlane = frontPart.position.z - frontPart.thickness / 2;
    const setback = HINGE_PLATE_SETBACK + Math.max(0, carcassFront - frontInnerPlane);
    const ops = [-1, 1].map((sign) => {
      const world = sideEdge
        ? { x: cup.x, y: cup.y + (sign * HINGE_PLATE_SCREW_SPACING) / 2, z: carcassFront - setback }
        : { x: cup.x + (sign * HINGE_PLATE_SCREW_SPACING) / 2, y: cup.y, z: carcassFront - setback };
      const point = projectWorldPointToFace(part, face, world);
      return createDrillOperation({
        source,
        face,
        axis: getFaceAxis(face),
        x: point.x,
        y: point.y,
        diameter: HINGE_PLATE_MARK_DIAMETER,
        depth: HINGE_PLATE_MARK_DEPTH,
        through: false,
        templateName: `Hinge plate mark ${index + 1}`,
        feature: 'hinge-plate',
      });
    });
    byPart.set(part.id, [...(byPart.get(part.id) ?? []), ...ops]);
  });
  return byPart;
}
