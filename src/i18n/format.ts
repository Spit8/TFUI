/**
 * Mise en forme d’un message : `{nom}` remplacé par le paramètre, et pluriel
 * `{n, plural, =0 {aucun} one {# fichier} other {# fichiers}}` (`#` = n, règle
 * de la langue via `Intl.PluralRules`). Sans dépendance.
 */
export type MessageParams = Record<string, string | number | null | undefined>;

/** Index de l’accolade fermante correspondant à `open`, -1 si absente. */
function matchBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function formatNumber(n: number, lang: string): string {
  try {
    return new Intl.NumberFormat(lang).format(n);
  } catch {
    return String(n);
  }
}

function pluralCategory(n: number, lang: string): string {
  try {
    return new Intl.PluralRules(lang).select(n);
  } catch {
    return n === 1 ? "one" : "other";
  }
}

/**
 * Branches d’un pluriel (`one {…} other {…}`) ; `rest` = texte restant non
 * analysé (mot-clé inconnu, accolade manquante…) : vide si la syntaxe est bonne.
 */
export function parsePluralBody(body: string): { options: Map<string, string>; rest: string } {
  const options = new Map<string, string>();
  let i = 0;
  while (i < body.length) {
    const m = /^\s*(=\d+|zero|one|two|few|many|other)\s*\{/.exec(body.slice(i));
    if (!m) break;
    const open = i + m[0].length - 1;
    const close = matchBrace(body, open);
    if (close < 0) break;
    options.set(m[1]!, body.slice(open + 1, close));
    i = close + 1;
  }
  return { options, rest: body.slice(i) };
}

function formatPlural(body: string, n: number, lang: string, params: MessageParams): string {
  const { options } = parsePluralBody(body);
  const chosen =
    options.get(`=${n}`) ?? options.get(pluralCategory(n, lang)) ?? options.get("other") ?? "";
  return formatMessage(chosen.replace(/#/g, formatNumber(n, lang)), params, lang);
}

export function formatMessage(template: string, params: MessageParams = {}, lang = "fr"): string {
  let out = "";
  let i = 0;
  while (i < template.length) {
    const open = template.indexOf("{", i);
    if (open < 0) {
      out += template.slice(i);
      break;
    }
    out += template.slice(i, open);
    const close = matchBrace(template, open);
    if (close < 0) {
      out += template.slice(open);
      break;
    }
    const inner = template.slice(open + 1, close);
    const plural = /^\s*(\w+)\s*,\s*plural\s*,([\s\S]*)$/.exec(inner);
    if (plural) {
      const n = Number(params[plural[1]!] ?? 0);
      out += formatPlural(plural[2]!, Number.isFinite(n) ? n : 0, lang, params);
    } else {
      const name = inner.trim();
      const value = params[name];
      out += value === undefined || value === null ? `{${name}}` : String(value);
    }
    i = close + 1;
  }
  return out;
}

/** Aplatit un JSON imbriqué en `{ "a.b.c": "texte" }` (chaînes seulement). */
export function flattenMessages(
  tree: unknown,
  prefix = "",
  into: Record<string, string> = {},
): Record<string, string> {
  if (typeof tree !== "object" || tree === null) return into;
  for (const [k, v] of Object.entries(tree as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") into[key] = v;
    else flattenMessages(v, key, into);
  }
  return into;
}
