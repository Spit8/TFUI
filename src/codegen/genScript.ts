import { getActiveCatalog } from "../catalog/activeCatalog";
import { COMPONENT_OVERRIDES } from "../catalog/overrides";
import type { Catalog } from "../catalog/types";
import { elementClassName, styledNodeIds } from "../model/elementStyle";
import { needsDefaultOnClose } from "../model/metaRules";
import { isMultiSlot } from "../model/slots";
import type { PropValue, Screen, TfuiProject, UiNode } from "../model/types";
import { emitLuaLiteral, emitString, indent } from "./luaEmit";
import {
  collectHandlers,
  emitMeta,
  emitPropValue,
  isEmittablePropValue,
  nodeNeedsStyleutil,
} from "./propEmit";
import { SourceMapBuilder } from "./sourceMap";
import type { GeneratedFile } from "./types";
import { handlersFileName, handlersModulePath, isLuaIdentifier } from "./handlersFile";

interface EmitCtx {
  needsStyleutil: boolean;
  catalog: Catalog | null;
  /** Nœuds ayant un style par élément : reçoivent la classe `tfui-<id>`. */
  styledNodeIds: Set<string>;
  helperLocals: Map<
    string,
    { path: string; exportName: string; localName: string }
  >;
}

/** Append-only buffer that tracks 1-based line numbers for source maps. */
class LineWriter {
  private readonly chunks: string[] = [];
  readonly map = new SourceMapBuilder();

  get line(): number {
    return this.map.currentLine;
  }

  write(text: string): void {
    if (text.length === 0) return;
    this.chunks.push(text);
    this.map.advance(text);
  }

  toString(): string {
    return this.chunks.join("");
  }
}

function localNameForHelper(exportName: string): string {
  if (exportName === "ContentCard") return "content_card";
  if (exportName === "makeTextButton") return "button_react_util";
  return exportName.replace(/[^A-Za-z0-9_]/g, "_").toLowerCase();
}

function resolveCallExpr(type: string, ctx: EmitCtx): string {
  const ov = COMPONENT_OVERRIDES[type];
  if (ov?.ugRequire && ov.helperExport) {
    const localName = localNameForHelper(ov.helperExport);
    ctx.helperLocals.set(ov.ugRequire, {
      path: ov.ugRequire,
      exportName: ov.helperExport,
      localName,
    });
    return `${localName}.${ov.helperExport}`;
  }
  return `builtin.${type}`;
}

/**
 * Valeur d’enum sans son type (`Vertical`, enregistrée par d’anciennes
 * versions de l’inspecteur) → `Orientation.Vertical`, d’après le catalogue.
 * Sinon le code émis serait `builtin.type.Vertical`, qui vaut nil en jeu.
 */
export function qualifyEnumValue(
  nodeType: string,
  key: string,
  value: PropValue,
  catalog: Catalog | null,
): PropValue {
  if (value.kind !== "enum" || value.value.includes(".")) return value;
  const enumName = catalog?.components
    .find((c) => c.name === nodeType)
    ?.fields.find((f) => f.name === key)?.enumName;
  return enumName ? { ...value, value: `${enumName}.${value.value}` } : value;
}

