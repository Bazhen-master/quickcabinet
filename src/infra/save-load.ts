import type { Project } from '../domain/project';
import { createPanelPart, type Part } from '../domain/part';

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

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function saveProjectProgress(project: Project) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(PROJECT_PROGRESS_STORAGE_KEY, JSON.stringify(project));
}

export function trySaveProjectProgress(project: Project) {
  if (!canUseStorage()) {
    return { ok: false as const, error: 'Storage is unavailable in this environment' };
  }
  try {
    window.localStorage.setItem(PROJECT_PROGRESS_STORAGE_KEY, JSON.stringify(project));
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: 'Could not save project progress to local storage' };
  }
}

export function loadSavedProjectProgress(): Project | null {
  if (!canUseStorage()) return null;
  const raw = window.localStorage.getItem(PROJECT_PROGRESS_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isValidProject(parsed) ? normalizeProject(parsed) : null;
  } catch {
    return null;
  }
}

export function hasSavedProjectProgress() {
  return loadSavedProjectProgress() !== null;
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
