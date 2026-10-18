import glueWasmUrl from "wasmoon/dist/glue.wasm?url";
import { getActiveBaseStyles } from "../gamestyle/activeBaseStyles";
import { getActiveCatalog } from "../catalog/activeCatalog";
import { generateProject } from "../codegen/generate";
import { genHandlersFile, handlersModulePath } from "../codegen/handlersFile";
import type { TfuiProject } from "../model/types";
import { loadSettings } from "../settings/settingsStore";
import { useRuntimeIssuesStore } from "../store/runtimeIssuesStore";
import { readZipEntry } from "../tauri/commands";
import { GAME_RUNTIME_FILES, runGeneratedGui } from "./luaHarness";
import { t } from "../i18n";

/** Archive du jeu contenant le runtime React (relative à la racine TF3). */
const GUI_ZIP = "base/content/gui.zip";

let cached: { root: string; files: Record<string, string> } | null = null;

async function gameRuntime(tf3Root: string): Promise<Record<string, string>> {
  if (cached?.root === tf3Root) return cached.files;
  const files: Record<string, string> = {};
  for (const path of GAME_RUNTIME_FILES) {
    files[path] = await readZipEntry(tf3Root, GUI_ZIP, path);
  }
  cached = { root: tf3Root, files };
  return files;
}

export interface RuntimeCheckResult {
  /** false : la vérification n’a pas pu tourner (jeu non lié…). */
  ran: boolean;
  errorCount: number;
  reason?: string;
}

/**
 * Exécute le code GUI du projet avec le runtime React du jeu (sans lancer le
 * jeu) et publie les problèmes dans le panneau Problèmes.
 */
export async function checkProjectRuntime(
  project: TfuiProject,
): Promise<RuntimeCheckResult> {
  const catalog = getActiveCatalog();
  if (!catalog) return { ran: false, errorCount: 0, reason: "catalogue absent" };
  let gameFiles: Record<string, string>;
  try {
    gameFiles = await gameRuntime((await loadSettings()).tf3Root);
  } catch (error) {
    return {
      ran: false,
      errorCount: 0,
      reason: t("runtime.runtimeUnreadable", { message: error instanceof Error ? error.message : String(error) }),
    };
  }
  const files = generateProject(project);
  // Les handlers de l’utilisateur sont simulés par des stubs : le banc vérifie
  // le code de l’éditeur (chargement du module compris), pas celui du mod.
  const modFiles: Record<string, string> = {};
  for (const f of files) {
    if (f.kind !== "script" || !f.handlers?.length) continue;
    const fileBase = f.path.replace(/\.script\.lua$/, "");
    modFiles[handlersModulePath(project.mod.modId, project.mod.guiDir, fileBase)] = genHandlersFile({
      fileBase,
      handlerNames: f.handlers,
    });
  }
  const report = await runGeneratedGui({
    files,
    catalog,
    gameFiles,
    modFiles,
    wasmUrl: glueWasmUrl,
    paletteNames: getActiveBaseStyles()?.palette?.colors.map((c) => c.name),
  });
  const issues = report.issues
    .filter((i) => i.severity !== "info")
    .map((i) => ({ source: "execution" as const, ...i }));
  useRuntimeIssuesStore.getState().setExecution(issues);
  return {
    ran: true,
    errorCount: issues.filter((i) => i.severity === "error").length,
  };
}
