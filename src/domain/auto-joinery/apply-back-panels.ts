// Шаги автоприсадки: задние стенки на весь корпус и секционные.
import { getBackPanelEdgeJoinery, getBackPanelTopJoinery, appendOps, parseSectionBackPanelSource, BACK_PANEL_STAGGER } from './core';
import { createBackPanelTopMinifixOps, createBackPanelTopRafixOps, createBackPanelTopConfirmatOps, createBackPanelBottomConfirmatOps, createBackPanelBottomMinifixOps, createBackPanelBottomRafixOps, createBackPanelSideConfirmatOps, createBackPanelSideMinifixOps, createBackPanelSideRafixOps, createBackPanelTopToBottomFaceConfirmatOps } from './back-panel';
import type { DrillOperation } from '../drill';
import type { Part } from '../part';
import { findPartitionPartBySourceId } from './horizontal';
import type { GroupJoineryContext } from './apply';

/** Задняя стенка на весь корпус: к крыше, дну и боковинам. */
export function applyBackPanelJoinery(ctx: GroupJoineryContext) {
  const { backPanels, bottom, leftSide, overlayTop, rightSide, rules, top, topJoinery, updates } = ctx;
  backPanels.forEach((backPanel) => {
    const backPanelTopJoinery = getBackPanelEdgeJoinery(backPanel, 'top', getBackPanelTopJoinery(topJoinery, overlayTop));
    const topBackOps = backPanelTopJoinery === 'minifix-dowel'
      ? createBackPanelTopMinifixOps(top, backPanel, rules)
      : backPanelTopJoinery === 'rafix'
        ? createBackPanelTopRafixOps(top, backPanel, 'bottom')
      : backPanelTopJoinery === 'confirmat'
        ? createBackPanelTopConfirmatOps(top, backPanel)
        : { topOps: [] as DrillOperation[], backOps: [] as DrillOperation[] };
    appendOps(updates, top.id, 'topOps' in topBackOps ? topBackOps.topOps : topBackOps.hostOps);
    appendOps(updates, backPanel.id, topBackOps.backOps);

    const backPanelBottomJoinery = getBackPanelEdgeJoinery(backPanel, 'bottom');
    if (backPanelBottomJoinery === 'confirmat') {
      const bottomBackOps = createBackPanelBottomConfirmatOps(bottom, backPanel);
      appendOps(updates, bottom.id, bottomBackOps.bottomOps);
      appendOps(updates, backPanel.id, bottomBackOps.backOps);
    } else if (backPanelBottomJoinery === 'minifix-dowel') {
      const bottomBackOps = createBackPanelBottomMinifixOps(bottom, backPanel, rules);
      appendOps(updates, bottom.id, bottomBackOps.bottomOps);
      appendOps(updates, backPanel.id, bottomBackOps.backOps);
    } else if (backPanelBottomJoinery === 'rafix') {
      const bottomBackOps = createBackPanelBottomRafixOps(bottom, backPanel);
      appendOps(updates, bottom.id, bottomBackOps.hostOps);
      appendOps(updates, backPanel.id, bottomBackOps.backOps);
    }

    const panelMinX = backPanel.position.x - backPanel.width / 2;
    const panelMaxX = backPanel.position.x + backPanel.width / 2;

    if (panelMinX <= bottom.position.x - bottom.width / 2 + 0.001) {
      const backPanelLeftJoinery = getBackPanelEdgeJoinery(backPanel, 'left');
      if (backPanelLeftJoinery === 'confirmat') {
        const leftBackOps = createBackPanelSideConfirmatOps(backPanel, leftSide, 'left');
        appendOps(updates, backPanel.id, leftBackOps.backOps);
        appendOps(updates, leftSide.id, leftBackOps.sideOps);
      } else if (backPanelLeftJoinery === 'minifix-dowel') {
        const leftBackOps = createBackPanelSideMinifixOps(backPanel, leftSide, 'left', rules);
        appendOps(updates, backPanel.id, leftBackOps.backOps);
        appendOps(updates, leftSide.id, leftBackOps.sideOps);
      } else if (backPanelLeftJoinery === 'rafix') {
        const leftBackOps = createBackPanelSideRafixOps(backPanel, leftSide, 'left');
        appendOps(updates, backPanel.id, leftBackOps.backOps);
        appendOps(updates, leftSide.id, leftBackOps.sideOps);
      }
    }

    if (panelMaxX >= bottom.position.x + bottom.width / 2 - 0.001) {
      const backPanelRightJoinery = getBackPanelEdgeJoinery(backPanel, 'right');
      if (backPanelRightJoinery === 'confirmat') {
        const rightBackOps = createBackPanelSideConfirmatOps(backPanel, rightSide, 'right');
        appendOps(updates, backPanel.id, rightBackOps.backOps);
        appendOps(updates, rightSide.id, rightBackOps.sideOps);
      } else if (backPanelRightJoinery === 'minifix-dowel') {
        const rightBackOps = createBackPanelSideMinifixOps(backPanel, rightSide, 'right', rules);
        appendOps(updates, backPanel.id, rightBackOps.backOps);
        appendOps(updates, rightSide.id, rightBackOps.sideOps);
      } else if (backPanelRightJoinery === 'rafix') {
        const rightBackOps = createBackPanelSideRafixOps(backPanel, rightSide, 'right');
        appendOps(updates, backPanel.id, rightBackOps.backOps);
        appendOps(updates, rightSide.id, rightBackOps.sideOps);
      }
    }

  });
}

