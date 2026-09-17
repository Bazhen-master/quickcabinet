// Шаги сборки: задние стенки и царги.
import { type Part, createPanelPart } from '../part';
import { NAME_SEP, HDF_GROOVE_ENGAGEMENT, HDF_BACK_THICKNESS, HDF_GROOVE_BACK_OFFSET, HDF_OVERLAY_EDGE_INSET, HANGER_NOTCH_WIDTH, HANGER_NOTCH_HEIGHT, APRON_HEIGHT, APRON_MIN_WIDTH } from './constants';
import { roleLabel } from './common';
import { createEmptySideJoinery } from '../joinery';
import { createBackPanelGroove, getBackPanelSegments, createBackPanelJoinery, makeSectionBackPanelKey, getBackApronZ } from './back-panel';
import { getSectionInnerSpan } from '../cabinet-layout';
import { getResolvedSectionDividers, getLocalSectionZones, getDrawerBlockZones } from './frames';
import type { CabinetCarcass } from './build';
import type { CabinetBuildContext } from './build-context';

/** Задние стенки: ХДФ в пазу или накладная, плита целиком или по секциям. */
export function buildBackPanelParts(ctx: CabinetBuildContext & CabinetCarcass, parts: Part[]) {
  const { bottom, bottomTierResolved, cabinetCenterY, depth, effectiveWithBackPanel, groupId, hdfBack, hdfOverlayBack, innerHeight, innerWidth, leftSide, name, options, position, resolved, rightSide, thickness, tierFrames, top } = ctx;
  const hangerNotches = options.withHangers
    ? (['top-left', 'top-right'] as const).map((corner) => ({ corner, width: HANGER_NOTCH_WIDTH, height: HANGER_NOTCH_HEIGHT }))
    : undefined;
  if (hdfOverlayBack) {
    // На задние торцы от низа дна до верха крыши, без крепежа в модели (прибивается).
    const bottomY = bottom.position.y - bottom.height / 2;
    const topY = top.position.y + top.height / 2;
    parts.push(
      createPanelPart({
        name: `${name}${NAME_SEP}${roleLabel('back-panel')}`,
        width: rightSide.position.x + rightSide.width / 2 - (leftSide.position.x - leftSide.width / 2) - HDF_OVERLAY_EDGE_INSET * 2,
        height: topY - bottomY - HDF_OVERLAY_EDGE_INSET * 2,
        thickness: HDF_BACK_THICKNESS,
        position: { x: position.x, y: (topY + bottomY) / 2, z: position.z - depth / 2 - HDF_BACK_THICKNESS / 2 },
        cornerNotches: hangerNotches,
        meta: { groupId, role: 'back-panel', joinery: createEmptySideJoinery(), sourceId: 'hdf' },
      })
    );
  } else if (hdfBack) {
    parts.push(
      createPanelPart({
        name: `${name}${NAME_SEP}${roleLabel('back-panel')}`,
        width: innerWidth + HDF_GROOVE_ENGAGEMENT * 2,
        height: innerHeight + HDF_GROOVE_ENGAGEMENT * 2,
        thickness: HDF_BACK_THICKNESS,
        position: { x: position.x, y: cabinetCenterY, z: position.z - depth / 2 + HDF_GROOVE_BACK_OFFSET },
        cornerNotches: hangerNotches,
        // В пазу стенка держится без крепежа: явный 'none' на всех кромках.
        meta: { groupId, role: 'back-panel', joinery: createEmptySideJoinery(), sourceId: 'hdf' },
      })
    );
    for (const [part, face] of [[leftSide, 'right'], [rightSide, 'left'], [top, 'bottom'], [bottom, 'top']] as const) {
      part.operations.push(createBackPanelGroove(part, face));
    }
  } else if (effectiveWithBackPanel) {
    const backPanelSegments = getBackPanelSegments(resolved[0]?.resolved ?? bottomTierResolved, innerWidth, innerHeight, thickness);
    backPanelSegments.forEach((segment, idx) => {
      parts.push(
        createPanelPart({
          name: `${name}${NAME_SEP}${roleLabel('back-panel')}${backPanelSegments.length > 1 ? ` ${idx + 1}` : ''}`,
          width: segment.width,
          height: innerHeight,
          thickness,
          position: { x: position.x + segment.centerX, y: cabinetCenterY, z: position.z - depth / 2 + thickness / 2 },
          meta: { groupId, role: 'back-panel', joinery: createBackPanelJoinery(), sourceId: segment.id },
        })
      );
    });
  } else if (
    options.backPanelSections.length > 0
    || resolved.some((tier) => [...tier.resolved.drawersBySection.values()].some((stacks) => stacks.some((stack) => stack.block?.withBackPanel)))
  ) {
    resolved.forEach((tierResolved, tierIndex) => {
      const frame = tierFrames.find((item) => item.tierId === tierResolved.tierId) ?? tierFrames[tierIndex];
      if (!frame) return;
      tierResolved.resolved.leafSections.forEach((section) => {
        const innerSpan = getSectionInnerSpan(section, thickness);
        const sectionTierDividers = getResolvedSectionDividers(tierResolved.resolved, section.id, frame, thickness);
        const localZones = getLocalSectionZones(section.id, tierResolved.tierId, tierIndex, frame, thickness, sectionTierDividers);
        const blockBackZoneIds = new Set(
          [...getDrawerBlockZones(localZones, sectionTierDividers, tierResolved.resolved.drawersBySection.get(section.id) ?? [])]
            .filter(([, stack]) => stack.block?.withBackPanel)
            .map(([zoneId]) => zoneId)
        );
        const zoneKeys = localZones.map((zone) => makeSectionBackPanelKey(tierResolved.tierId, section.id, zone.id));
        // A whole-section back panel already covers the block.
        const hasZonePanels = zoneKeys.some((key) => options.backPanelSections.includes(key))
          || (blockBackZoneIds.size > 0 && !options.backPanelSections.includes(makeSectionBackPanelKey(tierResolved.tierId, section.id)));
        if (hasZonePanels) {
          localZones.forEach((zone) => {
            const sourceId = makeSectionBackPanelKey(tierResolved.tierId, section.id, zone.id);
            if (!options.backPanelSections.includes(sourceId) && !blockBackZoneIds.has(zone.id)) return;
            parts.push(
              createPanelPart({
                name: `${name}${NAME_SEP}${roleLabel('back-panel')}`,
                width: Math.max(20, innerSpan.width),
                height: Math.max(20, zone.clearHeight),
                thickness,
                position: { x: position.x + innerSpan.centerX, y: zone.centerY, z: position.z - depth / 2 + thickness / 2 },
                meta: { groupId, role: 'back-panel', joinery: createBackPanelJoinery(), sourceId },
              })
            );
          });
          return;
        }
        const sourceId = makeSectionBackPanelKey(tierResolved.tierId, section.id);
        if (!options.backPanelSections.includes(sourceId)) return;
        parts.push(
          createPanelPart({
            name: `${name}${NAME_SEP}${roleLabel('back-panel')}`,
            width: Math.max(20, innerSpan.width),
            height: Math.max(20, frame.clearHeight),
            thickness,
            position: { x: position.x + innerSpan.centerX, y: frame.centerY, z: position.z - depth / 2 + thickness / 2 },
            meta: { groupId, role: 'back-panel', joinery: createBackPanelJoinery(), sourceId },
          })
        );
      });
    });
  }
}

