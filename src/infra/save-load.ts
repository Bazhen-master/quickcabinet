import type { Project } from '../domain/project';
import { createPanelPart, type Part } from '../domain/part';
import { isValidSketch, nameGenericSketches, normalizeSketch } from '../domain/sketch';
import { idbDelete, idbGet, idbSet } from './idb';

const PROJECT_PROGRESS_STORAGE_KEY = 'furniture_v9:project-progress';

function isValidProject(value: unknown): value is Project {
  if (!value || typeof value !== 'object') return false;
  const parsed = value as Project;
  return Array.isArray(parsed.parts) && typeof parsed.name === 'string' && typeof parsed.id === 'string';
}

function normalizeProject(project: Project): Project {
  return {
    ...project,
    units: 'mm',
    parts: project.parts.map((part) =>
      createPanelPart({
        ...(part as Partial<Part>),
        operations: Array.isArray(part.operations) ? part.operations : [],
      })
    ),
    // Language is not known at load time; the UI is Russian-first, so legacy generic names become "Эскиз N".
    sketches: Array.isArray(project.sketches) ? nameGenericSketches(project.sketches.filter(isValidSketch).map(normalizeSketch), 'Эскиз') : [],
  };
}

export function saveProjectToFile(project: Project, fileName = 'project.furniture.json') {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// Projects live in IndexedDB (structured clone, no JSON round-trip, no ~5 MB localStorage quota).
export async function saveProjectProgress(project: Project): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await idbSet(PROJECT_PROGRESS_STORAGE_KEY, project);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not save the project to browser storage' };
  }
}

export async function loadSavedProjectProgress(): Promise<Project | null> {
  try {
    const stored = await idbGet<unknown>(PROJECT_PROGRESS_STORAGE_KEY);
    return isValidProject(stored) ? normalizeProject(stored) : null;
  } catch {
    return null;
  }
}

const SLOT_COUNT = 5;
const slotKey = (slot: number) => `furniture_v9:slot:${slot}`;
const slotMetaKey = (slot: number) => `furniture_v9:slot:${slot}:meta`;

export type SlotMeta = { name: string; savedAt: string; partCount: number };

export async function listSaveSlots(): Promise<Array<{ slot: number; meta: SlotMeta | null }>> {
  return Promise.all(Array.from({ length: SLOT_COUNT }, async (_, slot) => {
    try {
      return { slot, meta: (await idbGet<SlotMeta>(slotMetaKey(slot))) ?? null };
    } catch {
      return { slot, meta: null };
    }
  }));
}

export async function saveToSlot(slot: number, project: Project): Promise<void> {
  await idbSet(slotKey(slot), project);
  const meta: SlotMeta = {
    name: project.name,
    savedAt: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
    partCount: project.parts.length,
  };
  await idbSet(slotMetaKey(slot), meta);
}

export async function loadFromSlot(slot: number): Promise<Project | null> {
  try {
    const stored = await idbGet<unknown>(slotKey(slot));
    return isValidProject(stored) ? normalizeProject(stored) : null;
  } catch {
    return null;
  }
}

export async function deleteSaveSlot(slot: number): Promise<void> {
  await idbDelete(slotKey(slot));
  await idbDelete(slotMetaKey(slot));
}

export function openProjectFromFile(): Promise<{ ok: true; project: Project } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve({ ok: false, error: 'File picker is unavailable in this environment' });
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.furniture.json,.furnproj,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve({ ok: false, error: 'No file selected' });
        return;
      }
      try {
        const raw = await file.text();
        const parsed = JSON.parse(raw) as unknown;
        if (!isValidProject(parsed)) {
          resolve({ ok: false, error: 'Selected file is not a valid project file' });
          return;
        }
        resolve({ ok: true, project: normalizeProject(parsed) });
      } catch {
        resolve({ ok: false, error: 'Could not read project file' });
      }
    };
    input.click();
  });
}