/** Секционные задние стенки: к полкам, делителям и стойкам своей секции. */
export function applySectionBackPanelJoinery(ctx: GroupJoineryContext) {
  const { bottom, groupParts, leftSide, resolvedTiers, rightSide, rules, sectionBackPanels, top, updates } = ctx;
  sectionBackPanels.forEach((backPanel) => {
    const source = parseSectionBackPanelSource(backPanel.meta?.sourceId);
    if (!source) return;
    const tierIndex = resolvedTiers.findIndex((tier) => tier.tierId === source.tierId);
    if (tierIndex < 0) return;
    const tierResolved = resolvedTiers[tierIndex];
    const section = tierResolved?.resolved.leafSections.find((item) => item.id === source.sectionId);
    if (!section) return;

    // A zone back panel is bounded by the local dividers it touches; a whole-section one by the tier's top/bottom hosts.
    const findTouchingLocalDivider = (edge: 'top' | 'bottom') => groupParts.find((part) => (
      part.meta?.role === 'tier-divider'
      && Boolean(part.meta?.sourceId) && !part.meta?.sourceId?.startsWith('tier-divider:')
      && Math.abs(part.position.x - backPanel.position.x) < part.width / 2
      && Math.abs(edge === 'top'
        ? part.position.y - part.height / 2 - (backPanel.position.y + backPanel.height / 2)
        : part.position.y + part.height / 2 - (backPanel.position.y - backPanel.height / 2)) < 1
    )) ?? null;
    const localUpperDivider = source.zoneId ? findTouchingLocalDivider('top') : null;
    const localLowerDivider = source.zoneId ? findTouchingLocalDivider('bottom') : null;
    const hasBackPanelLeftOf = (partitionPart: Part) => sectionBackPanels.some((other) => (
      other.id !== backPanel.id
      && other.position.x < partitionPart.position.x
      && Math.abs(other.position.y - backPanel.position.y) < (other.height + backPanel.height) / 2
    ));

    const explicitTopJoinery = getBackPanelEdgeJoinery(backPanel, 'top', 'confirmat');
    const explicitBottomJoinery = getBackPanelEdgeJoinery(backPanel, 'bottom', 'confirmat');
    const explicitLeftJoinery = getBackPanelEdgeJoinery(backPanel, 'left', 'confirmat');
    const explicitRightJoinery = getBackPanelEdgeJoinery(backPanel, 'right', 'confirmat');

    if (explicitTopJoinery === 'confirmat' || explicitTopJoinery === 'rafix' || explicitTopJoinery === 'minifix-dowel') {
      // Host above the panel: the local divider it touches, the cabinet top, or the divider of the tier above.
      const topHost = localUpperDivider
        ?? (tierIndex === 0
          ? top
          : groupParts.find((part) => part.meta?.role === 'tier-divider' && part.meta?.sourceId === `tier-divider:${resolvedTiers[tierIndex - 1]?.tierId}`) ?? null);
      if (topHost) {
        const topOps = explicitTopJoinery === 'rafix'
          ? createBackPanelTopRafixOps(topHost, backPanel, 'bottom')
          : explicitTopJoinery === 'minifix-dowel'
            ? createBackPanelTopMinifixOps(topHost, backPanel, rules)
            : topHost === top
              ? createBackPanelTopConfirmatOps(top, backPanel)
              : createBackPanelTopToBottomFaceConfirmatOps(topHost, backPanel);
        appendOps(updates, topHost.id, 'topOps' in topOps ? topOps.topOps : topOps.hostOps);
        appendOps(updates, backPanel.id, topOps.backOps);
      }
    }

    if (explicitBottomJoinery === 'confirmat' || explicitBottomJoinery === 'minifix-dowel' || explicitBottomJoinery === 'rafix') {
      if (localLowerDivider) {
        const bottomOps = explicitBottomJoinery === 'rafix'
          ? createBackPanelBottomRafixOps(localLowerDivider, backPanel)
          : explicitBottomJoinery === 'minifix-dowel'
            ? createBackPanelBottomMinifixOps(localLowerDivider, backPanel, rules)
            : createBackPanelBottomConfirmatOps(localLowerDivider, backPanel);
        appendOps(updates, localLowerDivider.id, 'bottomOps' in bottomOps ? bottomOps.bottomOps : bottomOps.hostOps);
        appendOps(updates, backPanel.id, bottomOps.backOps);
      } else if (tierIndex === resolvedTiers.length - 1) {
        const bottomOps = explicitBottomJoinery === 'rafix'
          ? createBackPanelBottomRafixOps(bottom, backPanel)
          : explicitBottomJoinery === 'minifix-dowel'
            ? createBackPanelBottomMinifixOps(bottom, backPanel, rules)
            : createBackPanelBottomConfirmatOps(bottom, backPanel);
        appendOps(updates, bottom.id, 'bottomOps' in bottomOps ? bottomOps.bottomOps : bottomOps.hostOps);
        appendOps(updates, backPanel.id, bottomOps.backOps);
      } else {
        const divider = groupParts.find((part) => part.meta?.role === 'tier-divider' && part.meta?.sourceId === `tier-divider:${source.tierId}`);
        if (divider) {
          const bottomOps = explicitBottomJoinery === 'rafix'
            ? createBackPanelBottomRafixOps(divider, backPanel)
            : explicitBottomJoinery === 'minifix-dowel'
              ? createBackPanelBottomMinifixOps(divider, backPanel, rules)
              : createBackPanelBottomConfirmatOps(divider, backPanel);
          appendOps(updates, divider.id, 'bottomOps' in bottomOps ? bottomOps.bottomOps : bottomOps.hostOps);
          appendOps(updates, backPanel.id, bottomOps.backOps);
        }
      }
    }

    if (explicitLeftJoinery === 'confirmat' || explicitLeftJoinery === 'minifix-dowel' || explicitLeftJoinery === 'rafix') {
      if (section.leftBoundary === 'outer') {
        const leftBackOps = explicitLeftJoinery === 'rafix'
          ? createBackPanelSideRafixOps(backPanel, leftSide, 'left')
          : explicitLeftJoinery === 'minifix-dowel'
            ? createBackPanelSideMinifixOps(backPanel, leftSide, 'left', rules)
            : createBackPanelSideConfirmatOps(backPanel, leftSide, 'left');
        appendOps(updates, backPanel.id, leftBackOps.backOps);
        appendOps(updates, leftSide.id, leftBackOps.sideOps);
      } else {
        const partition = tierResolved.resolved.partitions.find((item) => Math.abs(item.x - section.startX) < 0.001);
        const partitionPart = partition ? findPartitionPartBySourceId(groupParts, partition.id) : null;
        if (partitionPart) {
          // A section back panel sits between the partitions, exactly like one next to a cabinet side:
          // spaced along the panel's own height, fastened through the partition into the panel edge.
          const shift = hasBackPanelLeftOf(partitionPart) ? BACK_PANEL_STAGGER : 0;
          const partitionBackOps = explicitLeftJoinery === 'rafix'
            ? createBackPanelSideRafixOps(backPanel, partitionPart, 'left', shift)
            : explicitLeftJoinery === 'minifix-dowel'
              ? createBackPanelSideMinifixOps(backPanel, partitionPart, 'left', rules, shift)
              : createBackPanelSideConfirmatOps(backPanel, partitionPart, 'left', shift);
          appendOps(updates, partitionPart.id, partitionBackOps.sideOps);
          appendOps(updates, backPanel.id, partitionBackOps.backOps);
        }
      }
    }

    if (explicitRightJoinery === 'confirmat' || explicitRightJoinery === 'minifix-dowel' || explicitRightJoinery === 'rafix') {
      if (section.rightBoundary === 'outer') {
        const rightBackOps = explicitRightJoinery === 'rafix'
          ? createBackPanelSideRafixOps(backPanel, rightSide, 'right')
          : explicitRightJoinery === 'minifix-dowel'
            ? createBackPanelSideMinifixOps(backPanel, rightSide, 'right', rules)
            : createBackPanelSideConfirmatOps(backPanel, rightSide, 'right');
        appendOps(updates, backPanel.id, rightBackOps.backOps);
        appendOps(updates, rightSide.id, rightBackOps.sideOps);
      } else {
        const partition = tierResolved.resolved.partitions.find((item) => Math.abs(item.x - section.endX) < 0.001);
        const partitionPart = partition ? findPartitionPartBySourceId(groupParts, partition.id) : null;
        if (partitionPart) {
          const partitionBackOps = explicitRightJoinery === 'rafix'
            ? createBackPanelSideRafixOps(backPanel, partitionPart, 'right')
            : explicitRightJoinery === 'minifix-dowel'
              ? createBackPanelSideMinifixOps(backPanel, partitionPart, 'right', rules)
              : createBackPanelSideConfirmatOps(backPanel, partitionPart, 'right');
          appendOps(updates, partitionPart.id, partitionBackOps.sideOps);
          appendOps(updates, backPanel.id, partitionBackOps.backOps);
        }
      }
    }
  });
}
