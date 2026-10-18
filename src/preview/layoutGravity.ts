import type { Screen, TfuiProject, UiNode } from "../model/types";
import { resolveStyles } from "./cascade";

/**
 * Étirement et alignement des éléments dans un layout, d’après la clé CSS
 * `gravity = { x, y }` des `.css.lua` du jeu : `-1` = s’étire sur cet axe,
 * `0` / `0.5` / `1` = aligné au début / centre / fin.
 *
 * Les défauts par type (Slider, ProgressBar, Button…) viennent des feuilles
 * de base du jeu, appliquées par la cascade (voir gamestyle/). Constaté en
 * jeu (2026-10-17) : une BoxLayout horizontale contenant une ProgressBar
 * s’étire en hauteur, et plus du tout sans elle.
 */
export type Gravity = [number, number];

/**
 * Comportements du moteur C++ absents des feuilles de base, constatés en jeu.
 * TextInputField : aucune gravity dans builtin.css.lua (seulement
 * `minSize = {-1, 24}`), mais étirement en hauteur et en largeur constaté
 * (2026-10-17).
 * TextView : aucune règle `TextView` seule dans les feuilles de base, mais
 * centré en hauteur dans une BoxLayout, sans l’étirer (constaté 2026-10-17).
 */
export const ENGINE_OBSERVED_GRAVITY: Record<string, Gravity> = {
  TextInputField: [-1, -1],
  // Champ de saisie comme TextInputField : haut et étiré (banc, 2026-10-18).
  DoubleSpinBox: [-1, -1],
  // Occupe la place restante ; ses enfants superposés, à gauche et centrés en
  // hauteur (déduit de la capture du banc, 2026-10-18 ; approximation).
  AbsoluteLayout: [-1, -1],
  TextView: [0, 0.5],
  // Aucune gravity dans les feuilles de base, mais la List suit la fenêtre
  // (constaté en jeu, 2026-10-18).
  List: [-1, -1],
};

/**
 * Conteneurs défilants : ils peuvent descendre sous la taille de leur contenu
 * (rognage + barre de défilement), quelle que soit leur politique
 * (`AlwaysOff` masque la barre mais rogne aussi). Constaté en jeu pour la
 * List (2026-10-18).
 */
const SCROLL_CONTAINERS = new Set(["List", "ScrollArea"]);

/** `builtin.type.ScrollBarPolicy` (builtin.d.tl). */
export type ScrollBarPolicy =
  | "AlwaysOff"
  | "AlwaysOn"
  | "AsNeeded"
  | "AsNeededButAlwaysReserveSpace"
  | "Simple";

const POLICIES: readonly ScrollBarPolicy[] = [
  "AlwaysOff",
  "AlwaysOn",
  "AsNeededButAlwaysReserveSpace",
  "AsNeeded",
  "Simple",
];

/** Props de politique par type (`ListParam` / `ScrollAreaParam`). */
const POLICY_PROPS: Record<string, { x: string; y: string }> = {
  List: { x: "horizontalScrollBarPolicy", y: "verticalScrollBarPolicy" },
  ScrollArea: { x: "horizontalPolicy", y: "verticalPolicy" },
};

function policyOf(node: UiNode, prop: string): ScrollBarPolicy {
  const v = node.props[prop];
  // `builtin.type.ScrollBarPolicy.AlwaysOff`, `ScrollBarPolicy.AlwaysOff`… : dernier segment.
  const raw = v?.kind === "enum" || v?.kind === "literal" ? String(v.value) : v?.kind === "lua" ? v.code : "";
  const last = raw.split(".").pop() ?? "";
  return POLICIES.find((p) => p === last) ?? "AsNeeded";
}

/**
 * Politique de défilement par axe d’un conteneur défilant (défaut `AsNeeded`,
 * valeur non documentée ; `Simple` sans sens établi, rendu comme `AsNeeded`).
 */
