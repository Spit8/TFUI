import { create } from "zustand";
import { t } from "../i18n";

export interface UserCodeIssue {
  /** `missing` : handler choisi dans l’éditeur absent du fichier ; `orphan` : fichier sans écran. */
  kind: "missing" | "orphan";
  /** Chemin absolu du fichier handlers. */
  path: string;
  /** Nom du fichier (`<fileBase>.handlers.lua`). */
  file: string;
  handlers: string[];
}

interface UserCodeState {
  issues: UserCodeIssue[];
  setIssues: (issues: UserCodeIssue[]) => void;
}

/** État des fichiers de code de l’utilisateur, relevé à chaque écriture GUI. */
export const useUserCodeStore = create<UserCodeState>((set) => ({
  issues: [],
  setIssues: (issues) => set({ issues }),
}));

export function userCodeIssueMessage(issue: UserCodeIssue): string {
  if (issue.kind === "orphan") {
    return t("problems.orphanHandlers", { file: issue.file });
  }
  const names = issue.handlers.map((h) => `handlers.${h}`).join(", ");
  return t("problems.missingHandlers", { n: issue.handlers.length, file: issue.file, names });
}
