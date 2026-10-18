import { typeSelectorToken } from "../catalog/extractStyleVocabulary";
import type { Screen, StyleProps, StyleRule, TfuiProject, UiNode } from "./types";
import { t } from "../i18n";

/**
 * Style « par élément » : chaque nœud peut avoir une règle CSS qui lui est
 * propre (une par état). Elle est écrite dans le `.css.lua` de son écran (voir
 * `elementRuleSelectors`), et la classe `tfui-<id>` est ajoutée au nœud à la
 * génération. Le sélecteur n’est jamais saisi à la main.
 *
 * États : seuls ceux observés dans les `.css.lua` vanilla après une classe
 * (`R::WarehouseWindow !warehouse-bg:hover`, `…!buy-sfx:active`,
 * `R::Component!paradox-email:disabled`).
 */
export const STYLE_STATES = ["hover", "active", "disabled"] as const;
export type StyleState = (typeof STYLE_STATES)[number];

/** Libellés traduits, lus à chaque accès (langue courante). */
export const STYLE_STATE_LABELS: Record<StyleState | "normal", string> = {
  get normal() { return t("styleState.normal"); },
  get hover() { return t("styleState.hover"); },
  get active() { return t("styleState.active"); },
  get disabled() { return t("styleState.disabled"); },
};

export function isStyleState(value: unknown): value is StyleState {
  return (STYLE_STATES as readonly unknown[]).includes(value);
}

export function isElementRule(rule: StyleRule): boolean {
  return typeof rule.ownerNodeId === "string";
}

/** Classe CSS propre au nœud (stable : dérivée de son id). */
export function elementClassName(nodeId: string): string {
  return `tfui-${nodeId.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toLowerCase()}`;
}

