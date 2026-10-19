/**
 * Contrôles des traductions (pur, sans I/O) : utilisés par le test
 * `i18n.coverage.test.ts` et par `npm run i18n:check`.
 */
import { formatMessage, parsePluralBody } from "./format";

/** Clés construites dynamiquement (`cmd.${id}`…) : jamais signalées inutilisées. */
export const DYNAMIC_KEY_PREFIXES = [
  "cmd.",
  "backend.",
  "catalog.category.",
  "catalog.notes.",
  // `palette.presets.<id>.name` / `.tooltip` (model/palettePresets.ts).
  "palette.presets.",
  "styleKey.",
  "previewSettings.hover",
  "previewSettings.boxOutline",
  "previewSettings.selectedOutline",
  "importDialog.minimum",
  "importDialog.ui",
  "importDialog.all",
  "_meta.",
];

/** Noms des paramètres d’un message : `{nom}` et `{n, plural, …}` (triés, uniques). */
export function placeholders(text: string): string[] {
  const names = new Set<string>();
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        const inner = text.slice(start, i);
        const name = /^\s*(\w+)\s*(,|$)/.exec(inner)?.[1];
        if (name) names.add(name);
        // Branches d’un pluriel (`one {# {b}}`) : le corps de chaque branche est
        // du texte, seuls les `{…}` qu’il contient sont des paramètres.
        const plural = /^\s*\w+\s*,\s*plural\s*,([\s\S]*)$/.exec(inner);
        const nested = plural ? [...parsePluralBody(plural[1]!).options.values()] : name ? [] : [inner];
        for (const body of nested) for (const n of placeholders(body)) names.add(n);
      }
    }
  }
  return [...names].sort();
}

export interface LocaleReport {
  /** Clés de la base absentes (le français s’affiche à la place). */
  missing: string[];
  /** Clés inconnues de la base (ignorées). */
  extra: string[];
  /** Paramètres différents de la base : le texte affiché serait faux. */
  badParams: { key: string; expected: string[]; got: string[] }[];
}

export function compareLocale(base: Record<string, string>, other: Record<string, string>): LocaleReport {
  const missing = Object.keys(base).filter((k) => !k.startsWith("_meta.") && !(k in other));
  const extra = Object.keys(other).filter((k) => !k.startsWith("_meta.") && !(k in base));
  const badParams: LocaleReport["badParams"] = [];
  for (const [k, v] of Object.entries(other)) {
    if (!(k in base)) continue;
    const expected = placeholders(base[k]!);
    const got = placeholders(v);
    if (expected.join(",") !== got.join(",")) badParams.push({ key: k, expected, got });
  }
  return { missing, extra, badParams };
}

/** Repères `[nom]` remplacés par un composant (`<Rich>`) : jamais traduits. */
export function bracketTokens(text: string): string[] {
  return [...new Set([...text.matchAll(/\[(\w+)\]/g)].map((m) => m[1]!))].sort();
}

/**
 * Défauts de syntaxe des pluriels : mot-clé inconnu (`singular`, `uno`…),
 * branche `other` absente, texte parasite entre les branches.
 */
export function pluralSyntaxErrors(text: string): string[] {
  const errors: string[] = [];
  const walk = (t: string) => {
    let depth = 0;
    let start = -1;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === "{") {
        if (depth === 0) start = i + 1;
        depth++;
      } else if (t[i] === "}" && --depth === 0 && start >= 0) {
        const inner = t.slice(start, i);
        const head = /^\s*\w+\s*,\s*(\w+)\s*,([\s\S]*)$/.exec(inner);
        if (head && head[1] !== "plural") errors.push(`« ${head[1]} » au lieu de « plural »`);
        else if (head) {
          const { options, rest } = parsePluralBody(head[2]!);
          if (rest.trim()) errors.push(`branche illisible : « ${rest.trim().slice(0, 30)} »`);
          if (!options.has("other")) errors.push("branche « other » absente");
          for (const body of options.values()) walk(body);
        } else walk(inner);
      }
    }
    if (depth !== 0) errors.push("accolades déséquilibrées");
  };
  walk(text);
  return errors;
}

const PLURAL_HEAD = (name: string) => new RegExp(String.raw`\{\s*${name}\s*,\s*plural`);

/** Accolades restées dans le texte affiché (syntaxe non reconnue par `formatMessage`). */
function renderedBraces(text: string, lang: string): number {
  let worst = 0;
  for (const n of [0, 1, 2, 5, 22]) {
    const params: Record<string, string | number> = {};
    for (const name of placeholders(text)) params[name] = PLURAL_HEAD(name).test(text) ? n : "x";
    const out = formatMessage(text, params, lang);
    worst = Math.max(worst, (out.match(/[{}]/g) ?? []).length);
  }
  return worst;
}

