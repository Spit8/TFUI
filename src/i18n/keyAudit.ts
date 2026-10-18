/**
 * Contrôles des traductions (pur, sans I/O) : utilisés par le test
 * `i18n.coverage.test.ts` et par `npm run i18n:check`.
 */

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
        // Branches d’un pluriel (`one {# {b}}`) : paramètres imbriqués.
        const plural = /^\s*\w+\s*,\s*plural\s*,([\s\S]*)$/.exec(inner);
        const nested = plural ? plural[1]! : name ? "" : inner;
        for (const n of placeholders(nested)) names.add(n);
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
