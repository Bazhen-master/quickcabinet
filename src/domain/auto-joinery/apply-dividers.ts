// Шаг автоприсадки: ярусные и местные делители, колонны ящиков.
import { createEmptySideJoinery } from '../joinery';
import { type SectionSupport, appendOps, getPartitionBottomJoinery, getPartitionTopCamFace, getPartitionTopJoinery, getStaggeredJointRules, findTouchingSectionSupport, hasMirroredHorizontalJoint, getPartitionBottomCamFace } from './core';
import { createHorizontalJoineryOps, findPartitionPartBySourceId, createBottomPartitionConfirmatOps, createBottomPartitionMinifixDowelOps, createBottomPartitionRafixOps, createTopJoineryOps } from './horizontal';
import type { Part } from '../part';
import { createHorizontalConfirmatDowelOps } from './confirmat-dowel';
import type { DrillOperation } from '../drill';
import type { GroupJoineryContext } from './apply';

/** Ярусные и местные делители, колонны блоков ящиков. */
export function applyDividerJoinery(ctx: GroupJoineryContext) {
  const { groupParts, leftSide, plinthEnabled, resolvedTiers, rightSide, rules, updates } = ctx;
  groupParts
    .filter((part) => part.meta?.role === 'tier-divider' && part.meta?.sourceId)
    .forEach((dividerPart) => {
      const dividerTierId = dividerPart.meta?.sourceId?.replace('tier-divider:', '') ?? '';
      const dividerTierIndex = resolvedTiers.findIndex((tier) => tier.tierId === dividerTierId);
      if (dividerTierIndex < 0) return;

      const dividerJoinery = dividerPart.meta?.joinery ?? createEmptySideJoinery();
      const upperTier = resolvedTiers[dividerTierIndex] ?? null;
      const lowerTier = resolvedTiers[dividerTierIndex + 1] ?? null;

      const leftDividerSupport: SectionSupport = { supportPart: leftSide, sectionSide: 'left', supportFace: 'right' };
      const rightDividerSupport: SectionSupport = { supportPart: rightSide, sectionSide: 'right', supportFace: 'left' };

      if (dividerJoinery.left !== 'none') {
        const ops = createHorizontalJoineryOps(dividerPart, leftDividerSupport, 'left', dividerJoinery.left, rules);
        appendOps(updates, dividerPart.id, ops.horizontalOps);
        appendOps(updates, leftSide.id, ops.supportOps);
      }

      if (dividerJoinery.right !== 'none') {
        const ops = createHorizontalJoineryOps(dividerPart, rightDividerSupport, 'right', dividerJoinery.right, rules);
        appendOps(updates, dividerPart.id, ops.horizontalOps);
        appendOps(updates, rightSide.id, ops.supportOps);
      }

      // The divider's own top/bottom joinery is not editable in the inspector, so the partition's setting drives the joint;
      // an explicit divider value (legacy projects) still wins.
      const joinedUpperPartitions: Part[] = [];
      if (upperTier) {
        upperTier.resolved.partitions.forEach((partition, idx) => {
          const supportPart = findPartitionPartBySourceId(groupParts, partition.id);
          if (!supportPart) return;
          const joinery = dividerJoinery.top !== 'none' ? dividerJoinery.top : getPartitionBottomJoinery(supportPart, 'none');
          if (joinery === 'none') return;
          joinedUpperPartitions.push(supportPart);
          const support: SectionSupport = {
            supportPart,
            sectionSide: 'right',
            supportFace: getPartitionTopCamFace(dividerPart, supportPart),
          };
          const ops = joinery === 'confirmat'
            ? createBottomPartitionConfirmatOps(dividerPart, support, `tier-divider-top-${idx}`, rules)
            : joinery === 'confirmat-dowel'
            ? createHorizontalConfirmatDowelOps(dividerPart, supportPart, `tier-divider-top-${idx}`, rules)
            : joinery === 'minifix-dowel'
              ? createBottomPartitionMinifixDowelOps(dividerPart, support, `tier-divider-top-${idx}`, rules)
              : joinery === 'rafix'
                ? createBottomPartitionRafixOps(dividerPart, support, `tier-divider-top-${idx}`, rules)
                : { horizontalOps: [] as DrillOperation[], supportOps: [] as DrillOperation[] };
          appendOps(updates, dividerPart.id, ops.horizontalOps);
          appendOps(updates, supportPart.id, ops.supportOps);
        });
      }

      if (lowerTier) {
        lowerTier.resolved.partitions.forEach((partition, idx) => {
          const supportPart = findPartitionPartBySourceId(groupParts, partition.id);
          if (!supportPart) return;
          const joinery = dividerJoinery.bottom !== 'none' ? dividerJoinery.bottom : getPartitionTopJoinery(supportPart, plinthEnabled);
          if (joinery === 'none') return;
          const support: SectionSupport = {
            supportPart,
            sectionSide: 'right',
            supportFace: 'top',
          };
          const stacked = joinedUpperPartitions.some((upper) =>
            Math.abs(upper.position.x - supportPart.position.x) < (upper.width + supportPart.width) / 2 + 8
          );
          const jointRules = stacked ? getStaggeredJointRules(dividerPart, rules) : rules;
          const ops = createTopJoineryOps(dividerPart, support, `tier-divider-bottom-${idx}`, joinery, jointRules);
          appendOps(updates, dividerPart.id, ops.horizontalOps);
          appendOps(updates, supportPart.id, ops.supportOps);
        });
      }
    });

  // Local (in-section) dividers: joined to the section's side/partition by their own left/right joinery.
  groupParts
    .filter((part) => part.meta?.role === 'tier-divider' && part.meta?.sourceId && !part.meta.sourceId.startsWith('tier-divider:'))
    .forEach((dividerPart) => {
      const joinery = dividerPart.meta?.joinery ?? createEmptySideJoinery();
      (['left', 'right'] as const).forEach((side) => {
        const sideJoinery = joinery[side];
        if (sideJoinery === 'none' || sideJoinery === 'shelf_pin') return;
        const support = findTouchingSectionSupport(groupParts, dividerPart, side);
        if (!support) return;
        const jointRules = side === 'left' && hasMirroredHorizontalJoint(groupParts, dividerPart, support) ? getStaggeredJointRules(dividerPart, rules) : rules;
        const ops = createHorizontalJoineryOps(dividerPart, support, `local-divider-${side}`, sideJoinery, jointRules);
        appendOps(updates, dividerPart.id, ops.horizontalOps);
        appendOps(updates, support.supportPart.id, ops.supportOps);
      });
    });

  // Drawer-block columns: joined to the horizontal panels they touch above and below.
  const columnHosts = groupParts.filter((part) => part.meta?.role === 'top' || part.meta?.role === 'bottom' || part.meta?.role === 'tier-divider');
  groupParts
    .filter((part) => part.meta?.role === 'drawer-column')
    .forEach((columnPart) => {
      const joinery = columnPart.meta?.joinery ?? createEmptySideJoinery();
      const covers = (host: Part) => Math.abs(host.position.x - columnPart.position.x) < host.width / 2;
      const columnTop = columnPart.position.y + columnPart.height / 2;
      const columnBottom = columnPart.position.y - columnPart.height / 2;
      const above = columnHosts.find((host) => covers(host) && Math.abs(host.position.y - host.height / 2 - columnTop) < 1);
      const below = columnHosts.find((host) => covers(host) && Math.abs(host.position.y + host.height / 2 - columnBottom) < 1);
      if (above && joinery.top !== 'none') {
        const support: SectionSupport = { supportPart: columnPart, sectionSide: 'right', supportFace: 'top' };
        const ops = createTopJoineryOps(above, support, `drawer-column-top-${columnPart.id}`, joinery.top, rules);
        appendOps(updates, above.id, ops.horizontalOps);
        appendOps(updates, columnPart.id, ops.supportOps);
      }
      if (below && joinery.bottom !== 'none') {
        const support: SectionSupport = { supportPart: columnPart, sectionSide: 'right', supportFace: getPartitionBottomCamFace(below, columnPart) };
        const sideKey = `drawer-column-bottom-${columnPart.id}`;
        const ops = joinery.bottom === 'confirmat'
          ? createBottomPartitionConfirmatOps(below, support, sideKey, rules)
          : joinery.bottom === 'confirmat-dowel'
          ? createHorizontalConfirmatDowelOps(below, columnPart, sideKey, rules)
          : joinery.bottom === 'minifix-dowel'
            ? createBottomPartitionMinifixDowelOps(below, support, sideKey, rules)
            : joinery.bottom === 'rafix'
              ? createBottomPartitionRafixOps(below, support, sideKey, rules)
              : { horizontalOps: [] as DrillOperation[], supportOps: [] as DrillOperation[] };
        appendOps(updates, below.id, ops.horizontalOps);
        appendOps(updates, columnPart.id, ops.supportOps);
      }
    });
}
