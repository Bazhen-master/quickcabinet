// Публичный API автоприсадки. Код разложен по src/domain/auto-joinery/.
export { getDefaultAutoJointRules } from './auto-joinery/core';
export { applyGeneratedJoinery } from './auto-joinery/apply';
export type { AutoJointRuleDraft } from './auto-joinery/core';
