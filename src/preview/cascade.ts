import { RECIPE_SELECTED_BUILTINS } from "../catalog/extractStyleVocabulary";
import {
  isElementRule,
  isStyleState,
  STYLE_STATES,
  type StyleState,
} from "../model/elementStyle";
import { getActiveBaseStyleIndex } from "../gamestyle/activeBaseStyles";
import { engineDefaultClasses, matchingBaseRules } from "../gamestyle/matchBaseRule";
import type {
  Screen,
  StyleProps,
  StyleRule,
  TfuiProject,
  UiNode,
} from "../model/types";
import { t } from "../i18n";

export type SelectorPart =
  | { kind: "recipe"; name: string }
  /** `recipeForm` : écrit `R::Component` (voir `RECIPE_SELECTED_BUILTINS`). */
  | { kind: "type"; name: string; recipeForm?: boolean }
  | { kind: "class"; name: string };

/** Parse one whitespace-free token into selector parts. */
function parseToken(token: string): SelectorPart[] {
  const parts: SelectorPart[] = [];
  let rest = token;
  const recipe = rest.match(/^R::([A-Za-z0-9_]+)/);
  if (recipe) {
    // `R::Component` vise le builtin Component, pas une recette du mod.
    parts.push(
      RECIPE_SELECTED_BUILTINS.has(recipe[1]!)
        ? { kind: "type", name: recipe[1]!, recipeForm: true }
        : { kind: "recipe", name: recipe[1]! },
    );
    rest = rest.slice(recipe[0].length);
  }
  while (rest.length > 0) {
    if (rest.startsWith("!")) {
      const m = rest.match(/^!([A-Za-z0-9_-]+)/);
      if (!m) break;
      parts.push({ kind: "class", name: m[1] });
      rest = rest.slice(m[0].length);
      continue;
    }
    const m = rest.match(/^([A-Za-z][A-Za-z0-9_]*)/);
    if (!m) break;
    parts.push({ kind: "type", name: m[1] });
    rest = rest.slice(m[0].length);
  }
  return parts;
}

/**
 * Découpe un sélecteur TF3 en niveaux, comme `stylesheetutil.lua` du jeu :
 * **chaque espace sépare un niveau descendant**. `BoxLayout !x` désigne un
 * élément de classe `x` *à l’intérieur* d’un BoxLayout ; le BoxLayout qui
 * porte la classe s’écrit `BoxLayout!x`.
 */
export function parseSelector(selector: string): SelectorPart[][] {
  return selector
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(parseToken)
    .filter((parts) => parts.length > 0);
}

/**
 * Classes posées par le moteur : une Window `expanded = true` reçoit
 * `!window-expanded` (commentaire de `WindowParam.expanded`, builtin.d.tl).
 */
export function implicitClasses(node: UiNode): string[] {
  if (node.type === "Window") {
    const expanded = node.props.expanded;
    return expanded?.kind === "literal" && expanded.value === true ? ["window-expanded"] : [];
  }
  // builtin.css.lua cible `Slider!horizontal` / `Slider!vertical` : classe
  // posée par le moteur selon la prop `horizontal` (vraie par défaut).
  if (node.type === "Slider") {
    const h = node.props.horizontal;
    return [h?.kind === "literal" && h.value === false ? "vertical" : "horizontal"];
  }
  return [];
}

/** Classes vues par les sélecteurs : `meta.class` + classes implicites. */
export function nodeClasses(node: UiNode): string[] {
  return [...(node.meta.class ?? []), ...implicitClasses(node)];
}

/** Classes vues par les règles de base du jeu : + classes par défaut du moteur. */
export function baseNodeClasses(node: UiNode): string[] {
  const classes = nodeClasses(node);
  return [...classes, ...engineDefaultClasses(node.type, classes)];
}

/**
 * Style de texte du jeu pour un texte que le moteur dessine lui-même (titre
 * de fenêtre…) : TextView virtuel de classes `classes` sous `chain`.
 */
