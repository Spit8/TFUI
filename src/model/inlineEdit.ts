import type { UiNode } from "./types";

/** Ce que modifie un double-clic dans l’aperçu. */
export type InlineEditTarget =
  | { mode: "text"; nodeId: string; prop: string; value: string }
  | { mode: "name"; nodeId: string; value: string };

const TEXT_TYPES = new Set(["TextView", "RichTextView"]);
/** Boutons dont le libellé est une prop `text` (pas un enfant TextView). */
const TEXT_PROP_BUTTONS = new Set(["TextButton", "ToolButton"]);
const BUTTON_TYPES = new Set(["Button", "ToggleButton"]);

/** Texte modifiable en direct : absent ou chaîne littérale (pas état / Lua). */
function literalText(node: UiNode, prop: string): string | null {
  const v = node.props[prop];
  if (v === undefined) return "";
  return v.kind === "literal" && typeof v.value === "string" ? v.value : null;
}

function textViewsIn(node: UiNode): UiNode[] {
  const out: UiNode[] = [];
  for (const children of Object.values(node.slots)) {
    for (const c of children) {
      if (c.hidden) continue;
      if (TEXT_TYPES.has(c.type)) out.push(c);
      else out.push(...textViewsIn(c));
    }
  }
  return out;
}

/**
 * Cible du double-clic : titre d’une fenêtre, texte affiché d’un TextView ou
 * d’un bouton (son unique TextView, ou sa prop `text`) ; sinon le nom.
 */
export function inlineEditTarget(node: UiNode): InlineEditTarget {
  const byName: InlineEditTarget = { mode: "name", nodeId: node.id, value: node.name ?? node.type };
  if (node.type === "Window") {
    const title = literalText(node, "title");
    return title === null ? byName : { mode: "text", nodeId: node.id, prop: "title", value: title };
  }
  if (TEXT_TYPES.has(node.type) || TEXT_PROP_BUTTONS.has(node.type)) {
    const text = literalText(node, "text");
    return text === null ? byName : { mode: "text", nodeId: node.id, prop: "text", value: text };
  }
  if (BUTTON_TYPES.has(node.type)) {
    const texts = textViewsIn(node);
    if (texts.length === 1) {
      const text = literalText(texts[0]!, "text");
      if (text !== null) return { mode: "text", nodeId: texts[0]!.id, prop: "text", value: text };
    }
  }
  if (node.type === "TabWidgetChild") {
    // Titre de l’onglet : la TextView de son `indicator`.
    const title = (node.slots.indicator ?? []).find((c) => TEXT_TYPES.has(c.type) && !c.hidden);
    const text = title ? literalText(title, "text") : null;
    if (title && text !== null) return { mode: "text", nodeId: title.id, prop: "text", value: text };
  }
  return byName;
}
