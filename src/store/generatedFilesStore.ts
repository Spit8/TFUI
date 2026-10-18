import { useEffect, useState } from "react";
import {
  collectGenerationNotices,
  generateProject,
  validateGeneratedFiles,
  type GeneratedFile,
  type GenerationNotice,
  type LuaSyntaxError,
} from "../codegen";
import type { TfuiProject } from "../model/types";
import { useProjectStore } from "./projectStore";

const DEBOUNCE_MS = 300;

export interface GeneratedFilesState {
  files: GeneratedFile[];
  luaErrors: LuaSyntaxError[];
  notices: GenerationNotice[];
  generating: boolean;
}

let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
let snapshot: GeneratedFilesState = {
  files: [],
  luaErrors: [],
  notices: [],
  generating: false,
};

function emit(): void {
  for (const l of listeners) l();
}

function regenerate(project: TfuiProject | null): void {
  if (!project) {
    snapshot = { files: [], luaErrors: [], notices: [], generating: false };
    emit();
    return;
  }
  snapshot = { ...snapshot, generating: true };
  emit();
  const files = generateProject(project);
  snapshot = {
    files,
    luaErrors: validateGeneratedFiles(files),
    notices: collectGenerationNotices(project),
    generating: false,
  };
  emit();
  void import("./deployStatusStore").then((m) => {
    m.scheduleDeployStatusRefresh();
  });
}

function schedule(project: TfuiProject | null): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    regenerate(project);
  }, DEBOUNCE_MS);
}

let subscribedToProject = false;

function ensureProjectSubscription(): void {
  if (subscribedToProject) return;
  subscribedToProject = true;
  let last = useProjectStore.getState().project;
  schedule(last);
  useProjectStore.subscribe((state) => {
    if (state.project === last) return;
    last = state.project;
    schedule(last);
  });
}

export function getGeneratedFilesSnapshot(): GeneratedFilesState {
  return snapshot;
}

/** Hook partagé CodePanel + ProblemsPanel (R17). */
export function useGeneratedFiles(): GeneratedFilesState {
  ensureProjectSubscription();
  const [state, setState] = useState(snapshot);
  useEffect(() => {
    const listener = () => setState(snapshot);
    listeners.add(listener);
    setState(snapshot);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return state;
}

/** Pour tests. */
export function _resetGeneratedFilesStoreForTests(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  snapshot = { files: [], luaErrors: [], notices: [], generating: false };
  listeners.clear();
  subscribedToProject = false;
}
