// applyGeneratedJoinery — пересборка автоприсадки: для каждого корпуса контекст и шаги из apply-*.ts.
import type { Part } from '../part';
import { type AutoJointRuleDraft, type ShelfSidePipelineStat, isSectionBackPanel, isPlinthEnabled, isOverlayTop, withoutFrontOverhang, type SectionSupport, getDefaultAutoJointRules, withoutGeneratedOps, countOpsBySource } from './core';
import type { DrillOperation } from '../drill';
import { resolveCabinetTierLayouts } from '../cabinet-layout';
import { createEmptySideJoinery } from '../joinery';
import { findPartitionPartBySourceId, debugShelfJoineryDump } from './horizontal';
import { normalizePartDrillOperations } from '../drill-spacing';
import { applyApronJoinery } from './apply-aprons';
import { applyBackPanelJoinery, applySectionBackPanelJoinery } from './apply-back-panels';
import { applyBottomJoinery, applyTopJoinery } from './apply-carcass';
import { applyDividerJoinery } from './apply-dividers';
import { applyFrontHinges } from './apply-fronts';
import { applyShelfJoinery } from './apply-shelves';

/** Детали и опоры одного корпуса, нужные всем шагам. null — корпус неполный, присадка не строится. */
// Эталон 26163: у корпусов с накладной ХДФ (антресоли, пенал 2_02) последний конфирмат по глубине 544 стоит
// на шаг сетки дальше от задней кромки (91), чем без неё (полка в нише без ХДФ — 59).
const OVERLAY_HDF_JOINT_BACK_RESERVE = 32;

export function createGroupJoineryContext(groupParts: Part[], previousParts: Part[], groupRules: AutoJointRuleDraft, updates: Map<string, DrillOperation[]>, shelfDebugDecisions: ShelfSidePipelineStat[]) {
  const leftSide = groupParts.find((part) => part.meta?.role === 'left-side');
  const rightSide = groupParts.find((part) => part.meta?.role === 'right-side');
  const top = groupParts.find((part) => part.meta?.role === 'top');
  const bottom = groupParts.find((part) => part.meta?.role === 'bottom');
  const backPanels = groupParts.filter((part) => part.meta?.role === 'back-panel' && !isSectionBackPanel(part.meta?.sourceId));
  const sectionBackPanels = groupParts.filter((part) => part.meta?.role === 'back-panel' && isSectionBackPanel(part.meta?.sourceId));
  const layoutCarrier = groupParts.find((part) => part.meta?.role === 'left-side' && part.meta?.cabinetLayout);
  if (!leftSide || !rightSide || !top || !bottom || !layoutCarrier?.meta?.cabinetLayout) return null;
  // Накладная ХДФ стоит за задними торцами корпуса.
  const sidesBack = leftSide.position.z - leftSide.thickness / 2;
  const hasOverlayHdf = backPanels.some((panel) => panel.position.z + panel.thickness / 2 <= sidesBack + 0.5);
  // Кухонный цоколь на ножках — одна передняя планка без задней.
  const onLegs = groupParts.some((part) => part.meta?.role === 'plinth-front') && !groupParts.some((part) => part.meta?.role === 'plinth-back');
  const rules: AutoJointRuleDraft = {
    ...groupRules,
    ...(hasOverlayHdf ? { jointBackReserve: OVERLAY_HDF_JOINT_BACK_RESERVE } : {}),
    ...(onLegs ? { jointBottomFrontSingle: true } : {}),
  };

  const resolvedTiers = resolveCabinetTierLayouts(layoutCarrier.meta.cabinetLayout, bottom.width, leftSide.width);
  const primaryResolved = resolvedTiers[0]?.resolved;
  if (!primaryResolved) return null;
  const plinthEnabled = isPlinthEnabled(groupParts);
  const overlayTop = isOverlayTop(top, bottom);

  const topJoinery = top.meta?.joinery ?? createEmptySideJoinery();
  // A top over the fronts is joined as if it ended at the carcass front; its ops are shifted back onto it below.
  const topLayoutPart = withoutFrontOverhang(top);
  const partitionParts = groupParts.filter((part) => part.meta?.role === 'partition');
  // By tier, not by height: partitions of a lower tier must not be joined to the top panel through a tier divider (and vice versa).
  const getTierPartitionParts = (tier: (typeof resolvedTiers)[number] | undefined) => (tier?.resolved.partitions ?? [])
    .map((partition) => findPartitionPartBySourceId(groupParts, partition.id))
    .filter((part): part is Part => Boolean(part));
  const topTierPartitions = getTierPartitionParts(resolvedTiers[0]);
  const bottomTierPartitions = getTierPartitionParts(resolvedTiers[resolvedTiers.length - 1]);
  const leftFronts = groupParts.filter((part) => part.meta?.role === 'front-left');
  const rightFronts = groupParts.filter((part) => part.meta?.role === 'front-right');

  const topSupports: SectionSupport[] = overlayTop
    ? [
        {
          supportPart: leftSide,
          sectionSide: 'left',
          supportFace: topJoinery.left === 'minifix-dowel' ? 'right' : 'top',
        },
        {
          supportPart: rightSide,
          sectionSide: 'right',
          supportFace: topJoinery.right === 'minifix-dowel' ? 'left' : 'top',
        },
        ...topTierPartitions
          .map((supportPart) => ({ supportPart, sectionSide: 'right' as const, supportFace: 'top' as const })),
      ]
    : [
        { supportPart: leftSide, sectionSide: 'left', supportFace: 'right' },
        { supportPart: rightSide, sectionSide: 'right', supportFace: 'left' },
        ...topTierPartitions
          .map((supportPart) => ({ supportPart, sectionSide: 'right' as const, supportFace: 'top' as const })),
      ];

  const partitionsByX = new Map(
    partitionParts
      .map((part) => [part.position.x.toFixed(3), part] as const)
  );
  return { backPanels, bottom, bottomTierPartitions, groupParts, leftFronts, leftSide, overlayTop, partitionsByX, plinthEnabled, resolvedTiers, rightFronts, rightSide, sectionBackPanels, top, topJoinery, topLayoutPart, topSupports, previousParts, rules, shelfDebugDecisions, updates };
}

