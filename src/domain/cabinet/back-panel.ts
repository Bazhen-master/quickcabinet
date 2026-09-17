// Задние стенки: сегменты плиты, секционные стенки, паз под ХДФ.
import type { Part } from '../part';
import { type MachiningOperation, createGrooveOperation } from '../drill';
import { type SideJoinery, createEmptySideJoinery } from '../joinery';
import { type CabinetSection, resolveCabinetLayout, getSectionInnerSpan } from '../cabinet-layout';
import { BACK_PANEL_MIN_SECTION_WIDTH, BACK_PANEL_SPLIT_THRESHOLD, GENERATED_GROOVE_SOURCE_PREFIX, HDF_GROOVE_BACK_OFFSET, HDF_GROOVE_DEPTH, HDF_GROOVE_WIDTH } from './constants';

/** Паз под ХДФ насквозь по длине детали, на HDF_GROOVE_BACK_OFFSET от её задней кромки. */
export function createBackPanelGroove(part: Part, face: 'left' | 'right' | 'top' | 'bottom'): MachiningOperation {
  const common = {
    source: `${GENERATED_GROOVE_SOURCE_PREFIX}${part.meta?.role ?? part.id}:hdf`,
    feature: 'back-panel-groove' as const,
    face,
    width: HDF_GROOVE_WIDTH,
    depth: HDF_GROOVE_DEPTH,
    templateName: 'HDF back panel groove',
  };
  // Координаты грани (face-coords.ts): у боковин x идёт назад от переднего края, y — вниз по высоте;
  // у крыши и дна x — вдоль ширины, y — назад от переднего края. Задняя кромка — на part.thickness.
  const fromBack = part.thickness - HDF_GROOVE_BACK_OFFSET;
  return face === 'left' || face === 'right'
    ? createGrooveOperation({ ...common, x: fromBack, y: 0, x2: fromBack, y2: part.height })
    : createGrooveOperation({ ...common, x: 0, y: fromBack, x2: part.width, y2: fromBack });
}

/** Default joinery for a new back panel; rebuilds keep whatever the user picks. */
export function createBackPanelJoinery(): SideJoinery {
  return { ...createEmptySideJoinery(), top: 'confirmat', bottom: 'confirmat', left: 'confirmat', right: 'confirmat' };
}

type BackPanelSegment = {
  id: string;
  startX: number;
  endX: number;
  width: number;
  centerX: number;
  leftBoundary: CabinetSection['leftBoundary'];
  rightBoundary: CabinetSection['rightBoundary'];
  clearWidth: number;
};

function getBackPanelSegmentClearWidth(segment: Pick<BackPanelSegment, 'startX' | 'endX' | 'leftBoundary' | 'rightBoundary'>, thickness: number) {
  const startInset = segment.leftBoundary === 'partition' ? thickness / 2 : 0;
  const endInset = segment.rightBoundary === 'partition' ? thickness / 2 : 0;
  return Math.max(0, segment.endX - segment.startX - startInset - endInset);
}

function mergeBackPanelSegments(left: BackPanelSegment, right: BackPanelSegment, thickness: number): BackPanelSegment {
  const merged = {
    id: `${left.id}+${right.id}`,
    startX: left.startX,
    endX: right.endX,
    width: right.endX - left.startX,
    centerX: (left.startX + right.endX) / 2,
    leftBoundary: left.leftBoundary,
    rightBoundary: right.rightBoundary,
  };
  return {
    ...merged,
    clearWidth: getBackPanelSegmentClearWidth(merged, thickness),
  };
}

export function getBackPanelSegments(
  resolved: ReturnType<typeof resolveCabinetLayout>,
  innerWidth: number,
  innerHeight: number,
  thickness: number
): BackPanelSegment[] {
  if (innerWidth <= BACK_PANEL_SPLIT_THRESHOLD || innerHeight <= BACK_PANEL_SPLIT_THRESHOLD || resolved.leafSections.length <= 1) {
    return [{
      id: 'full',
      startX: -innerWidth / 2,
      endX: innerWidth / 2,
      width: innerWidth,
      centerX: 0,
      leftBoundary: 'outer',
      rightBoundary: 'outer',
      clearWidth: innerWidth,
    }];
  }

  const segments = resolved.leafSections
    .map((section) => {
      const innerSpan = getSectionInnerSpan(section, thickness);
      return {
        id: section.id,
        startX: innerSpan.startX,
        endX: innerSpan.endX,
        width: innerSpan.width,
        centerX: innerSpan.centerX,
        leftBoundary: section.leftBoundary,
        rightBoundary: section.rightBoundary,
        clearWidth: innerSpan.width,
      } satisfies BackPanelSegment;
    });

  let next = [...segments];
  while (next.length > 1) {
    const narrowIndex = next.findIndex((segment) => segment.clearWidth < BACK_PANEL_MIN_SECTION_WIDTH);
    if (narrowIndex === -1) break;
    if (narrowIndex === 0) {
      next.splice(0, 2, mergeBackPanelSegments(next[0]!, next[1]!, thickness));
      continue;
    }
    if (narrowIndex === next.length - 1) {
      next.splice(narrowIndex - 1, 2, mergeBackPanelSegments(next[narrowIndex - 1]!, next[narrowIndex]!, thickness));
      continue;
    }
    const left = next[narrowIndex - 1]!;
    const current = next[narrowIndex]!;
    const right = next[narrowIndex + 1]!;
    const mergeRight = right.clearWidth >= left.clearWidth;
    if (mergeRight) {
      next.splice(narrowIndex, 2, mergeBackPanelSegments(current, right, thickness));
    } else {
      next.splice(narrowIndex - 1, 2, mergeBackPanelSegments(left, current, thickness));
    }
  }

  return next;
}

export function getBackApronZ(position: { x: number; y: number; z: number }, depth: number, thickness: number) {
  return position.z - depth / 2 + thickness / 2;
}

export function makeSectionBackPanelKey(tierId: string, sectionId: string, zoneId?: string) {
  return zoneId ? `section-back-panel:${tierId}:${sectionId}:${zoneId}` : `section-back-panel:${tierId}:${sectionId}`;
}

export function parseSectionBackPanelKey(sourceId?: string | null) {
  if (!sourceId?.startsWith('section-back-panel:')) return null;
  const [, tierId, sectionId, ...zoneParts] = sourceId.split(':');
  const zoneId = zoneParts.length > 0 ? zoneParts.join(':') : undefined;
  return tierId && sectionId ? { tierId, sectionId, zoneId } : null;
}
