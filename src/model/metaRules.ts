import type { PropValue, UiNode } from "./types";

/**
 * `meta.enabled` vaut `true` par défaut : un `true` littéral n’est pas émis.
 * (Toute clé `meta` émise autre que `class` fait envelopper le nœud, voir
 * `wrappingMetaKeys`.)
 */
export function isDefaultEnabled(value: PropValue | undefined): boolean {
  return (
    value === undefined || (value.kind === "literal" && value.value === true)
  );
}

function isTrue(value: PropValue | undefined): boolean {
  return value?.kind === "literal" && value.value === true;
}

/**
 * Une Window fermable sans `onClose` : le bouton de fermeture ne fait rien
 * (le vanilla passe toujours un onClose qui agit). Le générateur ajoute alors
 * `api.gui.byId.setVisible(id, false)` — motif éprouvé en jeu, qui garde la
 * fenêtre (et sa position) pour la réouverture par
 * `addSingletonWindow` + `setVisible(id, true)`. Nécessite l’identifiant.
 */
export function needsDefaultOnClose(node: UiNode): boolean {
  return (
    node.type === "Window" &&
    isTrue(node.props.closable) &&
    node.props.onClose === undefined &&
    Boolean(node.meta.id)
  );
}

/** Window fermable sans onClose ni identifiant : impossible à fermer. */
export function closeButtonInert(node: UiNode): boolean {
  return (
    node.type === "Window" &&
    isTrue(node.props.closable) &&
    node.props.onClose === undefined &&
    !node.meta.id
  );
}

/**
 * Clés `meta` qui font envelopper le nœud dans `builtin.WithComponentParams`
 * par `react.lua` du jeu (tout sauf `class`, `localKey`,
 * `discardNodeIdentity`). Sur la racine d’une recette wrapper
 * (`RegisterWrapperRecipe(…, builtin.Window, …)`), cette enveloppe provoque
 * « Wrapper recipe must return child » puis un crash du jeu.
 *
 * `meta.id` d’une Window est émis comme prop `id` (pas dans `meta`).
 */
export function wrappingMetaKeys(node: UiNode): string[] {
  const keys: string[] = [];
  const meta = node.meta;
  if (meta.id && node.type !== "Window") keys.push("id");
  if (meta.tooltip) keys.push("tooltip");
  if (!isDefaultEnabled(meta.enabled)) keys.push("enabled");
  if (meta.inlineStyle && Object.keys(meta.inlineStyle).length > 0) {
    keys.push("styleSheet");
  }
  return keys;
}
