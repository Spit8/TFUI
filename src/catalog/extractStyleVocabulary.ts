import type { StyleVocabulary } from "./types";

const BANG_CLASS_RE = /!([A-Za-z_][A-Za-z0-9_-]*)/g;
const FONT_SCALE_RE = /\bfont-scale-[A-Za-z0-9_-]+/g;

/** Une règle `a(<sélecteur>, { … })` d’un `.css.lua` : sélecteur et clés de premier niveau. */
export interface CssLuaRule {
  selector: string;
  keys: string[];
}

/** Longueur d’un commentaire / d’une chaîne longue `[[…]]` / `[==[…]==]` qui commence en `i`, sinon 0. */
function longBracketEnd(src: string, i: number): number {
  const m = /^\[(=*)\[/.exec(src.slice(i, i + 16));
  if (!m) return -1;
  const close = `]${m[1]}]`;
  const end = src.indexOf(close, i + m[0].length);
  return end < 0 ? src.length : end + close.length;
}

/**
 * Saute ce qui n’est pas du code à partir de `i` (commentaire, chaîne) ;
 * renvoie l’indice suivant, ou `i` si rien n’est sauté.
 */
function skipNonCode(src: string, i: number): number {
  if (src.startsWith("--", i)) {
    const long = longBracketEnd(src, i + 2);
    if (long >= 0) return long;
    const nl = src.indexOf("\n", i);
    return nl < 0 ? src.length : nl + 1;
  }
  const c = src[i];
  if (c === '"' || c === "'") {
    let j = i + 1;
    while (j < src.length && src[j] !== c) {
      if (src[j] === "\\") j++;
      if (src[j] === "\n") break;
      j++;
    }
    return j + 1;
  }
  if (c === "[") {
    const long = longBracketEnd(src, i);
    if (long >= 0) return long;
  }
  return i;
}

function skipSpace(src: string, i: number): number {
  for (;;) {
    while (i < src.length && /\s/.test(src[i]!)) i++;
    const next = src.startsWith("--", i) ? skipNonCode(src, i) : i;
    if (next === i) return i;
    i = next;
  }
}

/** Chaîne littérale qui commence en `i` (`"…"`, `'…'`, `[[…]]`) : contenu et fin. */
function readStringLiteral(src: string, i: number): { value: string; end: number } | null {
  const c = src[i];
  if (c === '"' || c === "'") {
    const end = skipNonCode(src, i);
    return { value: src.slice(i + 1, end - 1), end };
  }
  const m = /^\[(=*)\[/.exec(src.slice(i, i + 16));
  if (!m) return null;
  const end = longBracketEnd(src, i);
  return { value: src.slice(i + m[0].length, end - m[1]!.length - 2), end };
}

/**
 * Clés de premier niveau de la table qui commence en `open` (`{`) :
 * `cle = …` directement dans cette table (les tables imbriquées — 9-patch
 * `fileName` / `horizontal`… — ne comptent pas).
 */
function readTopLevelKeys(src: string, open: number): { keys: string[]; end: number } {
  const keys: string[] = [];
  let depth = 0;
  let i = open;
  // Début d’un champ : juste après `{`, `,` ou `;` de la table elle-même.
  let fieldStart = false;
  while (i < src.length) {
    const skipped = skipNonCode(src, i);
    if (skipped !== i) {
      fieldStart = false;
      i = skipped;
      continue;
    }
    const c = src[i]!;
    if (c === "{") {
      depth++;
      fieldStart = depth === 1;
      i++;
      continue;
    }
    if (c === "}") {
      depth--;
      i++;
      if (depth === 0) return { keys, end: i };
      continue;
    }
    if (depth === 1 && (c === "," || c === ";")) {
      fieldStart = true;
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (depth === 1 && fieldStart) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/.exec(src.slice(i, i + 80));
      if (m) keys.push(m[1]!);
    }
    fieldStart = false;
    i++;
  }
  return { keys, end: i };
}

/** Règles `a("sélecteur", { … })` d’un `.css.lua` (sélecteur et table littéraux seulement). */
export function parseCssLuaRules(content: string): CssLuaRule[] {
  const rules: CssLuaRule[] = [];
  let i = 0;
  while (i < content.length) {
    const skipped = skipNonCode(content, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    const isCall =
      content[i] === "a" &&
      !/[A-Za-z0-9_.:]/.test(content[i - 1] ?? " ") &&
      /^a\s*\(/.test(content.slice(i, i + 8));
    if (!isCall) {
      i++;
      continue;
    }
    let j = skipSpace(content, content.indexOf("(", i) + 1);
    const sel = readStringLiteral(content, j);
    if (!sel) {
      i = j;
      continue;
    }
    j = skipSpace(content, sel.end);
    if (content[j] !== ",") {
      i = j;
      continue;
    }
    j = skipSpace(content, j + 1);
    if (content[j] !== "{") {
      i = j;
      continue;
    }
    const table = readTopLevelKeys(content, j);
    rules.push({ selector: sel.value, keys: [...new Set(table.keys)] });
    i = table.end;
  }
  return rules;
}

/**
 * Builtins que le vanilla vise par leur nom de recette : `R::Component!x`
 * (359 règles) contre 2 `Component!x`. `builtin.Component` est déclaré par
 * `react.DeclareBuiltinWithUserdata("Component", …)` (`builtin.lua`).
 * Constaté en jeu (2026-10-18, banc) : `Component!tfui-<id>` { fond, padding }
 * ne s’applique pas ; la forme `R::Component` est la seule retenue.
 */
export const RECIPE_SELECTED_BUILTINS = new Set(["Component"]);

/** Élément d’un sélecteur pour un type : `R::Component` pour ces builtins. */
export function typeSelectorToken(type: string): string {
  return RECIPE_SELECTED_BUILTINS.has(type) ? `R::${type}` : type;
}

/**
 * Élément visé par le dernier niveau d’un sélecteur simple (sans `,`) :
 * `Type` ou `Type::Partie` (`R::Component` compte pour `Component`) ; null
 * pour `!classe`, `R::Recette`, `#id`, `*`. La pseudo-classe finale
 * (`:hover`) est ignorée.
 */
export function selectorElement(selector: string): string | null {
  const levels = selector.trim().split(/\s+/).filter((l) => l !== ">" && l !== ">>");
  let last = levels[levels.length - 1];
  const recipe = last?.match(/^R::([A-Za-z0-9_]+)/);
  if (recipe && RECIPE_SELECTED_BUILTINS.has(recipe[1]!)) last = last!.slice(3);
  if (!last || last.startsWith("R::")) return null;
  const m = /^([A-Z][A-Za-z0-9_]*(?:::[A-Za-z0-9_]+)?)/.exec(last);
  return m ? m[1]! : null;
}

export function extractFromCssLua(content: string): {
  keys: Set<string>;
  keysByElement: Map<string, Set<string>>;
  classes: Set<string>;
  fontScale: Set<string>;
} {
  const keys = new Set<string>();
  const keysByElement = new Map<string, Set<string>>();
  const classes = new Set<string>();
  const fontScale = new Set<string>();

  for (const rule of parseCssLuaRules(content)) {
    for (const k of rule.keys) keys.add(k);
    for (const one of rule.selector.split(",")) {
      const element = selectorElement(one);
      if (!element) continue;
      let set = keysByElement.get(element);
      if (!set) keysByElement.set(element, (set = new Set()));
      for (const k of rule.keys) set.add(k);
    }
  }

  for (const m of content.matchAll(BANG_CLASS_RE)) {
    classes.add(`!${m[1]}`);
  }

  for (const m of content.matchAll(FONT_SCALE_RE)) {
    fontScale.add(m[0]);
    classes.add(m[0]);
  }

  return { keys, keysByElement, classes, fontScale };
}

/**
 * À incrémenter à chaque changement du résultat de `buildStyleVocabulary` :
 * un vocabulaire en cache d’une version antérieure est reconstruit au démarrage.
 */
export const VOCABULARY_EXTRACTOR_VERSION = 2;

/** Vocabulaire produit par une version antérieure de l’extracteur. */
export function isVocabularyOutdated(vocabulary: StyleVocabulary): boolean {
  return vocabulary.extractorVersion !== VOCABULARY_EXTRACTOR_VERSION;
}

export function buildStyleVocabulary(
  files: { path: string; content: string }[],
): StyleVocabulary {
  const keys = new Set<string>();
  const byElement = new Map<string, Set<string>>();
  const classes = new Set<string>();
  const fontScale = new Set<string>();

  for (const file of files) {
    const extracted = extractFromCssLua(file.content);
    for (const k of extracted.keys) keys.add(k);
    for (const [element, set] of extracted.keysByElement) {
      const all = byElement.get(element) ?? new Set<string>();
      for (const k of set) all.add(k);
      byElement.set(element, all);
    }
    for (const c of extracted.classes) classes.add(c);
    for (const f of extracted.fontScale) fontScale.add(f);
  }

  return {
    generatedAt: new Date().toISOString(),
    extractorVersion: VOCABULARY_EXTRACTOR_VERSION,
    styleKeys: [...keys].sort(),
    keysByElement: Object.fromEntries(
      [...byElement.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([element, set]) => [element, [...set].sort()]),
    ),
    classes: [...classes].sort(),
    fontScaleClasses: [...fontScale].sort(),
    scannedFiles: files.length,
  };
}
