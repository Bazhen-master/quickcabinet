import type { Part, PartRole } from './part';
import type { Lang } from '../i18n';
import { getLocalizedPartShortName } from './part-label';

export type CuttingListRow = {
  id: string;
  cabinet: string;
  partName: string;
  role: PartRole | 'panel';
  width: number;
  height: number;
  thickness: number;
};

export type SheetGroup = {
  thickness: number;
  rows: CuttingListRow[];
  totalAreaMm2: number;
  sheetsNeeded: number;
  efficiency: number; // 0–100
};

export type SheetPlanOptions = {
  sheetWidth: number;
  sheetHeight: number;
};

export const DEFAULT_SHEET: SheetPlanOptions = { sheetWidth: 2750, sheetHeight: 1830 };

export function buildSheetPlan(rows: CuttingListRow[], options?: Partial<SheetPlanOptions>): SheetGroup[] {
  const sw = options?.sheetWidth ?? DEFAULT_SHEET.sheetWidth;
  const sh = options?.sheetHeight ?? DEFAULT_SHEET.sheetHeight;
  const sheetArea = sw * sh;

  const byThickness = new Map<number, CuttingListRow[]>();
  for (const row of rows) {
    const t = row.thickness;
    if (!byThickness.has(t)) byThickness.set(t, []);
    byThickness.get(t)!.push(row);
  }

  return [...byThickness.entries()]
    .sort(([a], [b]) => b - a)
    .map(([thickness, groupRows]) => {
      const totalAreaMm2 = groupRows.reduce((sum, r) => sum + r.width * r.height, 0);
      const sheetsNeeded = Math.max(1, Math.ceil(totalAreaMm2 / sheetArea));
      const efficiency = Math.round((totalAreaMm2 / (sheetsNeeded * sheetArea)) * 100);
      return { thickness, rows: groupRows, totalAreaMm2, sheetsNeeded, efficiency };
    });
}

function getCabinetName(part: Part, groupIndexById: Map<string, number>) {
  if (!part.meta?.groupId) return 'Loose parts';
  const index = groupIndexById.get(part.meta.groupId) ?? 1;
  const separatorMatch = part.name.match(/^(.*?)\s(?:·|В·|Р’В·)\s/);
  return separatorMatch?.[1]?.trim() || `Cabinet ${index}`;
}

function getPartName(part: Part, lang: Lang) {
  return getLocalizedPartShortName(part, lang);
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

export function buildCuttingList(parts: Part[], lang: Lang = 'en'): CuttingListRow[] {
  const groupIds = [...new Set(parts.map((part) => part.meta?.groupId).filter((id): id is string => Boolean(id)))];
  const groupIndexById = new Map(groupIds.map((id, index) => [id, index + 1]));

  return parts
    .filter((part) => !part.meta?.hidden)
    .map((part) => {
      const dims = getCuttingDimensions(part);
      return {
        id: part.id,
        cabinet: getCabinetName(part, groupIndexById),
        partName: getPartName(part, lang),
        role: part.meta?.role ?? 'panel',
        width: dims.width,
        height: dims.height,
        thickness: Math.round(part.thickness),
      };
    });
}

export function cuttingListToCsv(rows: CuttingListRow[]) {
  const escapeCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  return [
    ['Cabinet', 'Part name', 'Role', 'Width', 'Height', 'Thickness'].map(escapeCell).join(','),
    ...rows.map((row) => [row.cabinet, row.partName, row.role, row.width, row.height, row.thickness].map(escapeCell).join(',')),
  ].join('\n');
}

export function cuttingListToProductionCsv(rows: CuttingListRow[], lang: Lang = 'ru'): string {
  const isRu = lang === 'ru';
  const sep = ';'; // Excel в России ожидает точку с запятой
  const escapeCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const headers = isRu
    ? ['№', 'Шкаф', 'Название', 'Роль', 'Ширина', 'Высота', 'Толщина', 'Площадь, м²']
    : ['#', 'Cabinet', 'Part name', 'Role', 'Width', 'Height', 'Thickness', 'Area, m²'];
  const dataRows = rows.map((row, i) => [
    i + 1,
    row.cabinet,
    row.partName,
    row.role,
    row.width,
    row.height,
    row.thickness,
    ((row.width * row.height) / 1_000_000).toFixed(4),
  ].map(escapeCell).join(sep));
  // BOM для корректного открытия Excel в Windows
  return '﻿' + [headers.map(escapeCell).join(sep), ...dataRows].join('\r\n');
}