/** Emit node expression into `w`, marking the node’s line span. */
function emitNodeToWriter(
  node: UiNode,
  level: number,
  ctx: EmitCtx,
  w: LineWriter,
): void {
  const start = w.line;
  const call = resolveCallExpr(node.type, ctx);

  // `AbsoluteLayout : function({TreeNodeId}) : TreeNodeId` (builtin.d.tl) et
  // `function(children) return children end` (builtin.lua) : la table passée
  // EST la liste des enfants. Ni props ni meta possibles ; `children = {…}`
  // ne laisserait aucun enfant (validateur `absolute_layout_params`).
  if (node.type === "AbsoluteLayout") {
    const children = node.slots.children ?? [];
    if (children.length === 0) {
      w.write(`${call} {}`);
    } else {
      w.write(`${call} {\n`);
      for (const c of children) {
        w.write(indent(level + 1));
        emitNodeToWriter(c, level + 1, ctx, w);
        w.write(",\n");
      }
      w.write(`${indent(level)}}`);
    }
    w.map.mark(node.id, start, w.line);
    return;
  }

  let metaForEmit =
    node.type === "Window" && node.meta.id
      ? { ...node.meta, id: undefined }
      : node.meta;
  if (ctx.styledNodeIds.has(node.id)) {
    const cls = elementClassName(node.id);
    const classes = metaForEmit.class ?? [];
    if (!classes.includes(cls)) {
      metaForEmit = { ...metaForEmit, class: [...classes, cls] };
    }
  }

  const prefixParts: string[] = [];
  if (node.type === "Window" && node.meta.id) {
    prefixParts.push(`${indent(level + 1)}id = ${emitString(node.meta.id)},`);
  }
  for (const [key, value] of Object.entries(node.props)) {
    if (!isEmittablePropValue(value)) continue;
    const qualified = qualifyEnumValue(node.type, key, value, ctx.catalog);
    const kind = ctx.catalog?.components
      .find((c) => c.name === node.type)
      ?.fields.find((f) => f.name === key)?.kind;
    prefixParts.push(`${indent(level + 1)}${key} = ${emitPropValue(qualified, kind)},`);
  }
  if (needsDefaultOnClose(node)) {
    // Bouton fermer sans onClose : il ne ferait rien (voir metaRules).
    const [i, j, k] = [indent(level + 1), indent(level + 2), indent(level + 3)];
    prefixParts.push(
      `${i}onClose = function()\n${j}pcall(function()\n${k}api.gui.byId.setVisible(${emitString(node.meta.id!)}, false)\n${j}end)\n${i}end,`,
    );
  }
  const meta = emitMeta(metaForEmit, level + 1);
  if (meta.code) {
    prefixParts.push(meta.code);
    if (meta.needsStyleutil) ctx.needsStyleutil = true;
  }

  const slotEntries = Object.entries(node.slots).filter(
    ([, children]) => children && children.length > 0,
  );

  if (prefixParts.length === 0 && slotEntries.length === 0) {
    w.write(`${call} {}`);
    w.map.mark(node.id, start, w.line);
    return;
  }

  w.write(`${call} {\n`);
  let bodyStarted = false;
  for (const part of prefixParts) {
    if (bodyStarted) w.write("\n");
    w.write(part);
    bodyStarted = true;
  }

  for (const [slot, children] of slotEntries) {
    if (bodyStarted) w.write("\n");
    bodyStarted = true;
    if (!isMultiSlot(node.type, slot, ctx.catalog)) {
      w.write(`${indent(level + 1)}${slot} = `);
      emitNodeToWriter(children[0]!, level + 1, ctx, w);
      w.write(",");
    } else {
      w.write(`${indent(level + 1)}${slot} = {\n`);
      for (const c of children) {
        w.write(indent(level + 2));
        emitNodeToWriter(c, level + 2, ctx, w);
        w.write(",\n");
      }
      w.write(`${indent(level + 1)}},`);
    }
  }

  w.write(`\n${indent(level)}}`);
  w.map.mark(node.id, start, w.line);
}

function kindOrder(kind: Screen["kind"]): number {
  if (kind === "window") return 0;
  if (kind === "plugin") return 1;
  return 2;
}

function writeRegisterBlock(
  screen: Screen,
  ctx: EmitCtx,
  w: LineWriter,
): void {
  const recipeNameLit = emitString(screen.recipeName);
  const assign = `\trecipes.${screen.recipeName} = `;

  if (screen.kind === "window") {
    w.write(
      `${assign}react.RegisterWrapperRecipe(${recipeNameLit}, builtin.Window, function(_params)\n`,
    );
  } else if (screen.kind === "plugin") {
    const pluginName = screen.plugin?.pluginName ?? screen.recipeName;
    w.write(
      `${assign}react.RegisterPluginRecipe(main_mod_button_area.MainModButtonAreaExtension, ${emitString(pluginName)}, function(_params)\n`,
    );
  } else {
    w.write(
      `${assign}react.RegisterRecipe(${recipeNameLit}, function(_params)\n`,
    );
  }

  for (const s of screen.state) {
    const init = emitLuaLiteral(s.initial);
    w.write(`\t\tlocal ${s.name} = react.useState(${init})\n`);
  }

  w.write(`\t\treturn `);
  emitNodeToWriter(screen.root, 2, ctx, w);
  w.write(`\n\tend)`);
}

