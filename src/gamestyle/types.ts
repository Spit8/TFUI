/**
 * Règles de style de base du jeu, telles que découpées par le vrai
 * `stylesheetutil.lua` (voir extractBaseStyles.ts). Lues depuis
 * l’installation au re-scan et mises en cache, jamais copiées dans le dépôt.
 */
export interface BaseStyleLevel {
  /** Type (`BoxLayout`), sous-élément (`Button::Layout`), `R::Recette`, `*`, ou absent. */
  element?: string;
  id?: string;
  classList: string[];
  pseudoClassList: string[];
  /** 0 = descendant, 1 = `>` (enfant direct), 2 = `>>`. */
  childCombinator: number;
}

export interface BaseStyleRule {
  /** Feuille d’origine (ex. `gui/main/builtin.css.lua`). */
  file: string;
  /** Rang global (ordre d’ajout, l’ordre fait foi pour la priorité). */
  order: number;
  /** Sélecteur reconstitué, pour l’affichage. */
  selector: string;
  levels: BaseStyleLevel[];
  styleSheet: Record<string, unknown>;
}

/** Couleur nommée de `gui/main/default_colors.gres.lua` (rgba en 0..1). */
export interface PaletteEntry {
  name: string;
  rgba: number[];
}

/** Niveau nommé de `gui/main/transparency.gres.lua`. */
export interface TransparencyEntry {
  name: string;
  alpha: number;
}

export interface GamePalette {
  colors: PaletteEntry[];
  transparency: TransparencyEntry[];
}

export interface BaseStyles {
  extractedAt: string;
  rules: BaseStyleRule[];
  /** Absente d’un cache antérieur : un re-scan la remplit. */
  palette?: GamePalette;
  /** Résolutions plein écran du menu Options du jeu (`settings_page.tl`). */
  resolutions?: { w: number; h: number }[];
}
