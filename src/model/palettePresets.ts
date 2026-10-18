/**
 * Éléments de la palette qui ne sont pas un composant brut mais un motif
 * vanilla : un type du catalogue + des classes posées à l’insertion.
 *
 * Espaceurs : `gui/main/gui_react_util.tl` du jeu, `makeHorizontalSpacer()` =
 * `builtin.Component{ meta = { class = "horizontal-spacer" } }` (idem
 * `vertical-spacer`) ; `gui/main/default.css.lua` leur donne
 * `gravity = { -1, 0 }` / `{ 0, -1 }`. Jamais une BoxLayout vide, dont la
 * gravity est ignorée en jeu.
 */
export interface PalettePreset {
  id: string;
  /** Type du nœud créé (doit exister dans le catalogue). */
  type: string;
  classes: string[];
  /** Catégorie de la palette (`CATEGORY` de `overrides.ts`). */
  category: string;
  /** Icône lucide (voir `ui/icons`). */
  icon: string;
}

export const PALETTE_PRESETS: PalettePreset[] = [
  {
    id: "HorizontalSpacer",
    type: "Component",
    classes: ["horizontal-spacer"],
    category: "layouts",
    icon: "MoveHorizontal",
  },
  {
    id: "VerticalSpacer",
    type: "Component",
    classes: ["vertical-spacer"],
    category: "layouts",
    icon: "MoveVertical",
  },
];

export function findPreset(id: string | undefined): PalettePreset | undefined {
  return id ? PALETTE_PRESETS.find((p) => p.id === id) : undefined;
}
