import type { StyleState } from "../model/elementStyle";
import type { Screen, UiNode } from "../model/types";
import type { BaseStyleLevel, BaseStyleRule } from "./types";
import { RECIPE_SELECTED_BUILTINS } from "../catalog/extractStyleVocabulary";
import { getActiveBaseStyles } from "./activeBaseStyles";

/**
 * Type visé par un élément de sélecteur : `R::Component` → `Component` ;
 * `Component` seul → null (ne vise rien en jeu, voir RECIPE_SELECTED_BUILTINS).
 */
function nodeElement(el: string): string | null {
  const m = el.match(/^R::([A-Za-z0-9_]+)$/);
  if (m && RECIPE_SELECTED_BUILTINS.has(m[1]!)) return m[1]!;
  if (RECIPE_SELECTED_BUILTINS.has(el)) return null;
  return el;
}

/** `R::<recette>` hors builtins visés par leur nom de recette. */
function isRecipeLevel(el: string): boolean {
  return el.startsWith("R::") && nodeElement(el) === el;
}

/**
 * Correspondance des règles de base du jeu (niveaux déjà découpés par
 * `stylesheetutil.lua`) avec l’arbre de l’aperçu.
 *
 * Approximations, faute de pouvoir voir l’arbre interne du moteur C++ :
 * - un sous-élément « conteneur » (`CONTENT_PARTS`, ex. `Button::Layout`) est
 *   placé entre le nœud `Type` et ses enfants ; les autres parties (barre de
 *   titre, poignée de Slider…) ne contiennent jamais d’éléments du mod. Une
 *   règle qui vise une partie elle-même (dernier niveau) est ignorée ;
 * - `>` saute ces parties sauf si le niveau parent en est une ;
 * - au-dessus de la racine, l’environnement porte `envRootClasses()` (taille
 *   de police « moyenne » des options, hypothèse ; pas `!input-controller`) ;
 * - une pseudo-classe sur un ancêtre ne correspond jamais (ancêtres « Normal »).
 */
export const ENV_ROOT_CLASSES = ["font-medium"];

/** Option du jeu Interface › Text Scaling (`fontScaleClass`). */
export type GameFontScale = "small" | "medium" | "large";

let envClasses: string[] = ENV_ROOT_CLASSES;

/** Taille du texte simulée (classe `!font-small` / `!font-medium` / `!font-large`). */
export function setGameFontScale(scale: GameFontScale): void {
  envClasses = [`font-${scale}`];
}

export function envRootClasses(): string[] {
  return envClasses;
}

let knownFontScaleCache: { rules: BaseStyleRule[]; classes: Set<string> } | null = null;

/** Classes `font-scale-*` définies par les feuilles de base du jeu (font_scaling.css.lua…). */
function knownFontScaleClasses(): Set<string> | null {
  const rules = getActiveBaseStyles()?.rules;
  if (!rules) return null;
  if (knownFontScaleCache?.rules !== rules) {
    const classes = new Set<string>();
    for (const r of rules) {
      for (const l of r.levels) for (const c of l.classList) if (c.startsWith("font-scale-")) classes.add(c);
    }
    knownFontScaleCache = { rules, classes };
  }
  return knownFontScaleCache.classes;
}

/**
 * Classes posées par le moteur pour la mise en forme du texte : un TextView
 * sans classe `font-scale-*` **connue du jeu** a la taille de
 * `!font-scale-body` (constaté en jeu, 2026-10-17 : même taille qu’un
 * TextView `font-scale-body` ; 2026-10-18, banc : `font-scale-caption`,
 * inexistante, garde aussi cette taille).
 */
export function engineDefaultClasses(type: string, classes: string[]): string[] {
  if (type !== "TextView") return [];
  const known = knownFontScaleClasses();
  const hasScale = classes.some((c) => c.startsWith("font-scale-") && (known === null || known.has(c)));
  return hasScale ? [] : ["font-scale-body"];
}

/**
 * Sous-éléments qui accueillent les enfants posés par le mod (déduit des
 * sélecteurs de builtin.css.lua, ex. `Button::Layout TextView`) ; hypothèse.
 */
export const CONTENT_PARTS = new Set([
  "Button::Layout",
  "ToggleButtonInternal::Layout",
  "TabWidget::ContentLayout",
  "TabWidget::Content",
  "Table::Content",
  "Table::TableLayout",
  "List::Item",
]);

type ChainItem =
  | { kind: "env" }
  | { kind: "recipe" }
  | { kind: "node"; node: UiNode }
  | { kind: "part"; node: UiNode };

export interface MatchTarget {
  screen: Screen;
  /** Racine → nœud (inclus). */
  chain: UiNode[];
  /** État simulé du nœud (null = Normal) ; doit égaler sa pseudo-classe. */
  state: StyleState | null;
}

/** Classes portées par un nœud : `meta.class` + classes posées par le moteur. */
export type ClassesOf = (node: UiNode) => string[];

