import { create } from "zustand";

export interface RuntimeIssue {
  /** `execution` : banc Lua de l’éditeur ; `game` : journal du jeu. */
  source: "execution" | "game";
  severity: "error" | "warning" | "info";
  message: string;
  file?: string;
}

interface RuntimeIssuesState {
  execution: RuntimeIssue[];
  game: RuntimeIssue[];
  /** Date de la dernière vérification d’exécution (ms), null si jamais. */
  executionCheckedAt: number | null;
  setExecution: (issues: RuntimeIssue[]) => void;
  setGame: (issues: RuntimeIssue[]) => void;
}

/** Problèmes trouvés en exécutant le code (banc Lua, journal du jeu). */
export const useRuntimeIssuesStore = create<RuntimeIssuesState>((set) => ({
  execution: [],
  game: [],
  executionCheckedAt: null,
  setExecution: (execution) => set({ execution, executionCheckedAt: Date.now() }),
  setGame: (game) => set({ game }),
}));