function scriptNeedsGameReactGlobals(screens: Screen[]): boolean {
  for (const screen of screens) {
    let found = false;
    const walk = (node: UiNode): void => {
      for (const value of Object.values(node.props)) {
        if (
          value?.kind === "lua" &&
          /game_react_globals|addSingletonWindow|getDefaultWindowApi/.test(
            value.code,
          )
        ) {
          found = true;
        }
      }
      for (const children of Object.values(node.slots)) {
        for (const child of children) walk(child);
      }
    };
    walk(screen.root);
    if (found) return true;
  }
  return screens.some(
    (s) => s.kind === "plugin" && screens.some((w) => w.kind === "window"),
  );
}

function lineOffsetForSuffix(prefix: string): number {
  if (prefix.length === 0) return 0;
  let lines = 1;
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] === "\n") lines++;
  }
  return lines - 1;
}

/** Emit one `.script.lua` for one or more screens sharing the same `fileBase`. */
export function genScript(
  project: TfuiProject,
  screensInput: Screen | Screen[],
): GeneratedFile {
  const screens = (
    Array.isArray(screensInput) ? screensInput : [screensInput]
  ).slice();
  if (screens.length === 0) {
    throw new Error("genScript: aucun écran");
  }
  screens.sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind));
  const fileBase = screens[0]!.fileBase;

  const handlers = new Set<string>();
  for (const screen of screens) collectHandlers(screen.root, handlers);
  // Seuls les noms Lua valides sont pris dans le fichier handlers.
  const handlerList = [...handlers].filter(isLuaIdentifier).sort();

  const ctx: EmitCtx = {
    needsStyleutil: screens.some((s) => nodeNeedsStyleutil(s.root)),
    catalog: getActiveCatalog(),
    styledNodeIds: styledNodeIds(project),
    helperLocals: new Map(),
  };

  const regWriter = new LineWriter();
  for (let i = 0; i < screens.length; i++) {
    if (i > 0) regWriter.write("\n\t\n");
    writeRegisterBlock(screens[i]!, ctx, regWriter);
  }
  const registerBlocks = regWriter.toString();
  const registerMarks = regWriter.map.build();

  const requireLines: string[] = [
    `\tlocal react = ug_require "::/gui/main/react.lua"`,
    `\tlocal builtin = ug_require "::/gui/main/builtin.lua"`,
  ];
  if (ctx.needsStyleutil) {
    requireLines.push(
      `\tlocal styleutil = ug_require "::/gui/main/styleutil.tl"`,
    );
  }
  if (screens.some((s) => s.kind === "plugin")) {
    requireLines.push(
      `\tlocal main_mod_button_area = ug_require "::/gui/main/main_mod_button_area.tl"`,
    );
  }
  if (scriptNeedsGameReactGlobals(screens)) {
    requireLines.push(
      `\tlocal game_react_globals = ug_require "::/gui/main/game_react_globals.tl"`,
    );
  }
  for (const helper of [...ctx.helperLocals.values()].sort((a, b) =>
    a.localName.localeCompare(b.localName),
  )) {
    requireLines.push(
      `\tlocal ${helper.localName} = ug_require ${emitString(helper.path)}`,
    );
  }
  // Code de l’utilisateur : fichier séparé, jamais réécrit par l’éditeur.
  if (handlerList.length > 0) {
    const modulePath = handlersModulePath(project.mod.modId, project.mod.guiDir, fileBase);
    requireLines.push(`\tlocal handlers = ug_require ${emitString(modulePath)}`);
  }

  const returnEntries = screens.map(
    (s) => `\t\t${s.recipeName} = recipes.${s.recipeName},`,
  );

  const head = [
    `-- Generated by TFUI - Transport Fever 3 UI Editor — fichier régénéré, ne pas modifier : votre code va dans ${handlersFileName(fileBase)}`,
    `function data()`,
    ...requireLines,
    `\t`,
    `\tlocal recipes = {}`,
    `\t`,
  ].join("\n");

  const tail = ["\t", `\treturn {`, ...returnEntries, `\t}`, `end`, ``].join(
    "\n",
  );

  const content = `${head}\n${registerBlocks}\n${tail}`;
  const offset = lineOffsetForSuffix(`${head}\n`);
  const sourceMap = registerMarks.map((e) => ({
    ...e,
    startLine: e.startLine + offset,
    endLine: e.endLine + offset,
  }));

  return {
    path: `${fileBase}.script.lua`,
    content,
    sourceMap,
    kind: "script",
    screenId: screens[0]!.id,
    handlers: handlerList,
  };
}
