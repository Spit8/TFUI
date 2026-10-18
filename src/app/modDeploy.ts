import { open, save } from "@tauri-apps/plugin-dialog";
import { appDataDir } from "@tauri-apps/api/path";
import type { TfuiProject } from "../model/types";
import { loadSettings } from "../settings/settingsStore";
import {
  buildMod,
  exportModZip,
  installMod,
} from "../tauri/commands";
import { useProjectStore } from "../store/projectStore";
import { dirname } from "../tauri/pathUtil";
import { planGuiWrite, writeGuiFiles, type GuiWritePlan } from "./writeGui";
import { t } from "../i18n";

export async function prepareWriteGui(
  project: TfuiProject,
  projectPath: string,
): Promise<GuiWritePlan[]> {
  return planGuiWrite(project, projectPath);
}

export async function commitWriteGui(
  plans: GuiWritePlan[],
  forceManual = false,
): Promise<{ ok: true } | { ok: false; manual: string[]; handModified: string[] }> {
  const result = await writeGuiFiles(plans, { forceManual });
  if ((result.manualFiles.length > 0 || result.handModified.length > 0) && !forceManual) {
    return { ok: false, manual: result.manualFiles, handModified: result.handModified };
  }
  useProjectStore
    .getState()
    .setLastWrittenFiles(result.nextLastWrittenFiles);
  return { ok: true };
}

export async function runBuild(
  project: TfuiProject,
  projectPath: string,
): Promise<{ buildDir: string; message: string }> {
  const projectDir = dirname(projectPath);
  const result = await buildMod(
    projectDir,
    project.mod.modRoot,
    project.mod.modId,
  );
  return {
    buildDir: result.buildDir,
    message: t("deploy.buildOk", { n: result.fileCount, path: result.buildDir }),
  };
}

export async function runInstall(
  project: TfuiProject,
  buildDir: string,
  force: boolean,
): Promise<{ message: string } | { needsConfirm: string } | { modifiedInStaging: string[] }> {
  const settings = await loadSettings();
  if (!settings.stagingArea.trim()) throw new Error(t("deploy.noStagingArea"));
  const dataDir = await appDataDir();
  try {
    const result = await installMod(
      buildDir,
      settings.stagingArea,
      project.mod.modId,
      settings.tf3Root,
      dataDir,
      force,
    );
    let message = t("deploy.installed", { path: result.targetDir });
    if (result.preservedModIoFileid) {
      message += t("deploy.fileIdPreserved");
    }
    return { message };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("needs_confirm:") || msg.includes("needs_confirm:")) {
      return { needsConfirm: msg.replace(/^needs_confirm:/, "") };
    }
    // Fichiers du staging modifiés à la main : jamais écrasés sans accord.
    if (msg.includes("modified_in_staging:")) {
      return { modifiedInStaging: msg.replace(/^.*?modified_in_staging:/s, "").split("\n").filter(Boolean) };
    }
    throw e instanceof Error ? e : new Error(msg);
  }
}

export async function runExport(buildDir: string): Promise<string | null> {
  const picked = await save({
    defaultPath: "mod.zip",
    filters: [{ name: "ZIP", extensions: ["zip"] }],
  });
  if (!picked) return null;
  await exportModZip(buildDir, picked);
  return picked;
}

export async function pickModFolder(): Promise<string | null> {
  const sel = await open({ directory: true, multiple: false });
  return typeof sel === "string" ? sel : null;
}
