import { t } from "../i18n";
import { createButtonLabel } from "./factory";
import { findNode, insertNode, setNodeProp } from "./treeOps";
import type { TfuiProject, UiNode } from "./types";

/**
 * Titre d’un onglet : la TextView du slot `indicator` de `TabWidgetChild`
 * (TabWidgetChildParam n’a ni title ni text ; vanilla : TextView de classe
 * `font-scale-tab-widget-indicator`). Ce slot n’accepte aucun dépôt
 * (slots.ts) : le titre se règle ici, depuis l’inspecteur ou au double-clic.
 */
export const TAB_TITLE_CLASS = "font-scale-tab-widget-indicator";

/** TextView titre d’un onglet, ou null. */
export function tabTitleNode(tab: UiNode): UiNode | null {
  return (tab.slots.indicator ?? []).find((c) => c.type === "TextView" && !c.hidden) ?? null;
}

/** Texte du titre s’il est littéral ; "" sans titre ; null s’il vient d’un état ou de Lua. */
export function tabTitleText(tab: UiNode): string | null {
  const title = tabTitleNode(tab);
  if (!title) return (tab.slots.indicator ?? []).length > 0 ? null : "";
  const v = title.props.text;
  if (v === undefined) return "";
  return v.kind === "literal" && typeof v.value === "string" ? v.value : null;
}

/** TextView titre neuve (classe des onglets vanilla). */
export function createTabTitle(text: string = t("defaults.tabTitle")): UiNode {
  const title = createButtonLabel(text);
  title.meta.class = [TAB_TITLE_CLASS];
  return title;
}

/** Pose le titre d’un onglet : modifie sa TextView, ou la crée si l’onglet n’en a pas. */
export function setTabTitle(project: TfuiProject, tabId: string, text: string): TfuiProject {
  const loc = findNode(project, tabId);
  if (!loc || loc.node.type !== "TabWidgetChild") return project;
  const title = tabTitleNode(loc.node);
  if (title) return setNodeProp(project, title.id, "text", { kind: "literal", value: text });
  if ((loc.node.slots.indicator ?? []).length > 0) return project; // autre élément : on n’y touche pas
  return insertNode(project, loc.screenId, tabId, "indicator", createTabTitle(text));
}
