import { parseGameResolutions } from "../preview/screenRatio";
import { STYLE_PRELUDE } from "./stylePrelude";
import type { BaseStyleRule, BaseStyles, GamePalette } from "./types";
import { t } from "../i18n";

/**
 * Feuilles de style de base du jeu, dans l’ordre d’application supposé
 * (alphabétique, comme le chargement des `.css.lua` d’un dossier ; l’ordre
 * réel du moteur n’est pas documenté).
 */
export const BASE_STYLE_SHEETS = [
  "gui/main/builtin.css.lua",
  "gui/main/default.css.lua",
  "gui/main/font_scaling.css.lua",
] as const;

/** Fichiers lus pour exécuter les feuilles : `[archive, chemin]`. */
export const BASE_STYLE_FILES: ReadonlyArray<readonly [string, string]> = [
  ...BASE_STYLE_SHEETS.map((p) => ["gui.zip", p] as const),
  ["gui.zip", "gui/main/stylesheetutil.lua"],
  ["gui.zip", "gui/main/color_internal.lua"],
  ["gui.zip", "gui/main/default_colors.gres.lua"],
  ["gui.zip", "gui/main/transparency.gres.lua"],
  ["gui.zip", "gui/menu/map_preview_colors.gres.lua"],
  ["gui.zip", "gui/sound/gui_comp_sfx.gres.lua"],
  ["scripts.zip", "scripts/mathutil.lua"],
];

/** Menu Options du jeu : déclare les résolutions plein écran. */
export const SETTINGS_PAGE = "gui/menu/settings_page.tl";

export type ReadGameFile = (zip: string, path: string) => Promise<string | null>;

interface SheetResult {
  error?: string;
  rules?: Omit<BaseStyleRule, "file">[];
  issues?: string[];
}

/**
 * Exécute les feuilles de base du jeu avec le vrai `stylesheetutil.lua` et
 * renvoie leurs règles déjà découpées en niveaux. Lève une erreur (message en
 * français) si une feuille échoue.
 */
export async function extractBaseStyles(read: ReadGameFile, wasmUrl?: string): Promise<BaseStyles> {
  const files: Record<string, string> = {};
  for (const [zip, path] of BASE_STYLE_FILES) {
    const content = await read(zip, path);
    if (content != null) files[path] = content;
  }

  const { LuaFactory } = await import("wasmoon");
  const lua = await new LuaFactory(wasmUrl).createEngine();
  const rules: BaseStyleRule[] = [];
  let palette: GamePalette | undefined;
  try {
    lua.global.set("__readFile", (path: string) => files[path] ?? null);
    await lua.doString(STYLE_PRELUDE);
    const run = lua.global.get("__tfuiRunStyleSheet") as (path: string) => string;
    for (const sheet of BASE_STYLE_SHEETS) {
      if (files[sheet] == null) throw new Error(t("catalogErrors.sheetNotFound", { sheet }));
      const result = JSON.parse(run(sheet)) as SheetResult;
      if (result.error) throw new Error(t("catalogErrors.sheetFailed", { sheet, error: result.error }));
      for (const r of result.rules ?? []) {
        // Une table Lua vide est sérialisée en `[]`.
        const styleSheet = Array.isArray(r.styleSheet) ? {} : r.styleSheet;
        rules.push({ ...r, styleSheet, file: sheet, levels: r.levels.map(cleanLevel) });
      }
    }
    const rawPalette = JSON.parse((lua.global.get("__tfuiPalette") as () => string)()) as
      | (GamePalette & { error?: undefined })
      | { error: string };
    if (rawPalette.error !== undefined) throw new Error(t("catalogErrors.paletteFailed", { error: rawPalette.error }));
    palette = sortPalette(rawPalette as GamePalette);
  } finally {
    lua.global.close();
  }
  // Liste des résolutions du menu Options (fichier Teal, lu comme texte).
  const settingsPage = await read("gui.zip", SETTINGS_PAGE).catch(() => null);
  const resolutions = settingsPage ? parseGameResolutions(settingsPage) : [];
  return {
    extractedAt: new Date().toISOString(),
    rules,
    palette,
    ...(resolutions.length > 0 ? { resolutions } : {}),
  };
}

function cleanLevel(l: BaseStyleRule["levels"][number]): BaseStyleRule["levels"][number] {
  const out: BaseStyleRule["levels"][number] = {
    classList: l.classList ?? [],
    pseudoClassList: l.pseudoClassList ?? [],
    childCombinator: l.childCombinator ?? 0,
  };
  if (l.element) out.element = l.element;
  if (l.id) out.id = l.id;
  return out;
}

/** Groupes affichés par le sélecteur, dans l’ordre du fichier du jeu. */
export const PALETTE_GROUPS = ["Neutral", "Base", "Accent"] as const;

const BRIGHTNESS = ["Darkest", "VeryDark", "Dark", "DarkMedium", "Medium", "LightMedium", "Light", "VeryLight", "Lightest"];

/** Trie par groupe (Neutral, Base, Accent, puis couleurs « jeu ») et du sombre au clair. */
function sortPalette(p: GamePalette): GamePalette {
  const group = (n: string) => {
    const i = PALETTE_GROUPS.findIndex((g) => n.startsWith(g));
    return i < 0 ? PALETTE_GROUPS.length : i;
  };
  const shade = (n: string) => {
    const i = BRIGHTNESS.indexOf(n.replace(/^(Neutral|Base|Accent)/, ""));
    return i < 0 ? 99 : i;
  };
  const colors = [...p.colors].sort(
    (a, b) => group(a.name) - group(b.name) || shade(a.name) - shade(b.name) || a.name.localeCompare(b.name),
  );
  const transparency = [...p.transparency].sort((a, b) => b.alpha - a.alpha);
  return { colors, transparency };
}
