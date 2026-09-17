// Шаг сборки: фасады по проёмам.
import type { Part } from '../part';
import { KITCHEN_FRONT_FLOOR_CLEARANCE } from './kitchen-plinth';
import { collectSectionOpenings, toOpeningSection, getOpeningRange, createOpeningFrontParts } from './fronts';
import { getCabinetTierSpecs } from '../cabinet-layout';
import { INSET_FRONT_INTERNAL_RECESS } from './constants';
import type { CabinetCarcass } from './build';
import type { CabinetBuildContext } from './build-context';

/** Фасады по проёмам и утапливание делителей под вкладными фасадами. */
/** Кухонный цоколь: фасады у пола опускаются до KITCHEN_FRONT_FLOOR_CLEARANCE. */
export function getFloorClearance(options: { withPlinth: boolean; plinthKind: string }) {
  return options.withPlinth && options.plinthKind === 'kitchen' ? KITCHEN_FRONT_FLOOR_CLEARANCE : undefined;
}

export function buildFrontParts(ctx: CabinetBuildContext & CabinetCarcass, parts: Part[]) {
  const { depth, frontMode, groupId, layout, name, options, position, resolved, thickness, tierFrames, topFrontOverhang } = ctx;
  // Fronts go over the openings they name (a tall one may span tiers); one whose boundary is gone or that now holds drawers is dropped.
  const frontOpenings = resolved.flatMap((tierResolved, tierIndex) => {
    const frame = tierFrames.find((item) => item.tierId === tierResolved.tierId) ?? tierFrames[tierIndex];
    return frame
      ? tierResolved.resolved.leafSections.flatMap((section) => collectSectionOpenings(parts, toOpeningSection(section, tierResolved.tierId, tierIndex, resolved.length, frame, position.x, thickness), thickness))
      : [];
  });
  const recessedDividerSourceIds = new Set<string>();
  getCabinetTierSpecs(layout).forEach((tier) => {
    (tier.layout.fronts ?? []).forEach((spec) => {
      const range = getOpeningRange(frontOpenings, { ...spec, tierId: tier.id });
      if (!range || range.cells.slice(range.from, range.to + 1).some((cell) => cell.hasDrawers)) return;
      parts.push(...createOpeningFrontParts(spec, range.cells[range.from]!, range.cells[range.to]!, {
        name,
        groupId,
        thickness,
        depth,
        position,
        frontMode,
        frontOpeningMode: options.frontOpeningMode,
        topOverFronts: topFrontOverhang > 0,
        floorClearance: getFloorClearance(options),
      }));
      if (frontMode !== 'inset') return;
      // An inset front standing over a divider (between tiers, or a local one) would cut into it. Shelves are already set back.
      for (let index = range.from; index < range.to; index += 1) {
        const below = range.cells[index]!;
        const above = range.cells[index + 1]!;
        recessedDividerSourceIds.add(below.tierId === above.tierId ? below.topBoundaryId : `tier-divider:${above.tierId}`);
      }
    });
  });
  // Set back like the shelves in inset mode; joinery is generated afterwards from the final geometry.
  parts.forEach((part, index) => {
    if (part.meta?.role !== 'tier-divider' || !recessedDividerSourceIds.has(part.meta.sourceId ?? '')) return;
    parts[index] = {
      ...part,
      thickness: Math.max(50, part.thickness - INSET_FRONT_INTERNAL_RECESS),
      position: { ...part.position, z: part.position.z - INSET_FRONT_INTERNAL_RECESS / 2 },
    };
  });
}
