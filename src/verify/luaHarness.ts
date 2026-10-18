import type { Catalog } from "../catalog/types";
import type { GeneratedFile } from "../codegen/types";
import { LUA_PRELUDE } from "./luaPrelude";
import { t } from "../i18n";
import { backendMessage } from "../i18n/backend";

/** Fichiers du jeu exécutés tels quels (lus depuis l’installation, jamais copiés). */
export const GAME_RUNTIME_FILES = [
  "gui/main/react.lua",
  "gui/main/builtin.lua",
  "gui/main/stylesheetutil.lua",
] as const;

export interface HarnessIssue {
  severity: "error" | "warning" | "info";
  message: string;
  /** Fichier généré concerné. */
  file: string;
}

export interface HarnessReport {
  issues: HarnessIssue[];
  /** Nombre de recettes rendues (0 = rien n’a tourné). */
  rendered: number;
}

/** Table Lua littérale `{ ["k"] = "v", … }` (chaînes seulement). */
function luaStringMap(entries: [string, string][]): string {
  return `{${entries
    .map(([k, v]) => `[${JSON.stringify(k)}]=${JSON.stringify(v)}`)
    .join(",")}}`;
}

/**
 * `WithComponentParamsParam` (builtin.d.tl) : enveloppe créée par react.lua
 * pour les clés `meta` ; absente du catalogue des composants.
 */
const WITH_COMPONENT_PARAMS: [string, string][] = [
  ["id", "string"],
  ["tag", "string"],
  ["tooltip", "string"],
  ["tooltipModifierInputAction", "string"],
  ["forceFocusable", "boolean"],
  ["disableFocusableRecursive", "boolean"],
  ["enabled", "boolean"],
  ["item", "slot-single"],
  ["styleSheet", "unsupported"],
];

function catalogTables(catalog: Catalog): string {
  const components = catalog.components.some((c) => c.name === "WithComponentParams")
    ? catalog.components
    : [
        ...catalog.components,
        {
          name: "WithComponentParams",
          fields: WITH_COMPONENT_PARAMS.map(([name, kind]) => ({ name, kind })),
        },
      ];
  const fields = components
    .map(
      (c) =>
        `[${JSON.stringify(c.name)}]=${luaStringMap(
          c.fields.map((f) => [f.name, f.kind]),
        )}`,
    )
    .join(",");
  const enums = Object.entries(catalog.enums)
    .map(([name, values]) => `[${JSON.stringify(name)}]={${values.map((v) => JSON.stringify(v)).join(",")}}`)
    .join(",");
  return `__fieldTables = {${fields}}\n__enumTables = {${enums}}\n`;
}

/**
 * Exécute les fichiers GUI générés dans une VM Lua avec le vrai runtime React
 * du jeu (`gameFiles` : contenu de `GAME_RUNTIME_FILES`). Chaque fichier
 * tourne dans une VM neuve (comme un chargement par le jeu).
 */
export async function runGeneratedGui(opts: {
  files: GeneratedFile[];
  catalog: Catalog;
  gameFiles: Record<string, string>;
  /** Fichiers du mod chargés par chemin complet (`<modId>::/gui/x.handlers.lua`). */
  modFiles?: Record<string, string>;
  /** URL du `glue.wasm` de wasmoon (navigateur) ; Node le trouve seul. */
  wasmUrl?: string;
  /** Noms de `default_colors.gres` : un nom inconnu vaut alors nil, comme en jeu. */
  paletteNames?: string[];
}): Promise<HarnessReport> {
  const { LuaFactory } = await import("wasmoon");
  const factory = new LuaFactory(opts.wasmUrl);
  const issues: HarnessIssue[] = [];
  let rendered = 0;

  for (const file of opts.files) {
    if (file.kind !== "script" && file.kind !== "css") continue;
    const lua = await factory.createEngine();
    try {
      lua.global.set(
        "__readFile",
        // `undefined` = nil en Lua (`null` fait échouer wasmoon).
        (path: string) => opts.gameFiles[path] ?? opts.modFiles?.[path] ?? undefined,
      );
      await lua.doString(catalogTables(opts.catalog));
      if (opts.paletteNames?.length) {
        await lua.doString(`__paletteNames = {${opts.paletteNames.map((n) => `[${JSON.stringify(n)}]=true`).join(",")}}`);
      }
      await lua.doString(LUA_PRELUDE);
      const entry = file.kind === "script" ? "__tfuiRunScript" : "__tfuiRunCss";
      const run = lua.global.get(entry) as (src: string, name: string) => void;
      run(file.content, file.path);
      const json = (lua.global.get("__tfuiIssuesJson") as () => string)();
      const report = JSON.parse(json) as {
        rendered: number;
        issues: { severity: HarnessIssue["severity"]; message: string }[];
      };
      rendered += report.rendered;
      for (const raw of report.issues) {
        // Messages du banc : codes traduits (backend.harness.*).
        const i = { ...raw, message: backendMessage(raw.message) };
        // La même recette peut être rendue plusieurs fois (export + bouton).
        const first = i.message.split("\n")[0];
        if (issues.some((x) => x.file === file.path && x.message.split("\n")[0] === first)) continue;
        issues.push({ ...i, file: file.path });
      }
    } catch (error) {
      issues.push({
        severity: "error",
        message: t("runtime.harness", { message: error instanceof Error ? error.message : String(error) }),
        file: file.path,
      });
    } finally {
      lua.global.close();
    }
  }
  return { issues, rendered };
}
