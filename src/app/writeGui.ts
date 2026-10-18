import { dirname, join } from "../tauri/pathUtil";
import {
  appendHandlerStubs,
  extractUserRegions,
  generateProject,
  genHandlersFile,
  handlersFileName,
  missingHandlers,
} from "../codegen";
import type { TfuiProject } from "../model/types";
import {
  createUserFileIfAbsent,
  listDirFiles,
  readTextFile,
  removeGeneratedFile,
  writeGeneratedFile,
  writeTextFile,
} from "../tauri/commands";
import type { UserCodeIssue } from "../store/userCodeStore";

export interface GuiWritePlan {
  path: string;
  relativePath: string;
  content: string;
  previous: string | null;
  /** true si le fichier sera supprimé (hors plan, listé dans lastWrittenFiles). */
  willRemove?: boolean;
  /**
   * Fichier de l’utilisateur (`<fileBase>.handlers.lua`) : créé seulement
   * s’il n’existe pas, jamais réécrit.
   */
  userFile?: boolean;
}

export interface GuiWriteResult {
  written: string[];
  manualFiles: string[];
  /** Fichiers générés modifiés à la main depuis leur dernière écriture. */
  handModified: string[];
  removed: string[];
  /** Noms relatifs à persister dans project.lastWrittenFiles. */
  nextLastWrittenFiles: string[];
}

function guiDirAbsolute(projectPath: string, project: TfuiProject): string {
  const projectDir = dirname(projectPath);
  return join(projectDir, project.mod.modRoot, "content", project.mod.guiDir);
}

function isGeneratedGuiName(name: string): boolean {
  return (
    name.endsWith(".script.lua") ||
    name.endsWith(".css.lua") ||
    name.endsWith(".res.lua")
  );
}

/** Fichiers à retirer : présents dans lastWrittenFiles mais absents du plan courant. */
export function plannedRemovals(
  project: TfuiProject,
  planRelativePaths: string[],
): string[] {
  const keep = new Set(planRelativePaths);
  const previous = project.lastWrittenFiles ?? [];
  return previous.filter((name) => isGeneratedGuiName(name) && !keep.has(name));
}

async function readOrNull(path: string): Promise<string | null> {
  try {
    return await readTextFile(path);
  } catch {
    return null;
  }
}

/** Liste des fichiers qui seraient écrits, supprimés ou créés (fichiers handlers). */
export async function planGuiWrite(
  project: TfuiProject,
  projectPath: string,
): Promise<GuiWritePlan[]> {
  const dir = guiDirAbsolute(projectPath, project);
  const plans: GuiWritePlan[] = [];

  for (const file of generateProject(project)) {
    const abs = join(dir, file.path);
    const prev = await readOrNull(abs);
    plans.push({ path: abs, relativePath: file.path, content: file.content, previous: prev });

    // Fichier handlers absent : création unique, avec reprise de l’ancienne
    // région `@tfui:user handlers` du script s’il y en avait une (même sans
    // handler aujourd’hui : son code serait sinon perdu à la réécriture).
    if (file.kind === "script") {
      const handlerNames = file.handlers ?? [];
      const legacy = prev ? extractUserRegions(prev).get("handlers") : undefined;
      const legacyHasCode = !!legacy && legacy.trim() !== "" && legacy.trim() !== "-- vos handlers ici";
      const fileBase = file.path.replace(/\.script\.lua$/, "");
      const name = handlersFileName(fileBase);
      const handlersPath = join(dir, name);
      if ((handlerNames.length > 0 || legacyHasCode) && (await readOrNull(handlersPath)) === null) {
        plans.push({
          path: handlersPath,
          relativePath: name,
          content: genHandlersFile({ fileBase, handlerNames, legacyRegion: legacy }),
          previous: null,
          userFile: true,
        });
      }
    }
  }

  const toRemove = plannedRemovals(
    project,
    plans.filter((p) => !p.userFile).map((p) => p.relativePath),
  );
  for (const name of toRemove) {
    const abs = join(dir, name);
    plans.push({
      path: abs,
      relativePath: name,
      content: "",
      previous: await readOrNull(abs),
      willRemove: true,
    });
  }

  return plans;
}

export async function writeGuiFiles(
  plans: GuiWritePlan[],
  options: { forceManual?: boolean } = {},
): Promise<GuiWriteResult> {
  const written: string[] = [];
  const manualFiles: string[] = [];
  const handModified: string[] = [];
  const force = !!options.forceManual;
  const writePlans = plans.filter((p) => !p.willRemove && !p.userFile);
  const userPlans = plans.filter((p) => p.userFile);
  const removePlans = plans.filter((p) => p.willRemove);

  for (const plan of writePlans) {
    try {
      await writeGeneratedFile(plan.path, plan.content, force);
      written.push(plan.path);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("manual_file:")) {
        manualFiles.push(plan.path);
      } else if (msg.includes("modified_by_hand:")) {
        handModified.push(plan.path);
      } else {
        throw e instanceof Error ? e : new Error(msg);
      }
    }
  }

  // Fichiers de l’utilisateur : création seulement (jamais d’écrasement).
  for (const plan of userPlans) {
    if (await createUserFileIfAbsent(plan.path, plan.content)) written.push(plan.path);
  }

  const removed: string[] = [];
  if (manualFiles.length === 0 && handModified.length === 0) {
    for (const plan of removePlans) {
      try {
        await removeGeneratedFile(plan.path, force);
        removed.push(plan.path);
      } catch (e) {
        // Fichier retouché à la main : jamais supprimé sans accord.
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("modified_by_hand:")) handModified.push(plan.path);
        // Sinon (fichier manuel, verrouillé) : laissé en place.
      }
    }
  }

  return {
    written,
    manualFiles,
    handModified,
    removed,
    nextLastWrittenFiles: writePlans.map((p) => p.relativePath),
  };
}

/**
 * Relève les handlers absents des fichiers de l’utilisateur et les fichiers
 * handlers orphelins (plus aucun écran). Lecture seule.
 */
export async function checkUserHandlers(
  project: TfuiProject,
  projectPath: string,
): Promise<UserCodeIssue[]> {
  const dir = guiDirAbsolute(projectPath, project);
  const issues: UserCodeIssue[] = [];
  const scripts = generateProject(project).filter((f) => f.kind === "script");
  const bases = new Set(scripts.map((f) => f.path.replace(/\.script\.lua$/, "")));

  for (const file of scripts) {
    if (!file.handlers || file.handlers.length === 0) continue;
    const name = handlersFileName(file.path.replace(/\.script\.lua$/, ""));
    const path = join(dir, name);
    const content = await readOrNull(path);
    const missing = content === null ? file.handlers : missingHandlers(content, file.handlers);
    if (missing.length > 0) issues.push({ kind: "missing", path, file: name, handlers: missing });
  }

  let names: string[] = [];
  try {
    names = await listDirFiles(dir);
  } catch {
    // dossier absent
  }
  for (const name of names) {
    if (!name.endsWith(".handlers.lua")) continue;
    if (bases.has(name.replace(/\.handlers\.lua$/, ""))) continue;
    issues.push({ kind: "orphan", path: join(dir, name), file: name, handlers: [] });
  }
  return issues;
}

/**
 * Ajoute des stubs à un fichier de l’utilisateur, juste avant `return handlers`
 * (sur demande explicite ; le reste du fichier est inchangé).
 */
export async function appendStubsToUserFile(path: string, names: string[]): Promise<boolean> {
  const content = await readOrNull(path);
  if (content === null) return false;
  const next = appendHandlerStubs(content, names);
  if (next === null) return false;
  await writeTextFile(path, next);
  return true;
}