function findInTree(node: UiNode, id: string): UiNode | null {
  if (node.id === id) return node;
  for (const children of Object.values(node.slots)) {
    for (const c of children) {
      const hit = findInTree(c, id);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Sélecteurs d’une règle d’élément : **type + classe unique, accolés**
 * (`TextView!tfui-<id>`), comme le vanilla (`Window!map-editor-window…`).
 * Pas de `R::<recette>` : le vanilla ne vise jamais l’intérieur d’une fenêtre
 * wrapper par `R::<fenêtre>`, et en jeu une couleur ainsi visée ne s’est pas
 * appliquée (2026-10-17) alors que `Window!<classe>` fonctionne. La classe
 * étant unique, la règle ne touche que ce nœud. Une fenêtre `expanded` prend
 * sa taille via `!window-expanded`, d’où une seconde forme.
 */
export function elementRuleSelectors(
  screen: Screen,
  nodeId: string,
  state?: StyleState,
): string[] {
  const node = findInTree(screen.root, nodeId);
  const pseudo = state ? `:${state}` : "";
  // `R::Component!…` : forme du vanilla, la seule qui vise un Component en jeu.
  const own = `${typeSelectorToken(node?.type ?? "")}!${elementClassName(nodeId)}`;
  const expanded = node?.props.expanded;
  const isExpandedWindow =
    node?.type === "Window" && expanded?.kind === "literal" && expanded.value === true;
  return isExpandedWindow
    ? [`${own}${pseudo}`, `${own}!window-expanded${pseudo}`]
    : [`${own}${pseudo}`];
}

/** Sélecteurs réellement émis pour une règle (dérivés pour une règle d’élément). */
export function emittedSelectors(rule: StyleRule, screen: Screen): string[] {
  return rule.ownerNodeId
    ? elementRuleSelectors(screen, rule.ownerNodeId, rule.state)
    : [rule.selector];
}

/** Classes nommées dans un sélecteur (`R::X Button!a!b` → a, b). */
export function selectorClasses(selector: string): string[] {
  return [...selector.matchAll(/!([A-Za-z0-9_-]+)/g)].map((m) => m[1]!);
}

/**
 * Sélecteur d’une nouvelle classe partagée : `!classe-1`, `!classe-2`… (nom
 * libre de collision). Une classe seule vise tout élément qui la porte, où
 * qu’il soit ; pas de `R::<fenêtre>` (ne touche rien en jeu).
 */
export function newSharedClassSelector(project: TfuiProject): string {
  const used = new Set(project.styleRules.flatMap((r) => selectorClasses(r.selector)));
  let n = 1;
  while (used.has(`classe-${n}`)) n++;
  return `!classe-${n}`;
}

export function sharedRules(project: TfuiProject): StyleRule[] {
  return project.styleRules.filter((r) => !isElementRule(r));
}

export function findElementRule(
  project: TfuiProject,
  nodeId: string,
  state: StyleState | null,
): StyleRule | undefined {
  return project.styleRules.find(
    (r) => r.ownerNodeId === nodeId && (r.state ?? null) === state,
  );
}

/** Ids des nœuds qui ont au moins une règle d’élément non vide. */
export function styledNodeIds(project: TfuiProject): Set<string> {
  const ids = new Set<string>();
  for (const r of project.styleRules) {
    if (r.ownerNodeId && Object.keys(r.props).length > 0) ids.add(r.ownerNodeId);
  }
  return ids;
}

/**
 * Pose (ou retire si `value === undefined`) une propriété dans la règle de
 * l’élément pour l’état donné. Crée la règle au besoin, la supprime si vide.
 */
export function setElementStyleValue(
  project: TfuiProject,
  nodeId: string,
  state: StyleState | null,
  key: string,
  value: unknown,
  createId: () => string,
): TfuiProject {
  const existing = findElementRule(project, nodeId, state);
  if (!existing) {
    if (value === undefined) return project;
    const rule: StyleRule = {
      id: createId(),
      selector: "",
      props: { [key]: value } as StyleProps,
      ownerNodeId: nodeId,
      ...(state ? { state } : {}),
    };
    return { ...project, styleRules: [...project.styleRules, rule] };
  }
  const props = { ...existing.props } as Record<string, unknown>;
  if (value === undefined) delete props[key];
  else props[key] = value;
  const styleRules =
    Object.keys(props).length === 0
      ? project.styleRules.filter((r) => r !== existing)
      : project.styleRules.map((r) =>
          r === existing ? { ...r, props: props as StyleProps } : r,
        );
  return { ...project, styleRules };
}

function collectIds(root: UiNode, into: Set<string>): void {
  into.add(root.id);
  for (const children of Object.values(root.slots)) {
    for (const c of children) collectIds(c, into);
  }
}

export function allNodeIds(project: TfuiProject): Set<string> {
  const ids = new Set<string>();
  for (const s of project.screens) collectIds(s.root, ids);
  return ids;
}

/** Retire les règles d’élément dont le nœud n’existe plus. */
export function pruneElementRules(project: TfuiProject): TfuiProject {
  if (!project.styleRules.some(isElementRule)) return project;
  const ids = allNodeIds(project);
  const kept = project.styleRules.filter(
    (r) => !r.ownerNodeId || ids.has(r.ownerNodeId),
  );
  return kept.length === project.styleRules.length
    ? project
    : { ...project, styleRules: kept };
}

/** Associe les ids d’un sous-arbre source à ceux de sa copie (même forme). */
export function mapSubtreeIds(
  source: UiNode,
  copy: UiNode,
  into = new Map<string, string>(),
): Map<string, string> {
  into.set(source.id, copy.id);
  for (const [slot, children] of Object.entries(source.slots)) {
    const copies = copy.slots[slot] ?? [];
    children.forEach((child, i) => {
      const twin = copies[i];
      if (twin && twin.type === child.type) mapSubtreeIds(child, twin, into);
    });
  }
  return into;
}

/** Duplique les règles d’élément des nœuds source vers leurs copies. */
export function cloneElementRules(
  project: TfuiProject,
  idMap: Map<string, string>,
  createId: () => string,
): TfuiProject {
  const clones: StyleRule[] = [];
  for (const r of project.styleRules) {
    const target = r.ownerNodeId ? idMap.get(r.ownerNodeId) : undefined;
    if (!target) continue;
    clones.push({ ...r, id: createId(), ownerNodeId: target, props: { ...r.props } });
  }
  return clones.length === 0
    ? project
    : { ...project, styleRules: [...project.styleRules, ...clones] };
}

function findFirstNew(root: UiNode, known: Set<string>, type: string): UiNode | null {
  if (!known.has(root.id) && root.type === type) return root;
  for (const children of Object.values(root.slots)) {
    for (const c of children) {
      const found = findFirstNew(c, known, type);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Après une copie (dupliquer, coller, dupliquer un écran) : donne au nouveau
 * sous-arbre les styles d’élément de `source`.
 */
export function copyElementRulesToNewSubtree(
  before: TfuiProject,
  after: TfuiProject,
  source: UiNode,
  createId: () => string,
): TfuiProject {
  const known = allNodeIds(before);
  for (const screen of after.screens) {
    const copy = findFirstNew(screen.root, known, source.type);
    if (copy) return cloneElementRules(after, mapSubtreeIds(source, copy), createId);
  }
  return after;
}

/**
 * Migration : l’ancien style inline (`meta.inlineStyle`) devient la règle
 * « Normal » de l’élément (fusion si elle existe déjà).
 */
export function migrateInlineStyles(
  project: TfuiProject,
  createId: () => string,
): TfuiProject {
  let next = project;
  let changed = false;
  const visit = (node: UiNode): UiNode => {
    let current = node;
    const inline = node.meta.inlineStyle;
    if (inline && Object.keys(inline).length > 0) {
      for (const [key, value] of Object.entries(inline)) {
        if (value === undefined) continue;
        if (findElementRule(next, node.id, null)?.props[key] !== undefined) continue;
        next = setElementStyleValue(next, node.id, null, key, value, createId);
      }
      const meta = { ...node.meta };
      delete meta.inlineStyle;
      current = { ...node, meta };
      changed = true;
    } else if (inline) {
      const meta = { ...node.meta };
      delete meta.inlineStyle;
      current = { ...node, meta };
      changed = true;
    }
    const slots: Record<string, UiNode[]> = {};
    let slotsChanged = false;
    for (const [slot, children] of Object.entries(current.slots)) {
      const mapped = children.map(visit);
      slots[slot] = mapped;
      if (mapped.some((c, i) => c !== children[i])) slotsChanged = true;
    }
    return slotsChanged ? { ...current, slots } : current;
  };
  const screens = project.screens.map((s) => {
    const root = visit(s.root);
    return root === s.root ? s : { ...s, root };
  });
  if (!changed) return project;
  return { ...next, screens };
}