export function scrollPolicies(node: UiNode): { x: ScrollBarPolicy; y: ScrollBarPolicy } | null {
  const props = POLICY_PROPS[node.type];
  return props ? { x: policyOf(node, props.x), y: policyOf(node, props.y) } : null;
}

/** Politique → débordement CSS de l’aperçu. */
export function overflowForPolicy(policy: ScrollBarPolicy): "hidden" | "scroll" | "auto" {
  if (policy === "AlwaysOff") return "hidden";
  if (policy === "AlwaysOn") return "scroll";
  return "auto";
}

/** Conteneurs qui s’étirent si l’un de leurs enfants s’étire (comme Qt). */
// FloatingLayout(Child) : une ProgressBar -1/-1 dans un enfant flottant étire
// le FloatingLayout jusqu’à son cadre (constaté en jeu, banc 2, 2026-10-18).
const PROPAGATING_LAYOUTS = new Set([
  "BoxLayout",
  "FlowLayout",
  "Component",
  "ScrollArea",
  "FloatingLayout",
  "FloatingLayoutChild",
]);

function asGravity(value: unknown): Gravity | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const [x, y] = value;
  return typeof x === "number" && typeof y === "number" ? [x, y] : null;
}

/**
 * Gravity d’un élément sans règle ni comportement constaté : à gauche,
 * centré en hauteur dans sa box (constaté en jeu, 2026-10-18).
 */
export const DEFAULT_GRAVITY: Gravity = [0, 0.5];

/**
 * Emplacements que le moteur remplit entièrement (constaté en jeu, banc
 * 2026-10-18) : le contenu d’un onglet (`TabWidgetChild.item`, dans
 * `TabWidget::Content { gravity { -1, -1 } }`).
 */
const FILL_SLOTS: Record<string, string> = {
  TabWidgetChild: "item",
  // Pas `Component.layout` : en jeu (banc 2), un FloatingLayout en layout d’un
  // Component de taille fixée garde sa taille naturelle ; une BoxLayout ne
  // remplit son Component que si ses enfants s’étirent (propagation).
  // L’enfant flottant est placé par h / v ; son item remplit sa case (hypothèse).
  FloatingLayoutChild: "item",
};

function fillsParentSlot(screen: Screen, node: UiNode): boolean {
  const found = parentSlotOf(screen.root, node.id);
  return !!found && FILL_SLOTS[found.parent.type] === found.slot;
}

function parentSlotOf(root: UiNode, id: string): { parent: UiNode; slot: string } | null {
  for (const [slot, children] of Object.entries(root.slots)) {
    for (const c of children) {
      if (c.id === id) return { parent: root, slot };
      const deeper = parentSlotOf(c, id);
      if (deeper) return deeper;
    }
  }
  return null;
}

/** Gravity posée par une règle (jeu ou projet), ou null. */
function cssGravity(project: TfuiProject, screen: Screen, node: UiNode): Gravity | null {
  return asGravity((resolveStyles(project, screen, node) as Record<string, unknown>).gravity) ?? null;
}

/** Gravity effective : cascade (jeu, puis projet), sinon comportement constaté, sinon `DEFAULT_GRAVITY`. */
export function effectiveGravity(
  project: TfuiProject,
  screen: Screen,
  node: UiNode,
): Gravity {
  const fromCss = asGravity(
    (resolveStyles(project, screen, node) as Record<string, unknown>).gravity,
  );
  return fromCss ?? ENGINE_OBSERVED_GRAVITY[node.type] ?? DEFAULT_GRAVITY;
}

/** Layouts sans enfant visible : ignorés par le moteur (voir `isEmptyLayout`). */
const EMPTY_IGNORED_LAYOUTS = new Set(["BoxLayout", "FlowLayout"]);

/**
 * BoxLayout / FlowLayout sans enfant visible. Constaté en jeu (2026-10-18) :
 * sa `gravity` n’a aucun effet (une box vide `{ -1, -1 }` ne repousse pas ses
 * voisins), comme un layout vide de Qt, ignoré par son parent.
 */
