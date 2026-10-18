/**
 * Boîte à outils des bancs de test de l’éditeur (`build-bench*.ts`) : un mod
 * bac à sable construit par les actions du store (comme l’interface : palette,
 * inspecteur, styles par élément, écrans), puis écrit sur disque (projet
 * `.tfui.json`, mod.json, modinfo, fichiers GUI, handlers) et contrôlé
 * (validateur, syntaxe Lua, banc Lua sur le runtime React du jeu).
 * Ne jamais viser un vrai mod : les fichiers GUI et le projet sont réécrits.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import process from "node:process";
import { setActiveCatalog } from "../../src/catalog/activeCatalog";
import { setActiveVocabulary } from "../../src/catalog/activeVocabulary";
import { loadMergedCatalogFromDisk } from "../../src/catalog/loadMergedCatalog";
import type { StyleVocabulary } from "../../src/catalog/types";
import { generateProject } from "../../src/codegen/generate";
import { genHandlersFile, handlersFileName, handlersModulePath } from "../../src/codegen/handlersFile";
import { validateGeneratedFiles } from "../../src/codegen/validateLua";
import type { StyleState } from "../../src/model/elementStyle";
import { createModScaffoldProject } from "../../src/model/modProject";
import { getNodeById } from "../../src/model/treeOps";
import type { PropValue, UiNode } from "../../src/model/types";
import { validateProject } from "../../src/model/validate";
import { useProjectStore } from "../../src/store/projectStore";
import { readGameRuntimeFromFixtures } from "../../src/verify/fixtureRuntime";
import { runGeneratedGui } from "../../src/verify/luaHarness";

export const lit = (value: string | number | boolean | number[]): PropValue => ({ kind: "literal", value });
export const en = (value: string): PropValue => ({ kind: "enum", value });
export const lua = (code: string): PropValue => ({ kind: "lua", code });
export const palette = (name: string, alpha?: number) => ({
  kind: "palette" as const,
  name,
  ...(alpha === undefined ? {} : { alpha }),
});

export interface BenchWindow {
  screenId: string;
  /** Racine Window. */
  win: string;
  /** BoxLayout de contenu (texte d’accueil supprimé). */
  root: string;
  recipeName: string;
  /** Identifiant `WindowParam.id` (singleton, `api.gui.byId`). */
  windowId: string;
}

