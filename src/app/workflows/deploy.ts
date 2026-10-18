import { isTf3Running } from "../../tauri/commands";
import type { TfuiProject } from "../../model/types";
import { checkProjectRuntime } from "../../verify/runtimeCheck";
import {
  recordSuccessfulBuild,
  recordSuccessfulInstall,
  setDeployError,
  setDeployRunning,
} from "../../store/deployStatusStore";
import { useProjectStore } from "../../store/projectStore";
import { pushToast } from "../../store/toastStore";
import {
  commitWriteGui,
  prepareWriteGui,
  runBuild,
  runExport,
  runInstall,
} from "../modDeploy";
import {
  hasSeenGuiWriteDiff,
  markGuiWriteDiffSeen,
} from "../guiWriteSession";
import { saveProjectFile } from "../projectIo";
import { useUserCodeStore } from "../../store/userCodeStore";
import { appendStubsToUserFile, checkUserHandlers, type GuiWritePlan } from "../writeGui";
import { t } from "../../i18n";
import { backendMessage, errorMessage } from "../../i18n/backend";

/** Action à reprendre après confirmation du diff GUI. */
export type DeployNext = "writeGui" | "build" | "install" | "export";

export interface DeployUi {
  setBanner: (message: string | null) => void;
  setError: (message: string | null) => void;
  /** Affiche le dialogue de diff ; l’appelant reprendra via `resumeDeploy`. */
  requestDiff: (plans: GuiWritePlan[], next: DeployNext) => void;
  getErrorCount: () => number;
  /** Ouvre le panneau Problèmes. */
  focusProblems?: () => void;
}

export async function ensureProjectSaved(): Promise<string | null> {
  const { project, projectPath, dirty } = useProjectStore.getState();
  if (!project) return null;
  if (!projectPath) {
    return saveProjectFile(true);
  }
  if (dirty) {
    await saveProjectFile(false);
  }
  return useProjectStore.getState().projectPath;
}

async function writeGuiCore(plans: GuiWritePlan[]): Promise<boolean> {
  const written = await commitWriteGui(plans, false);
  if (!written.ok) {
    const parts: string[] = [];
    if (written.manual.length > 0) {
      parts.push(t("deploy.manualFiles", { files: written.manual.join("\n") }));
    }
    if (written.handModified.length > 0) {
      parts.push(t("deploy.handModified", { files: written.handModified.join("\n") }));
    }
    // Ces fichiers-là n’ont pas été touchés tant que l’utilisateur n’accepte pas.
    const force = window.confirm(t("deploy.overwriteConfirm", { parts: parts.join("\n\n") }));
    if (!force) return false;
    await commitWriteGui(plans, true);
  }
  if (useProjectStore.getState().dirty) {
    await saveProjectFile(false);
  }
  markGuiWriteDiffSeen();
  await reviewUserHandlers();
  return true;
}

/**
 * Handlers absents des fichiers de l’utilisateur : ajout des stubs proposé
 * (jamais imposé), puis état publié dans Problèmes.
 */
async function reviewUserHandlers(): Promise<void> {
  const { project, projectPath } = useProjectStore.getState();
  if (!project || !projectPath) return;
  let issues = await checkUserHandlers(project, projectPath);
  const missing = issues.filter((i) => i.kind === "missing");
  if (missing.length > 0) {
    const list = missing.map((i) => `${i.file} : ${i.handlers.join(", ")}`).join("\n");
    const add = window.confirm(t("deploy.missingHandlersConfirm", { list }));
    if (add) {
      for (const i of missing) {
        if (!(await appendStubsToUserFile(i.path, i.handlers))) {
          pushToast(t("deploy.noReturnHandlers", { file: i.file }), "error");
        }
      }
      issues = await checkUserHandlers(project, projectPath);
    }
  }
  useUserCodeStore.getState().setIssues(issues);
}

