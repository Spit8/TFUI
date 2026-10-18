import type { TfuiProject } from "../model/types";
import { loadSettings } from "../settings/settingsStore";
import { useRuntimeIssuesStore } from "../store/runtimeIssuesStore";
import { isTf3Running, launchGame, readGameLog } from "../tauri/commands";
import { gameLogIssues, parseGameLog } from "./gameLog";
import { currentLanguage, t } from "../i18n";

let lastLogMs = 0;

/** Lance le jeu ; refuse s’il tourne déjà (le mod installé ne serait pas rechargé). */
export async function launchGameForProject(): Promise<string> {
  if (await isTf3Running()) {
    throw new Error(t("runtime.alreadyRunning"));
  }
  const settings = await loadSettings();
  await launchGame(settings.tf3Root);
  return t("runtime.launching");
}

/**
 * Relit le journal du jeu et publie dans Problèmes les erreurs qui concernent
 * le mod. `onlyIfChanged` : ne fait rien si le journal n’a pas bougé.
 */
export async function refreshGameLog(
  project: TfuiProject,
  onlyIfChanged = false,
): Promise<number> {
  const settings = await loadSettings();
  const log = await readGameLog(settings.stagingArea);
  if (onlyIfChanged && log.modifiedMs === lastLogMs) return -1;
  lastLogMs = log.modifiedMs;
  const issues = gameLogIssues(parseGameLog(log.content), {
    modId: project.mod.modId,
    recipeNames: project.screens.map((s) => s.recipeName),
  });
  const when = new Date(log.modifiedMs).toLocaleString(currentLanguage());
  useRuntimeIssuesStore.getState().setGame([
    {
      source: "game",
      severity: "info",
      message:
        issues.length === 0
          ? t("runtime.logClean", { when })
          : t("runtime.logIssues", { when, n: issues.length }),
    },
    ...issues.map((i) => ({ source: "game" as const, ...i })),
  ]);
  return issues.filter((i) => i.severity === "error").length;
}
