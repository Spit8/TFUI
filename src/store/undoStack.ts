import type { TfuiProject } from "../model/types";

export const MAX_UNDO = 200;
export const COALESCE_MS = 500;

export interface UndoCoalesceMeta {
  coalesceKey: string;
  at: number;
}

export interface UndoEntry {
  project: TfuiProject;
  coalesceKey?: string;
  at?: number;
}

export interface UndoStacks {
  undo: UndoEntry[];
  redo: TfuiProject[];
}

export function pushUndo(
  stacks: UndoStacks,
  previous: TfuiProject,
  meta?: UndoCoalesceMeta,
): UndoStacks {
  if (
    meta &&
    stacks.undo.length > 0
  ) {
    const last = stacks.undo[stacks.undo.length - 1];
    if (
      last.coalesceKey === meta.coalesceKey &&
      last.at !== undefined &&
      meta.at - last.at < COALESCE_MS
    ) {
      // Keep the first "before"; only refresh timestamp
      const undo = stacks.undo.slice();
      undo[undo.length - 1] = { ...last, at: meta.at };
      return { undo, redo: [] };
    }
  }

  const entry: UndoEntry = {
    project: previous,
    coalesceKey: meta?.coalesceKey,
    at: meta?.at,
  };
  const undo = [...stacks.undo, entry];
  if (undo.length > MAX_UNDO) {
    undo.splice(0, undo.length - MAX_UNDO);
  }
  return { undo, redo: [] };
}

export function undoOnce(
  stacks: UndoStacks,
  current: TfuiProject,
): { project: TfuiProject; stacks: UndoStacks } | null {
  if (stacks.undo.length === 0) return null;
  const previous = stacks.undo[stacks.undo.length - 1];
  return {
    project: previous.project,
    stacks: {
      undo: stacks.undo.slice(0, -1),
      redo: [...stacks.redo, current],
    },
  };
}

export function redoOnce(
  stacks: UndoStacks,
  current: TfuiProject,
): { project: TfuiProject; stacks: UndoStacks } | null {
  if (stacks.redo.length === 0) return null;
  const next = stacks.redo[stacks.redo.length - 1];
  return {
    project: next,
    stacks: {
      undo: [...stacks.undo, { project: current }],
      redo: stacks.redo.slice(0, -1),
    },
  };
}
