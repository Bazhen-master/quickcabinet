import type { Project } from '../domain/project';

export type HistoryState = {
  past: Project[];
  present: Project;
  future: Project[];
};

export function createHistory(present: Project): HistoryState {
  return { past: [], present, future: [] };
}

/** Undo depth: every step is a whole project snapshot, so an unbounded history keeps growing the tab's memory. */
const HISTORY_LIMIT = 100;

export function applyProject(history: HistoryState, next: Project): HistoryState {
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
  };
}

export function undo(history: HistoryState): HistoryState {
  if (history.past.length === 0) return history;
  const prev = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: prev,
    future: [history.present, ...history.future],
  };
}

export function redo(history: HistoryState): HistoryState {
  if (history.future.length === 0) return history;
  const next = history.future[0];
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: history.future.slice(1),
  };
}
