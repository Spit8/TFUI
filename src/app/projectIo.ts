import { open, save } from "@tauri-apps/plugin-dialog";
import { forgetProject, pushRecentProject } from "../settings/settingsStore";
import { readTextFile, writeTextFile } from "../tauri/commands";
import { useProjectStore } from "../store/projectStore";
import {
  refreshRecentCommandLabels,
  setRecentProjectPaths,
} from "./commands/fileCommands";
import { t } from "../i18n";

export async function rememberRecent(path: string): Promise<void> {
  try {
    const next = await pushRecentProject(path);
    setRecentProjectPaths(next);
    refreshRecentCommandLabels();
  } catch {
    // hors Tauri
  }
}

/** Retire un projet introuvable des récents. */
export async function forgetRecent(path: string): Promise<void> {
  try {
    const next = await forgetProject(path);
    setRecentProjectPaths(next);
    refreshRecentCommandLabels();
  } catch {
    // hors Tauri
  }
}

export async function openProjectFile(
  pathOverride?: string,
): Promise<string | null> {
  let selected = pathOverride ?? null;
  if (!selected) {
    const picked = await open({
      multiple: false,
      filters: [{ name: t("file.projectFilter"), extensions: ["tfui.json", "json"] }],
    });
    if (!picked || Array.isArray(picked)) return null;
    selected = picked;
  }
  const content = await readTextFile(selected);
  const result = useProjectStore.getState().loadFromJson(content, selected);
  if (!result.ok) {
    throw new Error(result.error);
  }
  await rememberRecent(selected);
  return selected;
}

export async function saveProjectFile(saveAs = false): Promise<string | null> {
  const { project, projectPath, markSaved } = useProjectStore.getState();
  if (!project) return null;

  let path = projectPath;
  if (saveAs || !path) {
    const picked = await save({
      defaultPath: path ?? t("file.defaultProjectName"),
      filters: [{ name: t("file.projectFilter"), extensions: ["tfui.json"] }],
    });
    if (!picked) return null;
    path = picked.endsWith(".tfui.json") ? picked : `${picked}.tfui.json`;
  }

  const content = `${JSON.stringify(project, null, 2)}\n`;
  await writeTextFile(path, content);
  markSaved(path);
  await rememberRecent(path);
  return path;
}
