import { hasKey, translateKey } from "../i18n";
import { isPaletteColor } from "../model/paletteColor";

/**
 * Valeurs de style (règles `.css.lua`) : saisie texte ↔ valeur Lua simple.
 * Les clés de STYLE_KEY_SPECS ont une forme connue et un rendu dans l’aperçu ;
 * les autres clés du vocabulaire vanilla sont éditées en texte libre.
 */

export interface StyleKeySpec {
  /** Nombre de composantes d’un vecteur. */
  len: number;
  /** Libellés des composantes. */
  parts: string[];
  /** Valeur proposée à l’ajout. */
  initial: number[];
  /** Bornes (couleur 0..1). */
  min?: number;
  max?: number;
  /** Rôle affiché à côté de la clé (ex. « texte », « fond »). */
  label?: string;
  hint?: string;
}

/** Noms d’axes traduits (`styleKey.axes.<forme>`, séparés par des virgules). */
type Axes = "wh" | "xy" | "trbl" | "rgba";

/** Spécification dont libellé, aide et axes sont lus dans la langue courante. */
function spec(name: string, axes: Axes, base: Omit<StyleKeySpec, "parts" | "label" | "hint">): StyleKeySpec {
  return {
    ...base,
    get parts() {
      return translateKey(`styleKey.axes.${axes}`).split(",").map((p) => p.trim());
    },
    get label() {
      const key = `styleKey.${name}.label`;
      return hasKey(key) ? translateKey(key) : undefined;
    },
    get hint() {
      const key = `styleKey.${name}.hint`;
      return hasKey(key) ? translateKey(key) : undefined;
    },
  };
}

export const STYLE_KEY_SPECS: Record<string, StyleKeySpec> = {
  size: spec("size", "wh", { len: 2, initial: [-1, -1] }),
  innerSpacing: spec("innerSpacing", "xy", { len: 2, initial: [0, 0] }),
  outerSpacing: spec("outerSpacing", "xy", { len: 2, initial: [0, 0] }),
  padding: spec("padding", "trbl", { len: 4, initial: [0, 0, 0, 0] }),
  gravity: spec("gravity", "xy", { len: 2, initial: [-1, -1] }),
  margin: spec("margin", "trbl", { len: 4, initial: [0, 0, 0, 0] }),
  minSize: spec("minSize", "wh", { len: 2, initial: [0, 0] }),
  maxSize: spec("maxSize", "wh", { len: 2, initial: [-1, -1] }),
  color: spec("color", "rgba", { len: 4, initial: [1, 1, 1, 1], min: 0, max: 1 }),
  backgroundColor: spec("backgroundColor", "rgba", { len: 4, initial: [0.1, 0.1, 0.1, 1], min: 0, max: 1 }),
  backgroundColor1: spec("backgroundColor1", "rgba", { len: 4, initial: [0.1, 0.1, 0.1, 1], min: 0, max: 1 }),
  backgroundColor2: spec("backgroundColor2", "rgba", { len: 4, initial: [0.1, 0.1, 0.1, 1], min: 0, max: 1 }),
  shadowColor: spec("shadowColor", "rgba", { len: 4, initial: [0, 0, 0, 0.5], min: 0, max: 1 }),
  borderColor: spec("borderColor", "rgba", { len: 4, initial: [1, 1, 1, 1], min: 0, max: 1 }),
  // Formes et bornes relevées dans les .css.lua vanilla (2026-10-18).
  textAlignment: spec("textAlignment", "xy", { len: 2, initial: [0.5, 0.5], min: -1, max: 1 }),
  anchorPoint: spec("anchorPoint", "xy", { len: 2, initial: [0, 0], min: 0, max: 1 }),
  borderWidth: spec("borderWidth", "trbl", { len: 4, initial: [1, 1, 1, 1], min: 0 }),
};

/** Clé de style scalaire à éditeur dédié (nombre, booléen, valeur parmi une liste). */
export type ScalarStyleSpec = {
  label?: string;
  hint?: string;
} & (
  | { kind: "number"; initial: number; min?: number }
  | { kind: "boolean"; initial: boolean }
  | { kind: "enum"; initial: string; values: readonly string[] }
);

/** Spécification scalaire dont libellé et aide sont lus dans la langue courante. */
function scalar<T extends Omit<ScalarStyleSpec, "label" | "hint">>(name: string, base: T): T & { label?: string; hint?: string } {
  return {
    ...base,
    get label() {
      const key = `styleKey.${name}.label`;
      return hasKey(key) ? translateKey(key) : undefined;
    },
    get hint() {
      const key = `styleKey.${name}.hint`;
      return hasKey(key) ? translateKey(key) : undefined;
    },
  };
}

