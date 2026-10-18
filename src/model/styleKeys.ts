import { COMPONENT_OVERRIDES } from "../catalog/overrides";
import { selectorElement } from "../catalog/extractStyleVocabulary";
import type { StyleVocabulary } from "../catalog/types";
import { analyzeSelector, countRuleTargets } from "../preview/cascade";
import { findNode } from "./treeOps";
import type { StyleRule, TfuiProject } from "./types";

/**
 * Propriétés de style autorisées par type d’élément.
 *
 * Aucun fichier du jeu ne les déclare (`StyleSheet` est opaque dans
 * `api/gui.d.tl`) : la preuve est l’usage vanilla (clés de premier niveau
 * posées sur ce type dans les `.css.lua`, voir extractStyleVocabulary.ts),
 * plus un socle de mise en page commun à tout élément, plus les clés
 * vérifiées en jeu déclarées dans `overrides.ts` (`styleKeys`).
 */

/** Socle de mise en page proposé sur tout élément (vu en vanilla sur la plupart des types). */
export const COMMON_STYLE_KEYS = [
  "size",
  "minSize",
  "maxSize",
  "gravity",
  "margin",
  "padding",
  "visibility",
] as const;

/** Provenance d’une clé autorisée. */
export type StyleKeyEvidence = "vanilla" | "common" | "verified";

export interface AllowedStyleKeys {
  keys: Map<string, StyleKeyEvidence>;
  /** Élément(s) d’où vient la liste (affichage). */
  elements: string[];
  /**
   * Pourquoi la liste est réduite : composant utilitaire (aucun élément du
   * jeu), vocabulaire absent ou ancien (re-scan nécessaire).
   */
  limitation?: "helper" | "noVocabulary";
}

/** Composant utilitaire (`ug_require`) : son sélecteur ne vise aucun élément du jeu. */
export function isHelperType(type: string): boolean {
  return Boolean(COMPONENT_OVERRIDES[type]?.ugRequire);
}

/** Clés autorisées sur un élément (`TextView`, `Window::Content`…). */
export function allowedStyleKeys(element: string, vocabulary: StyleVocabulary | null): AllowedStyleKeys {
  const keys = new Map<string, StyleKeyEvidence>();
  if (isHelperType(element)) return { keys, elements: [element], limitation: "helper" };
  const byElement = vocabulary?.keysByElement;
  for (const k of byElement?.[element] ?? []) keys.set(k, "vanilla");
  for (const k of COMPONENT_OVERRIDES[element]?.styleKeys ?? []) {
    if (!keys.has(k)) keys.set(k, "verified");
  }
  for (const k of COMMON_STYLE_KEYS) {
    if (!keys.has(k)) keys.set(k, "common");
  }
  return byElement
    ? { keys, elements: [element] }
    : { keys, elements: [element], limitation: "noVocabulary" };
}

/** Intersection : une clé n’est gardée que si tous les éléments l’acceptent. */
function intersect(all: AllowedStyleKeys[]): AllowedStyleKeys {
  const [first, ...rest] = all;
  if (!first) return { keys: new Map(), elements: [] };
  const keys = new Map<string, StyleKeyEvidence>();
  for (const [k, ev] of first.keys) {
    const others = rest.map((a) => a.keys.get(k));
    if (others.some((o) => o === undefined)) continue;
    // Moins sûre des provenances : socle < vérifiée < vanilla.
    const evs = [ev, ...(others as StyleKeyEvidence[])];
    keys.set(k, evs.includes("common") ? "common" : evs.includes("verified") ? "verified" : "vanilla");
  }
  const limitation = all.find((a) => a.limitation)?.limitation;
  return { keys, elements: all.flatMap((a) => a.elements), ...(limitation ? { limitation } : {}) };
}

/**
 * Clés autorisées pour une règle :
 * - règle d’élément : type du nœud ;
 * - classe partagée `… Window::Content` : la sous-partie ;
 * - autre classe partagée : tous les types des éléments qu’elle touche dans
 *   le projet ; sans cible, l’élément écrit dans le sélecteur ; sinon le socle.
 */
export function allowedKeysForRule(
  project: TfuiProject,
  rule: StyleRule,
  vocabulary: StyleVocabulary | null,
): AllowedStyleKeys {
  if (rule.ownerNodeId) {
    const loc = findNode(project, rule.ownerNodeId);
    return loc ? allowedStyleKeys(loc.node.type, vocabulary) : { keys: new Map(), elements: [] };
  }
  const analysis = analyzeSelector(rule.selector);
  if (analysis.part) return allowedStyleKeys(analysis.part, vocabulary);

  const types = new Set<string>();
  for (const id of countRuleTargets(project, rule)) {
    const loc = findNode(project, id);
    if (loc) types.add(loc.node.type);
  }
  if (types.size > 0) {
    return intersect([...types].sort().map((type) => allowedStyleKeys(type, vocabulary)));
  }
  const element = selectorElement(analysis.base);
  if (element) return allowedStyleKeys(element, vocabulary);
  const keys = new Map<string, StyleKeyEvidence>(COMMON_STYLE_KEYS.map((k) => [k, "common"]));
  return vocabulary?.keysByElement ? { keys, elements: [] } : { keys, elements: [], limitation: "noVocabulary" };
}
