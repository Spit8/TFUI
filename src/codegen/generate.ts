import { needsDefaultOnClose } from "../model/metaRules";
import type { Screen, TfuiProject, UiNode } from "../model/types";
import { genCss } from "./genCss";
import { genRes } from "./genRes";
import { genScript } from "./genScript";
import { rewriteWindowOpenLua } from "./propEmit";
import type { GeneratedFile, GenerationNotice } from "./types";

function walkProps(node: UiNode, visit: (code: string) => void): void {
  for (const value of Object.values(node.props)) {
    if (value?.kind === "lua") visit(value.code);
  }
  for (const children of Object.values(node.slots)) {
    for (const child of children) walkProps(child, visit);
  }
}

export interface EffectiveFileBaseResult {
  fileBase: string;
  /** Present when a plugin was co-located with a window script. */
  colocated?: {
    pluginRecipe: string;
    windowRecipe: string;
    fileBase: string;
  };
}

/** Plugin that opens a project window must share that window's script file. */
export function describeEffectiveFileBase(
  screen: Screen,
  project: TfuiProject,
): EffectiveFileBaseResult {
  if (screen.kind !== "plugin") return { fileBase: screen.fileBase };
  const windows = project.screens.filter((s) => s.kind === "window");
  if (windows.length === 0) return { fileBase: screen.fileBase };

  let luaBlob = "";
  walkProps(screen.root, (code) => {
    luaBlob += `\n${code}`;
  });
  const opensCrossScript =
    /util\.useFn\s*\(/.test(luaBlob) ||
    /ug_require\s+"[^"]*\.script"/.test(luaBlob) ||
    /addSingletonWindow\s*\(/.test(luaBlob) ||
    /addWindow\s*\(/.test(luaBlob);

  if (!opensCrossScript) return { fileBase: screen.fileBase };

  const named = windows.find((w) => luaBlob.includes(w.recipeName));
  const win = named ?? windows[0]!;
  const fileBase = win.fileBase;
  return {
    fileBase,
    colocated: {
      pluginRecipe: screen.recipeName,
      windowRecipe: win.recipeName,
      fileBase,
    },
  };
}

function effectiveFileBase(screen: Screen, project: TfuiProject): string {
  return describeEffectiveFileBase(screen, project).fileBase;
}

function withEffectiveFileBase(project: TfuiProject): Screen[] {
  return project.screens.map((s) => {
    const fileBase = effectiveFileBase(s, project);
    return fileBase === s.fileBase ? s : { ...s, fileBase };
  });
}

function collectPropNotices(
  node: UiNode,
  screenId: string,
  into: GenerationNotice[],
): void {
  for (const [propKey, value] of Object.entries(node.props)) {
    if (value?.kind !== "lua") continue;
    const { applied } = rewriteWindowOpenLua(value.code);
    for (const hit of applied) {
      into.push({
        id: `rewrite:${hit.id}`,
        message: `Lua de \`${propKey}\` réécrit : ${hit.label} (piège §1.4)`,
        screenId,
        nodeId: node.id,
        propKey,
      });
    }
  }
  for (const children of Object.values(node.slots)) {
    for (const child of children) collectPropNotices(child, screenId, into);
  }
}

/** Notices R19 : réécritures Lua + co-localisation plugin/fenêtre. */
export function collectGenerationNotices(
  project: TfuiProject,
): GenerationNotice[] {
  const notices: GenerationNotice[] = [];
  for (const screen of project.screens) {
    collectPropNotices(screen.root, screen.id, notices);
    if (needsDefaultOnClose(screen.root)) {
      notices.push({
        id: "window:default_onclose",
        message: `onClose ajouté à la fenêtre ${screen.recipeName} : le bouton fermer la masque (api.gui.byId.setVisible(id, false)).`,
        screenId: screen.id,
        nodeId: screen.root.id,
        propKey: "onClose",
      });
    }
    const eff = describeEffectiveFileBase(screen, project);
    if (eff.colocated) {
      notices.push({
        id: "coloc:plugin_window",
        message: `Plugin ${eff.colocated.pluginRecipe} émis dans \`${eff.colocated.fileBase}.script.lua\` avec la fenêtre ${eff.colocated.windowRecipe}`,
        screenId: screen.id,
        nodeId: screen.root.id,
      });
    }
  }
  return notices;
}

export function generateProject(project: TfuiProject): GeneratedFile[] {
  const screens = withEffectiveFileBase(project);
  const byBase = new Map<string, Screen[]>();
  for (const screen of screens) {
    const list = byBase.get(screen.fileBase) ?? [];
    list.push(screen);
    byBase.set(screen.fileBase, list);
  }

  const files: GeneratedFile[] = [];
  for (const group of byBase.values()) {
    files.push(genScript(project, group));
    files.push(genCss(project, group));
    for (const screen of group) {
      const res = genRes(project, screen);
      if (res) files.push(res);
    }
  }

  return files;
}