/** Valeurs relevées dans les .css.lua vanilla (noms techniques, non traduits). */
export const SCALAR_STYLE_SPECS: Record<string, ScalarStyleSpec> = {
  fontSize: scalar("fontSize", { kind: "number", initial: 14, min: 1 }),
  textAutoWrap: scalar("textAutoWrap", { kind: "boolean", initial: true }),
  visibility: scalar("visibility", {
    kind: "enum",
    initial: "visible",
    values: ["visible", "hidden", "transparent", "folded", "none"],
  }),
  fontWeight: scalar("fontWeight", {
    kind: "enum",
    initial: "Regular",
    values: ["Regular", "Medium", "Bold", "MonoRegular"],
  }),
};

/** Libellé (rôle) d’une clé connue, dans la langue courante. */
export function styleKeyLabel(key: string): string | undefined {
  return STYLE_KEY_SPECS[key]?.label ?? SCALAR_STYLE_SPECS[key]?.label;
}

/** Aide d’une clé connue, dans la langue courante. */
export function styleKeyHint(key: string): string | undefined {
  return STYLE_KEY_SPECS[key]?.hint ?? SCALAR_STYLE_SPECS[key]?.hint;
}

/** Clé à éditeur dédié (vecteur ou scalaire). */
export function hasDedicatedEditor(key: string): boolean {
  return key in STYLE_KEY_SPECS || key in SCALAR_STYLE_SPECS;
}

/** Clés scalaires aussi rendues par l’aperçu. */
const PREVIEWED_SCALAR_KEYS = new Set(["fontSize", "fontWeight"]);

/**
 * Valeur proposée à l’ajout d’une clé : la valeur effective si elle existe,
 * sinon la valeur initiale d’une clé connue, sinon rien (saisie requise).
 */
export function initialStyleValue(key: string, current?: unknown): unknown {
  if (current !== undefined) return current;
  const spec = STYLE_KEY_SPECS[key];
  if (spec) return [...spec.initial];
  return SCALAR_STYLE_SPECS[key]?.initial;
}

/** Clés rendues par l’aperçu (voir preview/styleToCss.ts). */
/** Clés à forme connue (éditeur dédié) mais que l’aperçu ne dessine pas. */
const NOT_PREVIEWED_KEYS = new Set(["backgroundColor2", "shadowColor", "anchorPoint", "borderWidth"]);

export function isPreviewedStyleKey(key: string): boolean {
  if (NOT_PREVIEWED_KEYS.has(key)) return false;
  return key in STYLE_KEY_SPECS || PREVIEWED_SCALAR_KEYS.has(key);
}

export type StyleScalar = number | boolean | string | number[];

/** Texte saisi → valeur : `{1, 2}` ou `1, 2` → tableau, nombre, booléen, sinon chaîne. */
export function parseStyleValue(text: string): StyleScalar | undefined {
  const t = text.trim();
  if (t === "") return undefined;
  const inner = t.startsWith("{") && t.endsWith("}") ? t.slice(1, -1) : t;
  if (inner.includes(",")) {
    const nums = inner.split(",").map((s) => Number(s.trim()));
    if (nums.every((n) => Number.isFinite(n))) return nums;
  }
  if (t === "true") return true;
  if (t === "false") return false;
  const n = Number(t);
  if (Number.isFinite(n)) return n;
  const quoted = t.match(/^"(.*)"$/) ?? t.match(/^'(.*)'$/);
  return quoted ? quoted[1] : t;
}

/** Clé de couleur RGBA (sélecteur de couleurs). */
export function isColorSpec(spec: StyleKeySpec): boolean {
  return spec.parts.join(",") === "r,v,b,a";
}

export function formatStyleValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (isPaletteColor(value)) return `colorDefault.${value.name}`;
  if (value === undefined || value === null) return "";
  return String(value);
}

/** Vecteur de longueur `len` (complété à 0) ou null si la valeur n’en est pas un. */
export function asVector(value: unknown, len: number): number[] | null {
  if (!Array.isArray(value) || !value.every((n) => typeof n === "number")) return null;
  const out = [...(value as number[])];
  while (out.length < len) out.push(0);
  return out.slice(0, len);
}
