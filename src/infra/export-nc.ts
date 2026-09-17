import { buildNcProgram, buildPresadkaFiles } from '../domain/nc-export';
import { buildPeredelkaFiles } from '../domain/peredelka-nc';
import { buildCuttingList, cuttingListToProductionCsv } from '../domain/cutting-list';
import type { Part } from '../domain/part';
import type { Lang } from '../i18n';
import { zipSync, strToU8 } from 'fflate';

function nowStamp() {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${mi}`;
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function saveNcExport(parts: Part[]) {
  downloadBlob(buildNcProgram(parts), `razkroy-${nowStamp()}.nc`, 'text/plain;charset=utf-8');
}

export function saveProductionCsvExport(parts: Part[], lang: Lang = 'ru') {
  const rows = buildCuttingList(parts, lang);
  const csv = cuttingListToProductionCsv(rows, lang);
  downloadBlob(csv, `razkroy-${nowStamp()}.csv`, 'text/csv;charset=utf-8-bom');
}

function downloadZip(entries: Array<{ path: string; content: string }>, filename: string) {
  if (entries.length === 0) return;
  const zipEntries: Record<string, Uint8Array> = {};
  for (const { path, content } of entries) zipEntries[path] = strToU8(content);

  const zipped = zipSync(zipEntries, { level: 0 }); // level=0 = store (без сжатия, быстро)
  const blob = new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function savePresadkaZip(parts: Part[], projectName: string) {
  const files = buildPresadkaFiles(parts, projectName).map(({ filename, content }) => ({ path: `Присадка/${filename}`, content }));
  downloadZip(files, `prisadka-${nowStamp()}.zip`);
}

export function savePeredelkaZip(parts: Part[]) {
  downloadZip(buildPeredelkaFiles(parts), `peredelka-${nowStamp()}.zip`);
}
