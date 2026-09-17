// Шаг автоприсадки: петли фасадов.
import { createFrontHingeOps, createHingePlateMarkOps } from './hinges';
import { appendOps } from './core';
import type { GroupJoineryContext } from './apply';

/** Чашки петель в фасадах и метки ответных планок. */
export function applyFrontHinges(ctx: GroupJoineryContext) {
  const { groupParts, leftFronts, rightFronts, updates } = ctx;
  // Чашки сверлятся в фасаде, а под ответную планку на опорной панели ставятся метки.
  [...leftFronts, ...rightFronts, ...groupParts.filter((part) => part.meta?.role === 'front-flap')].forEach((frontPart) => {
    const hingeEdge = frontPart.meta?.hingeEdge ?? (frontPart.meta?.role === 'front-right' ? 'right' : 'left');
    const cupOps = createFrontHingeOps(frontPart, hingeEdge, groupParts);
    appendOps(updates, frontPart.id, cupOps);
    createHingePlateMarkOps(frontPart, hingeEdge, cupOps, groupParts).forEach((ops, partId) => appendOps(updates, partId, ops));
  });
}