/** Царги крыши, дна и полок там, где их не закрывает задняя стенка. */
export function buildApronParts(ctx: CabinetBuildContext & CabinetCarcass, parts: Part[]) {
  const { bottom, depth, groupId, name, options, position, resolved, thickness, top, width } = ctx;
  // Aprons follow the back panels: a back panel covering the spot replaces the apron there.
  const backPanelParts = parts.filter((part) => part.meta?.role === 'back-panel');
  const isCoveredByBackPanel = (centerX: number, width: number, y: number) => backPanelParts.some((panel) => (
    Math.abs(panel.position.x - centerX) < (panel.width + width) / 2 - 1
    && Math.abs(panel.position.y - y) < (panel.height + APRON_HEIGHT) / 2 - 1
  ));
  let apronIndex = 0;
  const backApronZ = getBackApronZ(position, depth, thickness);
  const createApron = (width: number, centerX: number, y: number, hostKey: string) => {
    if (width < APRON_MIN_WIDTH || isCoveredByBackPanel(position.x + centerX, width, y)) return;
    apronIndex += 1;
    parts.push(
      createPanelPart({
        name: `${name}${NAME_SEP}${roleLabel('apron', apronIndex)}`,
        width,
        height: APRON_HEIGHT,
        thickness,
        position: { x: position.x + centerX, y, z: backApronZ },
        meta: { groupId, role: 'apron', sourceId: hostKey },
      })
    );
  };
  resolved.forEach((tierResolved, tierIndex) => {
    tierResolved.resolved.leafSections.forEach((section) => {
      const innerSpan = getSectionInnerSpan(section, thickness);
      if (options.withAprons && tierIndex === resolved.length - 1) {
        createApron(innerSpan.width, innerSpan.centerX, bottom.position.y + bottom.height / 2 + APRON_HEIGHT / 2, `bottom:${section.id}`);
      }
      if (options.withAprons && tierIndex === 0) {
        createApron(innerSpan.width, innerSpan.centerX, top.position.y - top.height / 2 - APRON_HEIGHT / 2, `top:${section.id}`);
      }
      (tierResolved.resolved.shelvesBySection.get(section.id) ?? [])
        .filter((shelf) => shelf.withApron)
        .forEach((shelf) => {
          const shelfPart = parts.find((part) => part.meta?.role === 'shelf' && part.meta?.sourceId === shelf.id);
          if (!shelfPart) return;
          createApron(innerSpan.width, innerSpan.centerX, shelfPart.position.y - shelfPart.height / 2 - APRON_HEIGHT / 2, `shelf:${section.id}:${shelf.id}`);
        });
    });
  });
}