export type GroupJoineryContext = NonNullable<ReturnType<typeof createGroupJoineryContext>>;

export function applyGeneratedJoinery(parts: Part[], rules: AutoJointRuleDraft = getDefaultAutoJointRules()): Part[] {
  const previousParts = parts;
  const cleaned = parts.map(withoutGeneratedOps);
  const updates = new Map<string, DrillOperation[]>();
  const byGroup = new Map<string, Part[]>();
  const shelfDebugDecisions: ShelfSidePipelineStat[] = [];

  cleaned.forEach((part) => {
    const groupId = part.meta?.groupId;
    if (!groupId) return;
    byGroup.set(groupId, [...(byGroup.get(groupId) ?? []), part]);
  });byGroup.forEach((groupParts) => {
    const ctx = createGroupJoineryContext(groupParts, previousParts, rules, updates, shelfDebugDecisions);
    if (!ctx) return;
    applyTopJoinery(ctx);
    applyFrontHinges(ctx);
    applyBackPanelJoinery(ctx);
    applySectionBackPanelJoinery(ctx);
    applyShelfJoinery(ctx);
    applyApronJoinery(ctx);
    applyDividerJoinery(ctx);
    applyBottomJoinery(ctx);
  });

  const result = cleaned.map((part) =>
    normalizePartDrillOperations(
      updates.has(part.id)
        ? {
            ...part,
            operations: [...part.operations, ...(updates.get(part.id) ?? [])],
          }
        : part
    )
  );
  const finalizedShelfStats = shelfDebugDecisions.map((stat) => {
    const finalStoredOps = stat.sourceKey ? countOpsBySource(result, stat.sourceKey) : 0;
    const renderedMarkers = finalStoredOps;
    if (finalStoredOps > stat.generatedOps) {
      console.warn('[shelf-joinery-debug][stale-ops-detected]', {
        shelfId: stat.shelfId,
        side: stat.side,
        sourceKey: stat.sourceKey,
        generatedOps: stat.generatedOps,
        finalStoredOps,
      });
    }
    return { ...stat, finalStoredOps, renderedMarkers };
  });
  debugShelfJoineryDump(finalizedShelfStats);
  return result;
}