/**
 * Restes de réponse d’IA ou d’explication de traducteur collés dans une valeur
 * (listes de synonymes, « Here are… », « Dependiendo del contexto »…).
 */
const JUNK_PATTERNS: RegExp[] = [
  /\*\*/,
  /^\s*[-*•]\s/m,
  /\b(?:here are|here is|translated as|depending on the context|as an ai)\b/i,
  /\b(?:por favor,? proporciona|puede tener varios significados|dependiendo del contexto|traducci[oó]n:)/i,
  /\b(?:hier sind|je nach kontext|übersetzung:)/i,
  /\b(?:ecco alcune|a seconda del contesto|traduzione:)/i,
  /以下是|翻译[:：]|根据上下文/,
];

/** Indices d’un texte français (lettres accentuées, mots-outils). */
const FRENCH_HINT = /[éèàùçêâœ]|\b(?:le|la|les|du|des|un|une|est|pour|dans|aucun)\b/i;

export type QualityKind = "plural" | "tokens" | "extraLines" | "junk" | "untranslated" | "tooLong";

export interface QualityIssue {
  key: string;
  kind: QualityKind;
  detail: string;
}

/**
 * Défauts de qualité d’une langue par rapport à la base française : pluriels
 * cassés, repères `[…]` traduits, lignes en trop, texte parasite, valeur
 * restée en français, longueur aberrante.
 */
export function qualityIssues(base: Record<string, string>, other: Record<string, string>, lang: string): QualityIssue[] {
  const issues: QualityIssue[] = [];
  for (const [key, text] of Object.entries(other)) {
    const ref = base[key];
    if (ref === undefined || key.startsWith("_meta.")) continue;
    for (const e of pluralSyntaxErrors(text)) issues.push({ key, kind: "plural", detail: e });
    const braces = renderedBraces(text, lang);
    if (braces > renderedBraces(ref, "fr")) issues.push({ key, kind: "plural", detail: "accolades visibles à l’écran" });
    const want = bracketTokens(ref);
    const got = bracketTokens(text);
    if (want.join(",") !== got.join(",")) {
      issues.push({ key, kind: "tokens", detail: `attendu [${want.join("], [")}] — reçu [${got.join("], [")}]` });
    }
    const lines = (s: string) => s.split("\n").length;
    if (lines(text) > lines(ref)) issues.push({ key, kind: "extraLines", detail: `${lines(ref)} → ${lines(text)} lignes` });
    if (JUNK_PATTERNS.some((re) => re.test(text) && !re.test(ref))) {
      issues.push({ key, kind: "junk", detail: text.slice(0, 60).replace(/\n/g, " ") });
    }
    if (lang !== "fr" && text === ref && ref.split(/\s+/).length >= 3 && FRENCH_HINT.test(ref)) {
      issues.push({ key, kind: "untranslated", detail: ref.slice(0, 60) });
    }
    if (ref.length > 12 && text.length > 3.5 * ref.length) {
      issues.push({ key, kind: "tooLong", detail: `${ref.length} → ${text.length} caractères` });
    }
  }
  return issues;
}

/** Clés de la base qui n’apparaissent dans aucune source (hors clés dynamiques). */
export function unusedKeys(base: Record<string, string>, sources: string[]): string[] {
  const text = sources.join("\n");
  return Object.keys(base).filter(
    (k) => !DYNAMIC_KEY_PREFIXES.some((p) => k.startsWith(p)) && !text.includes(`"${k}"`),
  );
}

/**
 * Textes français restés en dur dans un composant : texte JSX ou attribut
 * `title` / `placeholder` / `aria-label` / `label` littéral contenant une
 * lettre accentuée. Renvoie les lignes fautives.
 */
export function hardcodedFrench(source: string): string[] {
  const accent = /[àâçéèêëîïôûùœÀÂÇÉÈÊÎÔÛÙ’«»]/;
  const out: string[] = [];
  const lines = source.split(/\r?\n/);
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
    const attr = /\b(?:title|placeholder|aria-label|label)="([^"]*)"/.exec(line);
    const jsxText = />([^<>{}]+)</.exec(line);
    const bare = /^[^<>{}=;()"'`]+$/.test(trimmed) && !/^[\w.]+[,;]?$/.test(trimmed);
    if ((attr && accent.test(attr[1]!)) || (jsxText && accent.test(jsxText[1]!)) || (bare && accent.test(trimmed))) {
      out.push(`${i + 1}: ${trimmed}`);
    }
  });
  return out;
}