export function gameTextStyle(screen: Screen, chain: UiNode[], classes: string[]): StyleProps {
  const index = getActiveBaseStyleIndex();
  if (!index) return {};
  const virtual: UiNode = { id: "__virtual-text", type: "TextView", props: {}, meta: { class: classes }, slots: {} };
  const out: Record<string, unknown> = {};
  for (const r of matchingBaseRules(index, { screen, chain: [...chain, virtual], state: null }, baseNodeClasses)) {
    Object.assign(out, r.styleSheet);
  }
  return out as StyleProps;
}

export interface SelectorAnalysis {
  /** Sélecteur sans l’état final (`:hover`…). */
  base: string;
  /** État final reconnu, s’il y en a un. */
  state: StyleState | null;
  /** L’aperçu sait-il simuler ce sélecteur ? */
  simulated: boolean;
  /** Raison lisible quand il n’est pas simulé. */
  reason?: string;
  /**
   * Sous-partie visée en dernier niveau (`… Window::Content`) : la règle ne
   * s’applique à aucun nœud, mais à cette partie de l’élément visé par le
   * reste du sélecteur (`prefix`).
   */
  part?: typeof WINDOW_CONTENT_PART;
  /** Sélecteur sans la sous-partie finale (si `part`). */
  prefix?: string;
}

/** Seule sous-partie simulée : la zone de contenu d’une fenêtre (motif vanilla). */
export const WINDOW_CONTENT_PART = "Window::Content";

/**
 * Sépare l’état final et repère la syntaxe que l’aperçu ne simule pas
 * (`#id`, `Type::Partie`, `>`, `*`, listes `,`, autre pseudo-état). Un tel
 * sélecteur ne s’applique à rien dans l’aperçu (il reste émis tel quel).
 */
export function analyzeSelector(selector: string): SelectorAnalysis {
  const trimmed = selector.trim();
  let base = trimmed;
  let state: StyleState | null = null;
  const m = trimmed.match(/:([a-z]+)$/);
  if (m && trimmed[trimmed.length - m[0].length - 1] !== ":") {
    if (isStyleState(m[1])) {
      state = m[1];
      base = trimmed.slice(0, -m[0].length);
    }
  }
  // `<sélecteur de fenêtre> Window::Content` : le reste doit être simulable.
  const levels = base.trim().split(/\s+/);
  let part: SelectorAnalysis["part"];
  let prefix: string | undefined;
  if (levels.length > 1 && levels[levels.length - 1] === WINDOW_CONTENT_PART) {
    part = WINDOW_CONTENT_PART;
    prefix = levels.slice(0, -1).join(" ");
  }
  const withoutRecipes = (prefix ?? base).replace(/R::[A-Za-z0-9_]+/g, "R");
  if (withoutRecipes.includes("#")) {
    return { base, state, simulated: false, reason: t("cascade.idNotSimulated") };
  }
  if (withoutRecipes.includes("::")) {
    return { base, state, simulated: false, reason: t("cascade.subPartNotSimulated") };
  }
  if (/[>*,]/.test(withoutRecipes)) {
    return { base, state, simulated: false, reason: t("cascade.combinatorNotSimulated") };
  }
  if (withoutRecipes.includes(":")) {
    return { base, state, simulated: false, reason: t("cascade.pseudoNotSimulated") };
  }
  if (base.length === 0) {
    return { base, state, simulated: false, reason: t("cascade.emptySelector") };
  }
  return part ? { base, state, simulated: true, part, prefix } : { base, state, simulated: true };
}

function nodeMatchesCompound(
  node: UiNode,
  recipeName: string,
  compound: SelectorPart[],
): boolean {
  for (const part of compound) {
    if (part.kind === "recipe" && part.name !== recipeName) return false;
    if (part.kind === "type" && node.type !== part.name) return false;
    // `Component!x` ne vise rien en jeu (seul `R::Component!x` s’applique).
    if (part.kind === "type" && RECIPE_SELECTED_BUILTINS.has(part.name) && !part.recipeForm) return false;
    if (part.kind === "class") {
      const classes = nodeClasses(node);
      if (!classes.includes(part.name)) return false;
    }
  }
  return true;
}

