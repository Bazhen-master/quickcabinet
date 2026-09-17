// Шаг автоприсадки: царги.
import type { Part } from '../part';
import { findSectionSupport } from './horizontal';
import { getApronHostJoinery, createApronToHostMinifixOps, createApronToHostRafixOps, createApronToHostConfirmatOps, getApronSideJoinery, createApronSideMinifixOps, createApronSideRafixOps, createApronSideConfirmatOps } from './aprons';
import { appendOps } from './core';
import type { GroupJoineryContext } from './apply';

/** Царги: к хозяину (крыше, дну, полке) и к стойкам. */
export function applyApronJoinery(ctx: GroupJoineryContext) {
  const { bottom, groupParts, partitionsByX, resolvedTiers, top, updates } = ctx;
  groupParts
    .filter((part) => part.meta?.role === 'apron' && part.meta?.sourceId)
    .forEach((apronPart) => {
      const [hostRole, sectionId, hostSourceId] = (apronPart.meta?.sourceId ?? '').split(':');
      const tier = resolvedTiers.find((item) => item.resolved.leafSections.some((leaf) => leaf.id === sectionId));
      const section = tier?.resolved.leafSections.find((item) => item.id === sectionId);
      if (!section) return;
      const partitionsByX = new Map<string, Part>();
      tier?.resolved.partitions.forEach((partition) => {
        const supportPart = groupParts.find((part) => part.meta?.role === 'partition' && part.meta?.sourceId === partition.id);
        if (supportPart) partitionsByX.set(partition.x.toFixed(3), supportPart);
      });
      const leftSupport = findSectionSupport(groupParts, section, 'left', partitionsByX);
      const rightSupport = findSectionSupport(groupParts, section, 'right', partitionsByX);
      const hostPart =
        hostRole === 'top'
          ? top
          : hostRole === 'bottom'
            ? bottom
            : groupParts.find((part) => part.meta?.role === 'shelf' && part.meta?.sourceId === hostSourceId) ?? null;
      if (!hostPart) return;

      const apronHostJoinery = getApronHostJoinery(apronPart, hostRole);
      if (apronHostJoinery !== 'none') {
        const hostFace = hostRole === 'bottom' ? 'top' as const : 'bottom' as const;
        const apronFace = hostRole === 'bottom' ? 'bottom' as const : 'top' as const;
        const hostOps = apronHostJoinery === 'minifix-dowel'
          ? createApronToHostMinifixOps(apronPart, hostPart, `apron-host-${sectionId}`, hostFace, apronFace)
          : apronHostJoinery === 'rafix'
            ? createApronToHostRafixOps(apronPart, hostPart, `apron-host-${sectionId}`, hostFace, apronFace)
            : createApronToHostConfirmatOps(apronPart, hostPart, `apron-host-${sectionId}`, hostFace, apronFace);
        appendOps(updates, apronPart.id, hostOps.apronOps);
        appendOps(updates, hostPart.id, hostOps.hostOps);
      }

      if (leftSupport) {
        const leftJoinery = getApronSideJoinery(apronPart, 'left');
        if (leftJoinery !== 'none') {
          const ops = leftJoinery === 'minifix-dowel'
            ? createApronSideMinifixOps(apronPart, leftSupport, 'left')
            : leftJoinery === 'rafix'
              ? createApronSideRafixOps(apronPart, leftSupport, 'left')
              : createApronSideConfirmatOps(apronPart, leftSupport, 'left');
          appendOps(updates, apronPart.id, ops.apronOps);
          appendOps(updates, leftSupport.supportPart.id, ops.supportOps);
        }
      }
      if (rightSupport) {
        const rightJoinery = getApronSideJoinery(apronPart, 'right');
        if (rightJoinery !== 'none') {
          const ops = rightJoinery === 'minifix-dowel'
            ? createApronSideMinifixOps(apronPart, rightSupport, 'right')
            : rightJoinery === 'rafix'
              ? createApronSideRafixOps(apronPart, rightSupport, 'right')
              : createApronSideConfirmatOps(apronPart, rightSupport, 'right');
          appendOps(updates, apronPart.id, ops.apronOps);
          appendOps(updates, rightSupport.supportPart.id, ops.supportOps);
        }
      }
    });
}
