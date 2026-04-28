import { buildNcProgram } from '../domain/nc-export';
import type { Part } from '../domain/part';

function nowStamp() {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${mi}`;
}

export function saveNcExport(parts: Part[]) {
  const content = buildNcProgram(parts);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `project-${nowStamp()}.nc`;
  a.click();
  URL.revokeObjectURL(url);
}

