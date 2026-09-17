// Шаги автоприсадки: крыша и дно к стойкам.
import { getPartitionTopJoinery, appendOps, shiftOpsForFrontOverhang, type SectionSupport, getPartitionBottomJoinery } from './core';
import { createTopJoineryOps, createBottomPartitionConfirmatOps, createBottomPartitionMinifixDowelOps, createBottomPartitionRafixOps, createHorizontalJoineryOps, getBottomSideJoinery } from './horizontal';
import { createOverlayTopMinifixOps, createOverlayTopConfirmatOps } from './top';
import { createHorizontalConfirmatDowelOps } from './confirmat-dowel';
import type { DrillOperation } from '../drill';
import type { GroupJoineryContext } from './apply';

/** Крыша к боковинам и перегородкам верхнего яруса. */
export function applyTopJoinery(ctx: GroupJoineryContext) {
  const { overlayTop, plinthEnabled, rules, top, topJoinery, topLayoutPart, topSupports, updates } = ctx;
  if (overlayTop) {
    topSupports.forEach((support) => {
      const sideKey = support.sectionSide;
      const ops = support.supportPart.meta?.role === 'partition'
        ? (() => {
            const joinery = getPartitionTopJoinery(support.supportPart, plinthEnabled);
            return createTopJoineryOps(topLayoutPart, support, `top-${support.supportPart.id}`, joinery, rules);
          })()
        : (() => {
            const joinery = sideKey === 'left' ? topJoinery.left : topJoinery.right;
            return joinery === 'minifix-dowel'
              ? createOverlayTopMinifixOps(topLayoutPart, support, rules)
              : joinery === 'confirmat'
                ? createOverlayTopConfirmatOps(topLayoutPart, support.supportPart, sideKey, rules)
                : { horizontalOps: [] as DrillOperation[], supportOps: [] as DrillOperation[] };
          })();
      appendOps(updates, top.id, shiftOpsForFrontOverhang(top, ops.horizontalOps));
      appendOps(updates, support.supportPart.id, ops.supportOps);
    });
  } else {
    topSupports.forEach((support, idx) => {
      const sideKey = support.sectionSide === 'left' ? 'left' : 'right';
      const joinery =
        support.supportPart.meta?.role === 'left-side'
          ? topJoinery.left
          : support.supportPart.meta?.role === 'right-side'
            ? topJoinery.right
            : getPartitionTopJoinery(support.supportPart, plinthEnabled);
      const ops = createTopJoineryOps(topLayoutPart, support, support.supportPart.meta?.role === 'partition' ? `top-${idx}` : sideKey, joinery, rules);
      appendOps(updates, top.id, shiftOpsForFrontOverhang(top, ops.horizontalOps));
      appendOps(updates, support.supportPart.id, ops.supportOps);
    });
  }
}

/** Дно к боковинам и перегородкам нижнего яруса. */
export function applyBottomJoinery(ctx: GroupJoineryContext) {
  const { bottom, bottomTierPartitions, leftSide, rightSide, rules, updates } = ctx;
  const bottomSupports: SectionSupport[] = [
    { supportPart: leftSide, sectionSide: 'left', supportFace: 'right' },
    ...bottomTierPartitions
      .map((supportPart) => ({ supportPart, sectionSide: 'right' as const, supportFace: 'left' as const })),
    { supportPart: rightSide, sectionSide: 'right', supportFace: 'left' },
  ];

  bottomSupports.forEach((support, idx) => {
    const sideKey = `bottom-${idx}`;
    const ops = support.supportPart.meta?.role === 'partition'
      ? (() => {
          const joinery = getPartitionBottomJoinery(support.supportPart, 'none');
          if (joinery === 'confirmat') return createBottomPartitionConfirmatOps(bottom, support, sideKey, rules);
          if (joinery === 'confirmat-dowel') return createHorizontalConfirmatDowelOps(bottom, support.supportPart, sideKey, rules);
          if (joinery === 'minifix-dowel') return createBottomPartitionMinifixDowelOps(bottom, support, sideKey, rules);
          if (joinery === 'rafix') return createBottomPartitionRafixOps(bottom, support, sideKey, rules);
          return { horizontalOps: [] as DrillOperation[], supportOps: [] as DrillOperation[] };
        })()
      : createHorizontalJoineryOps(bottom, support, sideKey, getBottomSideJoinery(bottom, support.sectionSide), rules);
    appendOps(updates, bottom.id, ops.horizontalOps);
    appendOps(updates, support.supportPart.id, ops.supportOps);
  });
}