async function doBuild(
  project: TfuiProject,
  projectPath: string,
  ui: DeployUi,
  thenInstall: boolean,
): Promise<string | null> {
  if (ui.getErrorCount() > 0) {
    ui.setError(t("deploy.fixErrorsBeforeBuild"));
    setDeployError(t("deploy.fixErrorsBeforeBuild"));
    return null;
  }
  setDeployRunning(thenInstall ? "install" : "build");
  try {
    // Exécute le code généré avec le runtime React du jeu : une erreur ici
    // est une erreur (ou un crash) garanti en jeu.
    const check = await checkProjectRuntime(project);
    if (check.ran && check.errorCount > 0) {
      const msg = t("deploy.runtimeFails", { n: check.errorCount });
      setDeployError(msg);
      ui.setError(msg);
      pushToast(msg, "error");
      ui.focusProblems?.();
      return null;
    }
    if (!check.ran) {
      pushToast(t("deploy.runtimeSkipped", { reason: check.reason ?? "" }), "info");
    }
    const result = await runBuild(project, projectPath);
    await recordSuccessfulBuild();
    pushToast(result.message, "success");
    ui.setBanner(null);
    if (thenInstall) {
      await doInstall(project, result.buildDir, ui, false);
    }
    return result.buildDir;
  } catch (e) {
    const msg = errorMessage(e);
    setDeployError(msg);
    ui.setError(msg);
    pushToast(msg, "error");
    return null;
  }
}

async function doInstall(
  project: TfuiProject,
  buildDir: string,
  ui: DeployUi,
  force: boolean,
): Promise<void> {
  // TF3 lancé : avertir avant d’installer (le jeu garde les fichiers chargés).
  if (!force && (await isTf3Running().catch(() => false))) {
    const go = window.confirm(t("deploy.tf3Running"));
    if (!go) return;
  }
  setDeployRunning("install");
  try {
    const result = await runInstall(project, buildDir, force);
    if ("modifiedInStaging" in result) {
      setDeployRunning(null);
      const list = result.modifiedInStaging.slice(0, 15).join("\n");
      const more =
        result.modifiedInStaging.length > 15 ? t("deploy.andMore", { n: result.modifiedInStaging.length - 15 }) : "";
      const ok = window.confirm(t("deploy.modifiedInStaging", { list, more }));
      if (ok) await doInstall(project, buildDir, ui, true);
      return;
    }
    if ("needsConfirm" in result) {
      setDeployRunning(null);
      const ok = window.confirm(t("deploy.stagingExists", { path: backendMessage(result.needsConfirm) }));
      if (ok) await doInstall(project, buildDir, ui, true);
      return;
    }
    await recordSuccessfulInstall();
    pushToast(result.message, "success");
    ui.setBanner(null);
  } catch (e) {
    const msg = errorMessage(e);
    setDeployError(msg);
    ui.setError(msg);
    pushToast(msg, "error");
  }
}

/**
 * Machine write → build → install/export.
 * Si le diff n’a pas encore été vu, appelle `ui.requestDiff` et s’arrête ;
 * après confirm, appeler `resumeDeploy(next, ui, plans)`.
 */
export async function startDeploy(
  next: DeployNext,
  ui: DeployUi,
  plansOverride?: GuiWritePlan[],
): Promise<void> {
  const project = useProjectStore.getState().project;
  if (!project) return;
  const path = await ensureProjectSaved();
  if (!path) return;
  const current = useProjectStore.getState().project;
  if (!current) return;

  const plans = plansOverride ?? (await prepareWriteGui(current, path));
  if (!hasSeenGuiWriteDiff()) {
    ui.requestDiff(plans, next);
    return;
  }

  await resumeDeploy(next, ui, plans);
}

/** Reprend l’action pending après confirmation du diff (ou si déjà vu). */
export async function resumeDeploy(
  next: DeployNext,
  ui: DeployUi,
  plans: GuiWritePlan[],
): Promise<void> {
  const path = useProjectStore.getState().projectPath;
  let project = useProjectStore.getState().project;
  if (!project || !path) return;

  markGuiWriteDiffSeen();
  const written = await writeGuiCore(plans);
  if (!written) return;

  project = useProjectStore.getState().project;
  if (!project) return;

  if (next === "writeGui") {
    pushToast(t("deploy.guiWritten"), "success");
    ui.setBanner(null);
    return;
  }

  if (next === "build") {
    await doBuild(project, path, ui, false);
    return;
  }

  if (next === "install") {
    await doBuild(project, path, ui, true);
    return;
  }

  // export : write + build + zip
  if (ui.getErrorCount() > 0) {
    ui.setError(t("deploy.fixErrorsBeforeExport"));
    return;
  }
  const buildDir = await doBuild(project, path, ui, false);
  if (!buildDir) return;
  const zip = await runExport(buildDir);
  if (zip) pushToast(t("deploy.exportZip", { path: zip }), "success");
}
