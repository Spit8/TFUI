import type { CatalogComponent, CatalogField } from "./types";

/**
 * Champs mal typés dans `builtin.d.tl`, corrigés d’après le code vanilla qui
 * tourne en jeu (règle : typedefs + code vanilla ; ici ils se contredisent et
 * c’est le code exécuté qui fait foi). Appliqué au chargement du catalogue
 * (`mergeHelperComponents`).
 */
export const FIELD_CORRECTIONS: Record<string, Record<string, Partial<CatalogField>>> = {
  FloatingLayoutChild: {
    // builtin.d.tl : `overflowMode : boolean` ; builtin.lua (CheckBox, l. 696)
    // passe `builtin.type.FloatingLayoutOverflowMode.Overflow`, enum déclaré
    // dans builtin.d.tl (None / Overflow / KeepInside).
    overflowMode: {
      tealType: "Type.FloatingLayoutOverflowMode",
      kind: "enum",
      enumName: "FloatingLayoutOverflowMode",
    },
  },
};

/** Composants avec les corrections de FIELD_CORRECTIONS appliquées. */
export function applyFieldCorrections(components: CatalogComponent[]): CatalogComponent[] {
  return components.map((c) => {
    const fixes = FIELD_CORRECTIONS[c.name];
    if (!fixes) return c;
    return { ...c, fields: c.fields.map((f) => (fixes[f.name] ? { ...f, ...fixes[f.name] } : f)) };
  });
}