/** Ancestor chain from root to node (inclusive), or null if not found. */
export function findAncestorChain(
  root: UiNode,
  nodeId: string,
): UiNode[] | null {
  if (root.id === nodeId) return [root];
  for (const children of Object.values(root.slots)) {
    for (const child of children) {
      const chain = findAncestorChain(child, nodeId);
      if (chain) return [root, ...chain];
    }
  }
  return null;
}

/** Élément de la chaîne d’ancêtres : un nœud, et/ou le nœud de la recette. */
interface ChainItem {
  node: UiNode | null;
  isRecipe: boolean;
}

/**
 * Chaîne vue par les sélecteurs. Un niveau `R::<fenêtre wrapper>` ne touche
 * rien : le vanilla ne l’emploie jamais, et en jeu une couleur visée ainsi ne
 * s’est pas appliquée (2026-10-17). Les autres recettes (plugin…) ont leur
 * nœud au-dessus de la racine.
 */
function selectorChain(screen: Screen, chain: UiNode[]): ChainItem[] {
  if (screen.kind === "window") {
    return chain.map((node) => ({ node, isRecipe: false }));
  }
  return [
    { node: null, isRecipe: true },
    ...chain.map((node) => ({ node, isRecipe: false })),
  ];
}

function itemMatches(
  item: ChainItem,
  recipeName: string,
  compound: SelectorPart[],
): boolean {
  for (const part of compound) {
    if (part.kind === "recipe") {
      if (!item.isRecipe || part.name !== recipeName) return false;
    } else if (!item.node) {
      return false;
    }
  }
  const typeAndClass = compound.filter((p) => p.kind !== "recipe");
  return typeAndClass.length === 0 || nodeMatchesCompound(item.node!, recipeName, typeAndClass);
}

