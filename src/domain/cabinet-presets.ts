import { createId } from '../shared/ids';
import { buildSimpleCabinet, getCabinetModuleState, setFrontsOnAllOpenings, type CabinetBuildInput } from './cabinet-builder';
import { getCabinetTierSpecs, resolveCabinetTierLayouts, updateAllFronts, upsertDrawerBlockInSection, type DrawerBlockInput } from './cabinet-layout';
import { createEmptySideJoinery, type JoineryType } from './joinery';
import type { Part } from './part';

export type CabinetPresetId = 'dresser' | 'nightstand' | 'tv-stand' | 'wardrobe-2' | 'wardrobe-3';

export type CabinetPreset = {
  id: CabinetPresetId;
  /** i18n key of the preset name (also the new cabinet's name). */
  labelKey: string;
  input: Omit<CabinetBuildInput, 'name' | 'position' | 'groupId' | 'layout'>;
  /** Drawer blocks by section index, left to right. */
  drawers?: Array<{ sectionIndex: number; block: Partial<DrawerBlockInput> }>;
  /** Doors over the drawer-free openings: in every section, or only the outer ones (the middle stays open). */
  doors?: 'all' | 'outer';
  /** Back panel fastening on every edge; unset keeps the builder default (confirmat). */
  backPanelJoinery?: JoineryType;
};

const DRAWER_BLOCK_DEFAULTS: DrawerBlockInput = {
  anchor: 'bottom',
  offset: 0,
  drawerCount: 3,
  columns: 1,
  slotHeight: 200,
  // The presets have a full back panel, which covers the block.
  withBackPanel: false,
  fill: false,
  runnerType: 'hidden-unihoper',
  runnerLength: 450,
  runnerLengthMode: 'auto',
};

const BODY = { thickness: 16, withBackPanel: true, withPlinth: true, plinthHeight: 60, frontMode: 'overlay', topMode: 'overlay' } as const;

export const CABINET_PRESETS: CabinetPreset[] = [
  {
    id: 'dresser',
    labelKey: 'presetDresser',
    input: { ...BODY, width: 800, height: 850, depth: 450, shelfCount: 0, partitionCount: 0, topOverFronts: true },
    drawers: [{ sectionIndex: 0, block: { fill: true, drawerCount: 4 } }],
    backPanelJoinery: 'minifix-dowel',
  },
  {
    id: 'nightstand',
    labelKey: 'presetNightstand',
    input: { ...BODY, width: 450, height: 550, depth: 400, shelfCount: 0, partitionCount: 0, topOverFronts: true },
    drawers: [{ sectionIndex: 0, block: { fill: true, drawerCount: 2 } }],
    backPanelJoinery: 'minifix-dowel',
  },
  {
    id: 'tv-stand',
    labelKey: 'presetTvStand',
    input: { ...BODY, width: 1600, height: 500, depth: 450, shelfCount: 0, partitionCount: 2, topOverFronts: true },
    drawers: [{ sectionIndex: 1, block: { drawerCount: 1, slotHeight: 180 } }],
    doors: 'outer',
    backPanelJoinery: 'minifix-dowel',
  },
  {
    id: 'wardrobe-2',
    labelKey: 'presetWardrobe2',
    input: { ...BODY, width: 1000, height: 2100, depth: 600, shelfCount: 4, partitionCount: 1 },
    doors: 'all',
  },
  {
    id: 'wardrobe-3',
    labelKey: 'presetWardrobe3',
    input: { ...BODY, width: 1500, height: 2100, depth: 600, shelfCount: 6, partitionCount: 2 },
    doors: 'all',
  },
];

export function getCabinetPreset(id: CabinetPresetId): CabinetPreset | null {
  return CABINET_PRESETS.find((preset) => preset.id === id) ?? null;
}

/**
 * The preset's own fastening (its back panel), written into the parts' joinery. Apply it after the quick-cabinet fastener
 * choice so the preset wins; rebuilds keep it like any joinery the user picked.
 */
export function applyPresetJoinery(parts: Part[], id: CabinetPresetId): Part[] {
  const backPanelJoinery = getCabinetPreset(id)?.backPanelJoinery;
  if (!backPanelJoinery) return parts;
  return parts.map((part) => (
    part.meta?.role === 'back-panel'
      ? {
          ...part,
          meta: {
            ...part.meta,
            joinery: { ...(part.meta.joinery ?? createEmptySideJoinery()), top: backPanelJoinery, bottom: backPanelJoinery, left: backPanelJoinery, right: backPanelJoinery },
          },
        }
      : part
  ));
}

/** Raw parts of a preset cabinet (the caller applies auto joinery): the body, then its drawer blocks, then doors over what is left open. */
export function buildCabinetPreset(id: CabinetPresetId, name: string, position: { x: number; y: number; z: number }): Part[] {
  const preset = getCabinetPreset(id);
  if (!preset) return [];
  const groupId = createId('cab');
  const base: CabinetBuildInput = { ...preset.input, name, position, groupId };
  let parts = buildSimpleCabinet(base);
  const module = getCabinetModuleState(parts, groupId);
  const tier = module ? getCabinetTierSpecs(module.layout)[0] : undefined;
  if (!module || !tier) return applyPresetJoinery(parts, id);

  const sections = [...(resolveCabinetTierLayouts(module.layout, module.width - module.thickness * 2, module.thickness)[0]?.resolved.leafSections ?? [])]
    .sort((a, b) => a.startX - b.startX);
  let layout = module.layout;
  (preset.drawers ?? []).forEach(({ sectionIndex, block }) => {
    const section = sections[sectionIndex];
    if (section) layout = upsertDrawerBlockInSection(layout, section.id, tier.id, { ...DRAWER_BLOCK_DEFAULTS, ...block }).layout;
  });
  if (layout !== module.layout) parts = buildSimpleCabinet({ ...base, layout });

  if (preset.doors) {
    const withDoors = setFrontsOnAllOpenings(parts, groupId);
    if (withDoors) {
      const outerSectionIds = new Set([sections[0]?.id, sections[sections.length - 1]?.id]);
      const doorsLayout = preset.doors === 'outer'
        ? updateAllFronts(withDoors, (fronts) => fronts.filter((spec) => outerSectionIds.has(spec.sectionId)))
        : withDoors;
      parts = buildSimpleCabinet({ ...base, layout: doorsLayout });
    }
  }
  return applyPresetJoinery(parts, id);
}
