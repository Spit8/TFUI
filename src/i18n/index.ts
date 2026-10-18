import { create } from "zustand";
import fr from "./locales/fr.json";
import { flattenMessages, formatMessage, type MessageParams } from "./format";

export type { MessageParams } from "./format";

/** Chemins des feuilles du JSON de base (`menu.file`…), hors `_meta`. */
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends object
      ? Leaves<T[K], `${P}${K}.`>
      : never;
}[keyof T & string];

/** Clé de traduction : refusée par TypeScript si absente de `fr.json`. */
export type TKey = Exclude<Leaves<typeof fr>, `_meta.${string}`>;

export const BASE_LANGUAGE = "fr";

export interface LanguageInfo {
  code: string;
  /** Nom affiché (`_meta.name` du fichier). */
  name: string;
  /** `bundled` : livré avec l’éditeur ; `user` : dossier des langues. */
  source: "bundled" | "user";
}

/**
 * Langues livrées : `src/i18n/locales/*.json`. `import.meta.glob` n’existe que sous
 * Vite/Vitest (remplacé à la compilation) ; hors de Vite (outils `tools/*.ts` lancés
 * par tsx), l’appel lève une TypeError et seule la langue de base est chargée.
 */
let bundledFiles: Record<string, unknown>;
try {
  bundledFiles = import.meta.glob("./locales/*.json", { eager: true, import: "default" });
} catch {
  bundledFiles = { [`./locales/${BASE_LANGUAGE}.json`]: fr };
}
const bundled: Record<string, Record<string, string>> = {};
for (const [path, json] of Object.entries(bundledFiles)) {
  const code = path.replace(/^.*\/([^/]+)\.json$/, "$1");
  bundled[code] = flattenMessages(json);
}

/** Langues du dossier utilisateur (ajout ou correction, clé par clé). */
let user: Record<string, Record<string, string>> = {};

function compose(lang: string): Record<string, string> {
  return {
    ...bundled[BASE_LANGUAGE],
    ...user[BASE_LANGUAGE],
    ...(lang === BASE_LANGUAGE ? {} : bundled[lang]),
    ...(lang === BASE_LANGUAGE ? {} : user[lang]),
  };
}

interface I18nState {
  language: string;
  messages: Record<string, string>;
}

/** Langue courante ; les composants qui lisent `useT()` se re-rendent au changement. */
export const useI18nStore = create<I18nState>(() => ({
  language: BASE_LANGUAGE,
  messages: compose(BASE_LANGUAGE),
}));

const warned = new Set<string>();

/** Texte traduit (langue courante → français → clé brute). */
export function t(key: TKey, params?: MessageParams): string {
  return translateKey(key, params);
}

/** Variante non typée (clé construite : `validate.${code}`, codes du backend…). */
export function translateKey(key: string, params?: MessageParams): string {
  const { language, messages } = useI18nStore.getState();
  const template = messages[key];
  if (template === undefined) {
    if (import.meta.env?.DEV && !warned.has(key)) {
      warned.add(key);
      console.warn(`[i18n] clé absente : ${key}`);
    }
    return key;
  }
  return formatMessage(template, params, language);
}

export function hasKey(key: string): boolean {
  return key in useI18nStore.getState().messages;
}

/** `t` pour les composants React (re-rendu au changement de langue). */
export function useT(): typeof t {
  useI18nStore((s) => s.messages);
  return t;
}

export function currentLanguage(): string {
  return useI18nStore.getState().language;
}

function displayName(messages: Record<string, string> | undefined, code: string): string {
  return messages?.["_meta.name"] ?? code;
}

export function availableLanguages(): LanguageInfo[] {
  const codes = new Map<string, LanguageInfo>();
  for (const code of Object.keys(bundled)) {
    codes.set(code, { code, name: displayName(bundled[code], code), source: "bundled" });
  }
  for (const code of Object.keys(user)) {
    if (!codes.has(code)) codes.set(code, { code, name: displayName(user[code], code), source: "user" });
  }
  return [...codes.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** `system` : langue du système si disponible, sinon le français. */
export function resolveLanguage(setting: string): string {
  const available = new Set(availableLanguages().map((l) => l.code));
  if (setting !== "system") return available.has(setting) ? setting : BASE_LANGUAGE;
  const wanted = typeof navigator !== "undefined" ? (navigator.languages ?? [navigator.language]) : [];
  for (const tag of wanted) {
    if (!tag) continue;
    if (available.has(tag)) return tag;
    const short = tag.split("-")[0]!;
    if (available.has(short)) return short;
  }
  return BASE_LANGUAGE;
}

export function setLanguage(setting: string): void {
  const language = resolveLanguage(setting);
  useI18nStore.setState({ language, messages: compose(language) });
  if (typeof document !== "undefined") document.documentElement.lang = language;
}

/** Fichiers du dossier des langues : `{ code: contenu JSON }` (invalides ignorés). */
export function setUserLocales(files: Record<string, string>): string[] {
  const errors: string[] = [];
  const next: Record<string, Record<string, string>> = {};
  for (const [code, text] of Object.entries(files)) {
    try {
      next[code] = flattenMessages(JSON.parse(text));
    } catch (error) {
      errors.push(`${code}.json : ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  user = next;
  const { language } = useI18nStore.getState();
  useI18nStore.setState({ messages: compose(language) });
  return errors;
}

/** Contenu de la langue de base, pour servir de modèle aux traducteurs. */
export function baseLocaleJson(): string {
  return `${JSON.stringify(fr, null, 2)}\n`;
}

/** Comparaison alphabétique selon la langue de l’interface. */
export function collator(options?: Intl.CollatorOptions): Intl.Collator {
  try {
    return new Intl.Collator(currentLanguage(), options);
  } catch {
    return new Intl.Collator(BASE_LANGUAGE, options);
  }
}
