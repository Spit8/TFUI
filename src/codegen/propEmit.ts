import { isDefaultEnabled } from "../model/metaRules";
import { isLuaIdentifier } from "./handlersFile";
import { isPaletteColor, isPaletteName } from "../model/paletteColor";
import type { PropValue, StyleProps, UiNode, UiNodeMeta } from "../model/types";
import {
  emitArray,
  emitBoolean,
  emitLuaLiteral,
  emitNumber,
  emitPaletteColor,
  emitString,
  indent,
  PALETTE_ACCESS,
} from "./luaEmit";

export interface RewriteRuleHit {
  id: string;
  /** Libellé court FR pour Problèmes / tooltip. */
  label: string;
}

export interface RewriteResult {
  code: string;
  applied: RewriteRuleHit[];
}

type RewriteStep = {
  id: string;
  label: string;
  apply: (code: string) => string;
};

const REWRITE_STEPS: RewriteStep[] = [
  {
    id: "colon_addSingletonWindow",
    label: ":addSingletonWindow → .addSingletonWindow",
    apply: (c) => c.replace(/:addSingletonWindow\b/g, ".addSingletonWindow"),
  },
  {
    id: "colon_addWindow",
    label: ":addWindow → .addWindow",
    apply: (c) => c.replace(/:addWindow\b/g, ".addWindow"),
  },
  {
    id: "colon_moveSingletonWindowToFront",
    label: ":moveSingletonWindowToFront → .moveSingletonWindowToFront",
    apply: (c) =>
      c.replace(
        /:moveSingletonWindowToFront\b/g,
        ".moveSingletonWindowToFront",
      ),
  },
  {
    id: "strip_local_util",
    label: "retrait local util = ug_require /scripts/util.tl",
    apply: (c) =>
      c.replace(/\n[ \t]*local util = ug_require "\/scripts\/util\.tl"/g, ""),
  },
  {
    id: "util_useFn_to_recipes",
    label: "util.useFn(…@Recipe) → recipes.Recipe",
    apply: (c) =>
      c.replace(/util\.useFn\("[^"]*@([A-Za-z0-9_]+)"\)/g, "recipes.$1"),
  },
  {
    id: "strip_local_main",
    label: "retrait local main = ug_require …script",
    apply: (c) => c.replace(/\n[ \t]*local main = ug_require "[^"]+"/g, ""),
  },
  {
    id: "main_Recipe_to_recipes",
    label: "addSingletonWindow(main.X → recipes.X",
    apply: (c) =>
      c.replace(
        /addSingletonWindow\(main\.([A-Za-z0-9_]+)/g,
        "addSingletonWindow(recipes.$1",
      ),
  },
  {
    id: "strip_api_nil_guard",
    label: "retrait garde if api == nil (tfui)",
    apply: (c) =>
      c.replace(
        /\n[ \t]*if api == nil then\n[ \t]*print\("\[tfui\] getDefaultWindowApi\(\) is nil"\)\n[ \t]*return\n[ \t]*end/g,
        "",
      ),
  },
  {
    id: "strip_recipe_nil_guard",
    label: "retrait garde if recipe == nil (tfui)",
    apply: (c) =>
      c.replace(
        /\n[ \t]*if recipe == nil then\n[ \t]*print\("\[tfui\][^\n]+"\)\n[ \t]*return\n[ \t]*end/g,
        "",
      ),
  },
  {
    id: "local_recipe_to_recipes",
    label: "local recipe = … → recipes.Name",
    apply: (c) => {
      const recipeLocal = c.match(
        /local recipe = (?:recipes\.)?([A-Za-z0-9_]+)/,
      );
      if (!recipeLocal) return c;
      const name = recipeLocal[1];
      let out = c.replace(
        /\n[ \t]*local recipe = (?:recipes\.)?[A-Za-z0-9_]+\s*/g,
        "\n",
      );
      out = out.replace(
        /addSingletonWindow\(recipe,/g,
        `addSingletonWindow(recipes.${name},`,
      );
      return out;
    },
  },
  {
    id: "bare_Recipe_to_recipes",
    label: "addSingletonWindow(BareName → recipes.BareName",
    apply: (c) =>
      c.replace(
        /addSingletonWindow\(([A-Z][A-Za-z0-9_]*),/g,
        (full, name: string) =>
          name === "Recipe" ? full : `addSingletonWindow(recipes.${name},`,
      ),
  },
  {
    id: "strip_local_game_react_globals",
    label: "retrait local game_react_globals = ug_require (handler)",
    apply: (c) =>
      c.replace(
        /\n[ \t]*local game_react_globals = ug_require "::\/gui\/main\/game_react_globals\.tl"/g,
        "",
      ),
  },
  {
    id: "api_to_wapi_local",
    label: "local api = getDefaultWindowApi → local wapi",
    apply: (c) =>
      c.replace(
        /local api = game_react_globals\.getDefaultWindowApi\(\)/g,
        "local wapi = game_react_globals.getDefaultWindowApi()",
      ),
  },
  {
    id: "api_addSingleton_to_wapi",
    label: "api.addSingletonWindow → wapi.addSingletonWindow",
    apply: (c) =>
      c.replace(/\bapi\.addSingletonWindow\b/g, "wapi.addSingletonWindow"),
  },
  {
    id: "api_moveToFront_to_wapi",
    label: "api.moveSingletonWindowToFront → wapi…",
    apply: (c) =>
      c.replace(
        /\bapi\.moveSingletonWindowToFront\b/g,
        "wapi.moveSingletonWindowToFront",
      ),
  },
  {
    id: "if_api_and_recipe_to_wapi",
    label: "if api ~= nil and recipe ~= nil → if wapi ~= nil",
    apply: (c) =>
      c.replace(
        /if api ~= nil and recipe ~= nil then/g,
        "if wapi ~= nil then",
      ),
  },
  {
    id: "if_api_ne_nil_to_wapi",
    label: "if api ~= nil then → if wapi ~= nil then",
    apply: (c) => c.replace(/if api ~= nil then/g, "if wapi ~= nil then"),
  },
  {
    id: "if_api_eq_nil_to_wapi",
    label: "if api == nil then → if wapi == nil then",
    apply: (c) => c.replace(/if api == nil then/g, "if wapi == nil then"),
  },
];

/** Ids de toutes les règles (pour tests 1:1). */
export const REWRITE_RULE_IDS: string[] = REWRITE_STEPS.map((s) => s.id);

/**
 * Normalize window-open handlers (match proven in-game mod pattern).
 * Retourne le code + la liste des règles qui ont effectivement changé le texte.
 */
export function rewriteWindowOpenLua(code: string): RewriteResult {
  let out = code;
  const applied: RewriteRuleHit[] = [];
  for (const step of REWRITE_STEPS) {
    const next = step.apply(out);
    if (next !== out) {
      applied.push({ id: step.id, label: step.label });
      out = next;
    }
  }
  return { code: out, applied };
}

/** False when emitting would produce invalid Lua like `onClose = ,`. */
export function isEmittablePropValue(value: PropValue | undefined | null): boolean {
  if (!value) return false;
  switch (value.kind) {
    case "literal":
      return value.value !== undefined && value.value !== null;
    case "enum":
      return value.value.trim().length > 0;
    case "state":
      return value.stateVar.trim().length > 0;
    case "handler":
      return value.fn.trim().length > 0;
    case "lua":
      return value.code.trim().length > 0;
    default:
      return false;
  }
}

/**
 * Champs vecteurs des paramètres (`builtin.d.tl` : `size : Vec2i`…) : userdata
 * C++, construits comme le vanilla par `api.type.Vec2i.new(4, 3)`. Une table
 * `{ 15, 15 }` fait échouer le rendu en jeu (« Could not assign value to
 * userdata 'size' », constaté le 2026-10-18).
 */
const VECTOR_TYPES: Partial<Record<string, string>> = {
  vec2i: "Vec2i",
  vec2f: "Vec2f",
  vec3f: "Vec3f",
  vec4f: "Vec4f",
};

/** `kind` : type du champ dans le catalogue (`vec2i`…), s’il est connu. */
export function emitPropValue(value: PropValue, kind?: string): string {
  const vectorType = kind ? VECTOR_TYPES[kind] : undefined;
  if (vectorType && value.kind === "literal" && Array.isArray(value.value)) {
    const axes = value.value.map((n) => emitNumber(kind === "vec2i" ? Math.round(n) : n));
    return `api.type.${vectorType}.new(${axes.join(", ")})`;
  }
  switch (value.kind) {
    case "literal":
      return emitLuaLiteral(value.value);
    case "enum": {
      const v = value.value;
      if (v.startsWith("builtin.")) return v;
      if (v.includes(".")) return `builtin.type.${v}`;
      return `builtin.type.${v}`;
    }
    case "state":
      return value.stateVar;
    case "handler":
      // Défini par l’utilisateur dans `<fileBase>.handlers.lua`.
      return isLuaIdentifier(value.fn) ? `handlers.${value.fn}` : value.fn;
    case "lua":
      return rewriteWindowOpenLua(value.code).code;
    default:
      return "nil";
  }
}

export function emitStylePropsTable(style: StyleProps, level: number): string {
  const entries: string[] = [];
  for (const [key, raw] of Object.entries(style)) {
    if (raw === undefined) continue;
    if (isPaletteColor(raw) && isPaletteName(raw.name)) {
      entries.push(
        `${indent(level)}${key} = ${emitPaletteColor(raw.name, raw.alpha, `(${PALETTE_ACCESS})`)},`,
      );
    } else if (Array.isArray(raw) && raw.every((n) => typeof n === "number")) {
      entries.push(
        `${indent(level)}${key} = ${emitArray(raw as number[])},`,
      );
    } else if (typeof raw === "number") {
      entries.push(`${indent(level)}${key} = ${emitNumber(raw)},`);
    } else if (typeof raw === "boolean") {
      entries.push(`${indent(level)}${key} = ${emitBoolean(raw)},`);
    } else if (typeof raw === "string") {
      entries.push(`${indent(level)}${key} = ${emitString(raw)},`);
    }
  }
  if (entries.length === 0) return "{}";
  return `{\n${entries.join("\n")}\n${indent(level - 1)}}`;
}

export function emitMeta(
  meta: UiNodeMeta,
  level: number,
): { code: string; needsStyleutil: boolean } {
  const parts: string[] = [];
  let needsStyleutil = false;

  if (meta.id) {
    parts.push(`${indent(level + 1)}id = ${emitString(meta.id)},`);
  }
  if (meta.class && meta.class.length > 0) {
    parts.push(
      `${indent(level + 1)}class = ${emitString(meta.class.join(", "))},`,
    );
  }
  if (meta.tooltip) {
    parts.push(`${indent(level + 1)}tooltip = ${emitString(meta.tooltip)},`);
  }
  // `true` est la valeur par défaut : l’émettre envelopperait le nœud pour rien.
  if (
    meta.enabled &&
    !isDefaultEnabled(meta.enabled) &&
    isEmittablePropValue(meta.enabled)
  ) {
    parts.push(
      `${indent(level + 1)}enabled = ${emitPropValue(meta.enabled)},`,
    );
  }
  if (meta.inlineStyle && Object.keys(meta.inlineStyle).length > 0) {
    needsStyleutil = true;
    parts.push(
      `${indent(level + 1)}styleSheet = styleutil.makeStyle(${emitStylePropsTable(meta.inlineStyle, level + 2)}),`,
    );
  }

  if (parts.length === 0) return { code: "", needsStyleutil: false };
  return {
    code: `${indent(level)}meta = {\n${parts.join("\n")}\n${indent(level)}},`,
    needsStyleutil,
  };
}

export function collectHandlers(node: UiNode, into: Set<string>): void {
  for (const value of Object.values(node.props)) {
    if (value?.kind === "handler") into.add(value.fn);
  }
  if (node.meta.enabled?.kind === "handler") into.add(node.meta.enabled.fn);
  for (const children of Object.values(node.slots)) {
    for (const child of children) collectHandlers(child, into);
  }
}

export function nodeNeedsStyleutil(node: UiNode): boolean {
  if (node.meta.inlineStyle && Object.keys(node.meta.inlineStyle).length > 0) {
    return true;
  }
  for (const children of Object.values(node.slots)) {
    for (const child of children) {
      if (nodeNeedsStyleutil(child)) return true;
    }
  }
  return false;
}
