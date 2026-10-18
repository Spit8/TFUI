import { createScreen } from "./factory";
import { cloneNodeTree } from "./treeOps";
import type { Screen, ScreenPlugin, TfuiProject } from "./types";
import { createId } from "./uuid";
import { applyNewWindowDefaults } from "./windowDefaults";
import { t } from "../i18n";

export type ScreenOpResult =
  | { ok: true; project: TfuiProject; screenId: string }
  | { ok: false; reason: string };

export function addScreen(
  project: TfuiProject,
  kind: Screen["kind"],
  opts?: { recipeName?: string; fileBase?: string },
): ScreenOpResult {
  const base =
    opts?.recipeName ??
    (kind === "plugin"
      ? "NewPlugin"
      : kind === "recipe"
        ? "NewRecipe"
        : "NewWindow");
  const fileBase =
    opts?.fileBase ??
    base
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_");
  const screen = createScreen({ kind, recipeName: base, fileBase });
  // Nouvelle fenêtre : croix qui ferme en jeu, classe, taille, marge du contenu.
  const rules =
    kind === "window"
      ? applyNewWindowDefaults(screen.root, { modId: project.mod.modId, name: base, project })
      : [];
  if (kind === "plugin") {
    screen.plugin = {
      extensionPoint: "MainModButtonAreaExtension",
      pluginName: base,
      order: 100,
      buttonLabel: base,
    };
  }
  return {
    ok: true,
    project: {
      ...project,
      screens: [...project.screens, screen],
      styleRules: [...project.styleRules, ...rules],
    },
    screenId: screen.id,
  };
}

export function duplicateScreen(
  project: TfuiProject,
  screenId: string,
): ScreenOpResult {
  const src = project.screens.find((s) => s.id === screenId);
  if (!src) return { ok: false, reason: t("ops.screenNotFound") };
  const copy: Screen = {
    ...structuredClone(src),
    id: createId(),
    recipeName: `${src.recipeName}_copy`,
    fileBase: `${src.fileBase}_copy`,
    root: cloneNodeTree(src.root, false),
  };
  return {
    ok: true,
    project: { ...project, screens: [...project.screens, copy] },
    screenId: copy.id,
  };
}

export function removeScreen(
  project: TfuiProject,
  screenId: string,
): ScreenOpResult {
  if (project.screens.length <= 1) {
    return { ok: false, reason: t("ops.cannotDeleteLastScreen") };
  }
  if (!project.screens.some((s) => s.id === screenId)) {
    return { ok: false, reason: t("ops.screenNotFound") };
  }
  const screens = project.screens.filter((s) => s.id !== screenId);
  return {
    ok: true,
    project: { ...project, screens },
    screenId: screens[0]!.id,
  };
}

export function updateScreenMeta(
  project: TfuiProject,
  screenId: string,
  patch: Partial<{
    recipeName: string;
    fileBase: string;
    kind: Screen["kind"];
    plugin: Partial<ScreenPlugin> | null;
    previewViewport: { w: number; h: number };
  }>,
): ScreenOpResult {
  const idx = project.screens.findIndex((s) => s.id === screenId);
  if (idx < 0) return { ok: false, reason: t("ops.screenNotFound") };
  const prev = project.screens[idx]!;
  const next: Screen = { ...prev };
  if (patch.recipeName !== undefined) next.recipeName = patch.recipeName;
  if (patch.fileBase !== undefined) next.fileBase = patch.fileBase;
  if (patch.kind !== undefined) next.kind = patch.kind;
  if (patch.previewViewport !== undefined) {
    next.previewViewport = {
      w: patch.previewViewport.w,
      h: patch.previewViewport.h,
    };
  }
  if (patch.plugin === null) {
    next.plugin = undefined;
  } else if (patch.plugin) {
    next.plugin = {
      extensionPoint: "MainModButtonAreaExtension",
      pluginName: prev.plugin?.pluginName ?? next.recipeName,
      order: prev.plugin?.order ?? 100,
      buttonLabel: prev.plugin?.buttonLabel ?? next.recipeName,
      ...prev.plugin,
      ...patch.plugin,
    };
  }
  if (patch.kind === "plugin" && !next.plugin) {
    next.plugin = {
      extensionPoint: "MainModButtonAreaExtension",
      pluginName: next.recipeName,
      order: 100,
      buttonLabel: next.recipeName,
    };
  }
  if (patch.kind && patch.kind !== "plugin") {
    next.plugin = undefined;
  }
  const screens = project.screens.slice();
  screens[idx] = next;
  return { ok: true, project: { ...project, screens }, screenId };
}