/** Démarre un banc : lit l’argument (dossier du mod), charge catalogue, vocabulaire et palette. */
export function startBench(opts: {
  script: string;
  displayName: string;
  title: string;
  size: [number, number];
  /** modinfo.json (défaut : banc de test). */
  description?: string;
  summary?: string;
}) {
  const target = process.argv[2];
  if (!target) {
    console.error(`Usage : npx tsx tools/dev/${opts.script} <dossier du mod bac à sable>`);
    process.exit(1);
  }
  const modDir = resolve(target);
  const modId = basename(modDir).toLowerCase().replace(/[^a-z0-9_]+/g, "_");

  const catalog = loadMergedCatalogFromDisk();
  if (!catalog) {
    console.error("Catalogue absent : pnpm extract-catalog");
    process.exit(1);
  }
  setActiveCatalog(catalog);
  // Palette du jeu : cache de l’éditeur (styles de base extraits à l’import), s’il existe.
  const appCache = join(process.env.APPDATA ?? "", "com.tf3.uidesigner", "catalog-cache.json");
  const paletteNames: string[] = existsSync(appCache)
    ? (
        (JSON.parse(readFileSync(appCache, "utf8")) as { baseStyles?: { palette?: { colors: { name: string }[] } } })
          .baseStyles?.palette?.colors ?? []
      ).map((c) => c.name)
    : [];
  const vocabPath = resolve("src/catalog/style-vocabulary.generated.json");
  const vocabulary = existsSync(vocabPath) ? (JSON.parse(readFileSync(vocabPath, "utf8")) as StyleVocabulary) : null;
  if (vocabulary) setActiveVocabulary(vocabulary);

  const store = useProjectStore;
  const failures: string[] = [];
  store.setState({
    project: createModScaffoldProject({ modId, displayName: opts.displayName, catalogHash: catalog.sourceHash }),
  });

  function nodeOf(id: string): UiNode {
    for (const screen of store.getState().project!.screens) {
      const node = getNodeById(screen.root, id);
      if (node) return node;
    }
    throw new Error(`nœud introuvable : ${id}`);
  }

  /** Insertion depuis la palette ; renvoie l’id du nœud créé (sélectionné par le store). */
  function ins(parentId: string, type: string, o: { slot?: string; preset?: string; name?: string } = {}): string {
    if (!parentId) return "";
    const ok = store.getState().insertChild(parentId, type, o.slot, undefined, undefined, o.preset);
    if (!ok) {
      const reason = store.getState().lastDropError ?? "?";
      failures.push(`insertion refusée : ${type} dans ${nodeOf(parentId).type}${o.slot ? `.${o.slot}` : ""} — ${reason}`);
      return "";
    }
    const id = store.getState().selectedNodeId!;
    if (o.name) store.getState().renameNode(id, o.name);
    return id;
  }
  function props(id: string, values: Record<string, PropValue>): void {
    if (!id) return;
    for (const [k, v] of Object.entries(values)) store.getState().setProp(id, k, v);
  }
  function meta(id: string, values: Parameters<ReturnType<typeof store.getState>["setMeta"]>[1]): void {
    if (id) store.getState().setMeta(id, values);
  }
  function cls(id: string, ...classes: string[]): void {
    meta(id, { class: classes });
  }
  /** Ajoute des classes sans retirer celles déjà posées (ex. classe propre d’une fenêtre). */
  function addClass(id: string, ...classes: string[]): void {
    if (!id) return;
    const current = nodeOf(id).meta.class ?? [];
    meta(id, { class: [...current, ...classes.filter((c) => !current.includes(c))] });
  }
  function style(id: string, values: Record<string, unknown>, state: StyleState | null = null): void {
    if (!id) return;
    for (const [k, v] of Object.entries(values)) store.getState().setNodeStyle(id, state, k, v);
  }
  function text(parentId: string, value: string, o: { slot?: string; name?: string } = {}): string {
    const id = ins(parentId, "TextView", o);
    props(id, { text: lit(value) });
    return id;
  }
  function box(parentId: string, orientation: "Horizontal" | "Vertical", o: { slot?: string; name?: string } = {}): string {
    const id = ins(parentId, "BoxLayout", o);
    props(id, { orientation: en(`Orientation.${orientation}`) });
    return id;
  }
  /** Bouton de la palette (libellé « Bouton » créé avec lui) : renomme le libellé. */
  function button(parentId: string, label: string, o: { slot?: string; name?: string } = {}): string {
    const id = ins(parentId, "Button", o);
    const labelNode = id ? nodeOf(id).slots.content?.[0] : undefined;
    if (labelNode) props(labelNode.id, { text: lit(label) });
    return id;
  }

  /** Fenêtre d’un écran : titre, taille étendue, contenu vidé. */
  function setupWindow(screenId: string, title: string, size: [number, number] | null): BenchWindow {
    const screen = store.getState().project!.screens.find((s) => s.id === screenId)!;
    const win = screen.root.id;
    props(win, { title: lit(title) });
    const windowClass = nodeOf(win).meta.class?.find((c) => c.endsWith("-window"));
    const sizeRule = store
      .getState()
      .project!.styleRules.find((r) => !!windowClass && r.selector.includes(windowClass) && r.selector.includes("!window-expanded"));
    if (sizeRule) {
      if (size) store.getState().updateStyleRule(sizeRule.id, { props: { ...sizeRule.props, size } });
      else store.getState().removeStyleRule(sizeRule.id);
    }
    let root = nodeOf(win).slots.content?.[0]?.id ?? "";
    if (!root) root = box(win, "Vertical", { slot: "content" });
    for (const c of [...(nodeOf(root).slots.children ?? [])]) store.getState().deleteNode(c.id);
    return { screenId, win, root, recipeName: screen.recipeName, windowId: nodeOf(win).meta.id ?? "" };
  }

  const mainScreen = store.getState().project!.screens.find((s) => s.kind === "window")!;
  const main = setupWindow(mainScreen.id, opts.title, opts.size);

  /** Nouvel écran fenêtre, dans le même `.script` que la principale (ouverture par `recipes.X`). */
  function addWindow(recipeName: string, title: string, size: [number, number] | null): BenchWindow {
    store.getState().addScreen("window");
    const screenId = store.getState().selectedScreenId!;
    store.getState().updateScreenMeta(screenId, { recipeName, fileBase: mainScreen.fileBase });
    return setupWindow(screenId, title, size);
  }

  /** `onClick` qui ouvre une fenêtre du banc (motif du projet de base). */
  function openWindowLua(w: BenchWindow): PropValue {
    return lua(`function()
					local wapi = game_react_globals.getDefaultWindowApi()
					if wapi == nil then
						return
					end
					wapi.addSingletonWindow(recipes.${w.recipeName}, {})
					pcall(function()
						api.gui.byId.setVisible("${w.windowId}", true)
					end)
					wapi.moveSingletonWindowToFront(recipes.${w.recipeName})
				end`);
  }

  /** Écrit le mod et lance les contrôles. */
  async function finish(): Promise<void> {
    const project = store.getState().project!;
    const contentDir = join(modDir, "mod", "content", project.mod.guiDir);
    mkdirSync(contentDir, { recursive: true });
    mkdirSync(join(modDir, "mod", "_metadata"), { recursive: true });
    const projectPath = join(modDir, `${modId}.tfui.json`);
    writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`);
    const modJsonPath = join(modDir, "mod", "mod.json");
    if (!existsSync(modJsonPath)) {
      const modJson = {
        cosmetic: false,
        dependencies: null,
        incompatibilities: null,
        modId,
        postRunScript: { fileName: "" },
        preRunScript: { fileName: "" },
        revision: 1,
        runScript: { fileName: "" },
        severityAdd: "None",
        severityRemove: "None",
        visible: true,
      };
      writeFileSync(modJsonPath, `${JSON.stringify(modJson, null, 2)}\n`);
    }
    const modInfoPath = join(modDir, "mod", "_metadata", "modinfo.json");
    if (!existsSync(modInfoPath)) {
      const modInfo = {
        authors: [{ name: "Author", role: "CREATOR" }],
        description: opts.description ?? "Banc de test TFUI (bac à sable).",
        name: opts.displayName,
        summary: opts.summary ?? "Banc de test TFUI",
        tags: ["Script Mod"],
        url: "",
      };
      writeFileSync(modInfoPath, `${JSON.stringify(modInfo, null, 2)}\n`);
    }
    writeFileSync(join(modDir, ".gitignore"), "build/\n*.tfui.autosave.json\n");

    const files = generateProject(project);
    const modFiles: Record<string, string> = {};
    for (const file of files) {
      writeFileSync(join(contentDir, file.path), file.content);
      if (file.kind === "script" && file.handlers?.length) {
        const fileBase = file.path.replace(/\.script\.lua$/, "");
        const handlersPath = join(contentDir, handlersFileName(fileBase));
        const content = existsSync(handlersPath)
          ? readFileSync(handlersPath, "utf8")
          : genHandlersFile({ fileBase, handlerNames: file.handlers });
        if (!existsSync(handlersPath)) writeFileSync(handlersPath, content);
        modFiles[handlersModulePath(modId, project.mod.guiDir, fileBase)] = content;
      }
    }

    console.log(`Projet : ${projectPath}`);
    console.log(`Fichiers GUI : ${files.map((f) => f.path).join(", ")}`);
    console.log(`\nInsertions refusées : ${failures.length}`);
    for (const f of failures) console.log(`  - ${f}`);
    const issues = validateProject(project, catalog, vocabulary, paletteNames.length ? new Set(paletteNames) : undefined);
    console.log(`\nProblèmes (validateur) : ${issues.length}`);
    for (const i of issues) console.log(`  [${i.severity}] ${i.code} — ${i.message}`);
    const syntax = validateGeneratedFiles(files);
    console.log(`\nSyntaxe Lua : ${syntax.length ? syntax.map((e) => `${e.path}:${e.line ?? "?"} ${e.message}`).join("\n  ") : "OK"}`);
    console.log(`\nPalette : ${paletteNames.length ? `${paletteNames.length} couleurs (cache de l’éditeur)` : "inconnue (noms non vérifiés)"}`);
    const gameFiles = await readGameRuntimeFromFixtures();
    const report = await runGeneratedGui({ files, catalog, gameFiles, modFiles, paletteNames });
    console.log(`\nBanc Lua : ${report.rendered} nœuds rendus, ${report.issues.length} remarques`);
    for (const i of report.issues) console.log(`  [${i.severity}] ${i.message}`);
  }

  return { store, nodeOf, ins, props, meta, cls, addClass, style, text, box, button, main, addWindow, openWindowLua, finish };
}