export function isEmptyLayout(node: UiNode): boolean {
  return (
    EMPTY_IGNORED_LAYOUTS.has(node.type) &&
    !Object.values(node.slots).some((children) => children.some((c) => !c.hidden))
  );
}

/** L’élément s’étire-t-il sur l’axe (0 = x, 1 = y) ? */
export function expandsOnAxis(
  project: TfuiProject,
  screen: Screen,
  node: UiNode,
  axis: 0 | 1,
): boolean {
  // Taille fixée sur l’axe (`size`, -1 = libre) : l’élément ne s’étire pas.
  // Constaté en jeu (banc, 2026-10-18) : ProgressBar `size { 80, 8 }` garde
  // 80 px malgré `gravity { -1, -1 }` (builtin.css.lua). Son conteneur, lui,
  // s’étire quand même (voir `wantsToExpand`).
  const size = (resolveStyles(project, screen, node) as Record<string, unknown>).size;
  if (Array.isArray(size) && typeof size[axis] === "number" && (size[axis] as number) > 0) return false;
  // Emplacement rempli par le moteur : l’élément s’étire, sans que son parent
  // en hérite (la carte `Component` du pied reste à sa taille en jeu).
  if (!node.hidden && fillsParentSlot(screen, node)) return true;
  return wantsToExpand(project, screen, node, axis);
}

/**
 * Étirement demandé par la gravity, propagé aux conteneurs. Une taille fixée
 * ne l’annule pas : une BoxLayout contenant une ProgressBar (`size { -1, 20 }`
 * du jeu de base) s’étire en hauteur (constaté en jeu, 2026-10-17).
 */
function wantsToExpand(
  project: TfuiProject,
  screen: Screen,
  node: UiNode,
  axis: 0 | 1,
): boolean {
  if (node.hidden) return false;
  if (isEmptyLayout(node)) return false;
  if (effectiveGravity(project, screen, node)[axis] === -1) return true;
  if (!PROPAGATING_LAYOUTS.has(node.type)) return false;
  // Gravity posée par une règle sur ce conteneur : elle l’emporte sur
  // l’étirement de ses enfants. Constaté en jeu (banc, 2026-10-18) : une box
  // verticale `gravity { 0, -1 }` contenant une ScrollArea `{ -1, -1 }` garde
  // sa largeur naturelle ; sans règle, une box suit ses enfants (ProgressBar,
  // 2026-10-17).
  if (cssGravity(project, screen, node) !== null) return false;
  return Object.values(node.slots).some((children) =>
    children.some((c) => wantsToExpand(project, screen, c, axis)),
  );
}

/**
 * L’élément peut-il descendre sous la taille de son contenu sur l’axe
 * (0 = x, 1 = y) ? Oui pour un conteneur défilant, et pour un layout qui en
 * contient un (la place manquante est prise sur la zone défilante) ; jamais
 * pour les autres éléments.
 */
export function shrinksOnAxis(
  project: TfuiProject,
  screen: Screen,
  node: UiNode,
  axis: 0 | 1,
): boolean {
  if (node.hidden) return false;
  if (SCROLL_CONTAINERS.has(node.type)) return true;
  // Un onglet contenant une zone défilante se réduit aussi : sinon une fenêtre
  // de taille fixée déborde au lieu de faire défiler la liste de l’onglet.
  if (!PROPAGATING_LAYOUTS.has(node.type) && !SHRINK_THROUGH.has(node.type)) return false;
  return Object.values(node.slots).some((children) =>
    children.some((c) => shrinksOnAxis(project, screen, c, axis)),
  );
}

/** Conteneurs qui transmettent le rétrécissement (en plus des layouts). */
const SHRINK_THROUGH = new Set(["TabWidget", "TabWidgetChild"]);

/** Position flex d’un alignement `gravity` (0 / 0.5 / 1). */
export function alignForGravity(value: number): "flex-start" | "center" | "flex-end" {
  if (value >= 0.75) return "flex-end";
  if (value >= 0.25) return "center";
  return "flex-start";
}
