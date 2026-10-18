import { getActiveBaseStyles } from "../../gamestyle/activeBaseStyles";

/**
 * Styles du jeu d’un élément que le moteur dessine lui-même (barre de titre,
 * barres de défilement),
 * par sélecteurs exacts de builtin.css.lua, dans l’ordre d’ajout.
 */
export function engineElementStyle(selectors: string[]): Record<string, unknown> {
  const rules = getActiveBaseStyles()?.rules ?? [];
  const out: Record<string, unknown> = {};
  for (const r of rules) {
    if (selectors.includes(r.selector)) Object.assign(out, r.styleSheet);
  }
  return out;
}