function isPartLevel(l: BaseStyleLevel): boolean {
  return !!l.element && l.element.includes("::") && !l.element.startsWith("R::");
}

function nodeId(node: UiNode): string | undefined {
  const fromMeta = (node.meta as Record<string, unknown>).id;
  if (typeof fromMeta === "string") return fromMeta;
  const prop = node.props.id;
  return prop?.kind === "literal" && typeof prop.value === "string" ? prop.value : undefined;
}

function buildItems(screen: Screen, chain: UiNode[]): ChainItem[] {
  const items: ChainItem[] = [{ kind: "env" }];
  if (screen.kind !== "window") items.push({ kind: "recipe" });
  chain.forEach((node, i) => {
    items.push({ kind: "node", node });
    if (i < chain.length - 1) items.push({ kind: "part", node });
  });
  return items;
}

function levelMatchesItem(
  level: BaseStyleLevel,
  item: ChainItem,
  isTarget: boolean,
  target: MatchTarget,
  classesOf: ClassesOf,
): boolean {
  const el = level.element;
  const pseudo = level.pseudoClassList;
  switch (item.kind) {
    case "env":
      return (
        !el && !level.id && pseudo.length === 0 &&
        level.classList.every((c) => envClasses.includes(c))
      );
    case "recipe":
      return el === `R::${target.screen.recipeName}` && level.classList.length === 0 && pseudo.length === 0;
    case "part":
      return (
        !!el && CONTENT_PARTS.has(el) && el.split("::")[0] === item.node.type &&
        level.classList.length === 0 && pseudo.length === 0
      );
    case "node": {
      if (el && el !== "*" && nodeElement(el) !== item.node.type) return false;
      if (level.id && level.id !== nodeId(item.node)) return false;
      if (level.classList.length > 0) {
        const classes = classesOf(item.node);
        if (!level.classList.every((c) => classes.includes(c))) return false;
      }
      if (!isTarget) return pseudo.length === 0;
      const wanted = target.state ? [target.state] : [];
      return pseudo.length === wanted.length && pseudo.every((p) => wanted.includes(p as StyleState));
    }
  }
}

/** La règle du jeu s’applique-t-elle au dernier nœud de `target.chain` ? */
export function baseRuleMatches(rule: BaseStyleRule, target: MatchTarget, classesOf: ClassesOf): boolean {
  const levels = rule.levels;
  if (levels.length === 0 || target.chain.length === 0) return false;
  const last = levels[levels.length - 1]!;
  if (last.element && (isPartLevel(last) || isRecipeLevel(last.element))) return false;
  const items = buildItems(target.screen, target.chain);

  const matchFrom = (levelIdx: number, itemIdx: number): boolean => {
    if (levelIdx < 0) return true;
    const level = levels[levelIdx]!;
    // `childCombinator` d’un niveau : relation avec le niveau suivant.
    if (level.childCombinator > 0) {
      const wantPart = isPartLevel(level);
      for (let j = itemIdx - 1; j >= 0; j--) {
        const it = items[j]!;
        if (it.kind === "part" && !wantPart) continue;
        return levelMatchesItem(level, it, false, target, classesOf) && matchFrom(levelIdx - 1, j);
      }
      return false;
    }
    for (let j = itemIdx - 1; j >= 0; j--) {
      if (levelMatchesItem(level, items[j]!, false, target, classesOf) && matchFrom(levelIdx - 1, j)) {
        return true;
      }
    }
    return false;
  };

  const targetIdx = items.length - 1;
  return levelMatchesItem(last, items[targetIdx]!, true, target, classesOf) && matchFrom(levels.length - 2, targetIdx);
}

/** Index des règles par type visé (dernier niveau) ; `""` = tout type. */
export interface BaseStyleIndex {
  byType: Map<string, BaseStyleRule[]>;
}

export function indexBaseRules(rules: BaseStyleRule[]): BaseStyleIndex {
  const byType = new Map<string, BaseStyleRule[]>();
  for (const rule of rules) {
    const last = rule.levels[rule.levels.length - 1];
    if (!last) continue;
    if (last.element && (isPartLevel(last) || isRecipeLevel(last.element))) continue;
    const key = !last.element || last.element === "*" ? "" : (nodeElement(last.element) ?? last.element);
    byType.set(key, [...(byType.get(key) ?? []), rule]);
  }
  return { byType };
}

/** Règles du jeu applicables au nœud, dans l’ordre d’ajout (le dernier l’emporte). */
export function matchingBaseRules(
  index: BaseStyleIndex,
  target: MatchTarget,
  classesOf: ClassesOf,
): BaseStyleRule[] {
  const node = target.chain[target.chain.length - 1];
  if (!node) return [];
  const candidates = [...(index.byType.get(node.type) ?? []), ...(index.byType.get("") ?? [])];
  return candidates
    .filter((r) => baseRuleMatches(r, target, classesOf))
    .sort((a, b) => a.order - b.order);
}
