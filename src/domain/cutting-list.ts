import type { Part, PartRole } from './part';

export type CuttingListRow = {
  id: string;
  cabinet: string;
  partName: string;
  role: PartRole | 'panel';
  width: number;
  height: number;
};

function getCabinetName(part: Part, groupIndexById: Map<string, number>) {
  if (!part.meta?.groupId) return 'Loose parts';
  const index = groupIndexById.get(part.meta.groupId) ?? 1;
  const separatorMatch = part.name.match(/^(.*?)\s(?:·|В·)\s/);
  return separatorMatch?.[1]?.trim() || `Cabinet ${index}`;
}

function getPartName(part: Part) {
  const separatorMatch = part.name.match(/\s(?:·|В·)\s(.+)$/);
  return separatorMatch?.[1]?.trim() || part.name;
}

function getCuttingDimensions(part: Part) {
  const [first, second] = [part.width, part.height, part.thickness]
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a);
  return {
    width: Math.round(first ?? 0),
    height: Math.round(second ?? 0),
  };
}

export function buildCuttingList(parts: Part[]): CuttingListRow[] {
  const groupIds = [...new Set(parts.map((part) => part.meta?.groupId).filter((id): id is string => Boolean(id)))];
  const groupIndexById = new Map(groupIds.map((id, index) => [id, index + 1]));

  return parts
    .filter((part) => !part.meta?.hidden)
    .map((part) => {
      const dims = getCuttingDimensions(part);
      return {
        id: part.id,
        cabinet: getCabinetName(part, groupIndexById),
        partName: getPartName(part),
        role: part.meta?.role ?? 'panel',
        width: dims.width,
        height: dims.height,
      };
    });
}

export function cuttingListToCsv(rows: CuttingListRow[]) {
  const escapeCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  return [
    ['Cabinet', 'Part name', 'Role', 'Width', 'Height'].map(escapeCell).join(','),
    ...rows.map((row) => [row.cabinet, row.partName, row.role, row.width, row.height].map(escapeCell).join(',')),
  ].join('\n');
}