function selectorMatchesChain(
  selector: string,
  screen: Screen,
  chain: UiNode[],
): boolean {
  const compounds = parseSelector(selector);
  if (compounds.length === 0) return false;
  const items = selectorChain(screen, chain);
  // Le dernier niveau désigne l’élément lui-même…
  const last = compounds[compounds.length - 1]!;
  if (!itemMatches(items[items.length - 1]!, screen.recipeName, last)) return false;
  // … les précédents, des ancêtres dans l’ordre.
  let idx = items.length - 2;
  for (let c = compounds.length - 2; c >= 0; c--) {
    let found = false;
    while (idx >= 0) {
      const item = items[idx]!;
      idx--;
      if (itemMatches(item, screen.recipeName, compounds[c]!)) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

/**
 * La règle s’applique-t-elle au nœud dans l’état `state` (null = Normal) ?
 * Règle d’élément : par propriétaire. Classe partagée : par sélecteur simulé.
 */
export function ruleMatchesNode(
  rule: StyleRule,
  screen: Screen,
  node: UiNode,
  chain: UiNode[],
  state: StyleState | null = null,
): boolean {
  if (isElementRule(rule)) {
    return rule.ownerNodeId === node.id && (rule.state ?? null) === state;
  }
  const a = analyzeSelector(rule.selector);
  // Sous-partie : jamais l’élément lui-même (un padding de `Window::Content`
  // posé sur la Window décalerait aussi la barre de titre).
  if (!a.simulated || a.part || a.state !== state) return false;
  return selectorMatchesChain(a.base, screen, chain);
}

/** La règle vise-t-elle la zone de contenu de cette fenêtre (état Normal) ? */
function ruleMatchesWindowContent(rule: StyleRule, screen: Screen, chain: UiNode[]): boolean {
  if (isElementRule(rule)) return false;
  const a = analyzeSelector(rule.selector);
  if (!a.simulated || a.part !== WINDOW_CONTENT_PART || a.state !== null || !a.prefix) return false;
  return chain[chain.length - 1]?.type === "Window" && selectorMatchesChain(a.prefix, screen, chain);
}

/**
 * Style de la zone de contenu d’une fenêtre : classes partagées
 * `<fenêtre> Window::Content`, dans l’ordre du projet, état Normal.
 */
export function windowContentStyle(project: TfuiProject, screen: Screen, windowNode: UiNode): StyleProps {
  const chain = findAncestorChain(screen.root, windowNode.id);
  if (!chain) return {};
  const out: Record<string, unknown> = {};
  for (const r of project.styleRules) {
    if (ruleMatchesWindowContent(r, screen, chain)) Object.assign(out, r.props);
  }
  return out as StyleProps;
}

/** Classes partagées (non propres à un élément) qui touchent le nœud, état Normal. */
export function matchingRules(
  project: TfuiProject,
  screen: Screen,
  node: UiNode,
): StyleRule[] {
  const chain = findAncestorChain(screen.root, node.id);
  if (!chain) return [];
  return project.styleRules.filter(
    (r) => !isElementRule(r) && ruleMatchesNode(r, screen, node, chain),
  );
}

/** Nombre de nœuds (tous écrans) touchés par une classe partagée, tous états. */
export function countRuleTargets(project: TfuiProject, rule: StyleRule): string[] {
  const ids: string[] = [];
  for (const screen of project.screens) {
    const walk = (node: UiNode, chain: UiNode[]) => {
      const here = [...chain, node];
      const states: (StyleState | null)[] = [null, ...STYLE_STATES];
      if (
        states.some((s) => ruleMatchesNode(rule, screen, node, here, s)) ||
        ruleMatchesWindowContent(rule, screen, here)
      ) {
        ids.push(node.id);
      }
      for (const children of Object.values(node.slots)) {
        for (const c of children) walk(c, here);
      }
    };
    walk(screen.root, []);
  }
  return ids;
}

/** Provenance d’une valeur de style effective. */
export type StyleOrigin =
  | { kind: "game"; file: string; selector: string; state: StyleState | null }
  | { kind: "shared"; ruleId: string; selector: string; state: StyleState | null }
  | { kind: "inline" }
  | { kind: "element"; ruleId: string; state: StyleState | null };

export interface ResolvedStyle {
  values: StyleProps;
  origins: Record<string, StyleOrigin>;
}

/**
 * Valeurs effectives et provenance, dans l’ordre : styles de base du jeu
 * (feuilles vanilla, si chargées), classes partagées, ancien style inline,
 * règle de l’élément ; puis les mêmes pour l’état demandé (l’état l’emporte
 * sur Normal).
 */
export function resolveStylesWithOrigin(
  project: TfuiProject,
  screen: Screen,
  node: UiNode,
  state: StyleState | null = null,
): ResolvedStyle {
  const values: Record<string, unknown> = {};
  const origins: Record<string, StyleOrigin> = {};
  const chain = findAncestorChain(screen.root, node.id);
  if (!chain) return { values: {}, origins: {} };

  const apply = (props: StyleProps, origin: StyleOrigin) => {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined) continue;
      values[k] = v;
      origins[k] = origin;
    }
  };

  const baseIndex = getActiveBaseStyleIndex();
  const layers: (StyleState | null)[] = state ? [null, state] : [null];
  for (const layer of layers) {
    if (baseIndex) {
      const target = { screen, chain, state: layer };
      for (const r of matchingBaseRules(baseIndex, target, baseNodeClasses)) {
        apply(r.styleSheet as StyleProps, { kind: "game", file: r.file, selector: r.selector, state: layer });
      }
    }
    for (const r of project.styleRules) {
      if (isElementRule(r)) continue;
      if (ruleMatchesNode(r, screen, node, chain, layer)) {
        apply(r.props, { kind: "shared", ruleId: r.id, selector: r.selector, state: layer });
      }
    }
    if (layer === null && node.meta.inlineStyle) {
      apply(node.meta.inlineStyle, { kind: "inline" });
    }
    for (const r of project.styleRules) {
      if (r.ownerNodeId === node.id && (r.state ?? null) === layer) {
        apply(r.props, { kind: "element", ruleId: r.id, state: layer });
      }
    }
  }
  return { values: values as StyleProps, origins };
}

export function resolveStyles(
  project: TfuiProject,
  screen: Screen,
  node: UiNode,
  state: StyleState | null = null,
): StyleProps {
  return resolveStylesWithOrigin(project, screen, node, state).values;
}
