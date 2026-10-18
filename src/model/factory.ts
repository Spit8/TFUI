import type { Catalog } from "../catalog/types";
import { COMPONENT_OVERRIDES } from "../catalog/overrides";
import { defaultSlotsForType } from "./slots";
import type {
  PropValue,
  Screen,
  TfuiProject,
  UiNode,
} from "./types";
import { findPreset } from "./palettePresets";
import { createId } from "./uuid";
import { applyNewWindowDefaults } from "./windowDefaults";

function toPropValue(value: unknown): PropValue {
  if (
    typeof value === "string" &&
    (value.includes("Orientation.") || value.includes("Type."))
  ) {
    return { kind: "enum", value };
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (Array.isArray(value) && value.every((v) => typeof v === "number"))
  ) {
    return { kind: "literal", value: value as string | number | boolean | number[] };
  }
  return { kind: "lua", code: String(value) };
}

export function createNode(
  type: string,
  name?: string,
  catalog?: Catalog | null,
): UiNode {
  const defaults = COMPONENT_OVERRIDES[type]?.defaults ?? {};
  const props: Record<string, PropValue> = {};
  for (const [key, value] of Object.entries(defaults)) {
    props[key] = toPropValue(value);
  }
  return {
    id: createId(),
    type,
    name: name ?? type,
    props,
    meta: {},
    slots: Object.fromEntries(
      Object.keys(defaultSlotsForType(type, catalog)).map((slot) => [slot, []]),
    ),
  };
}

export function createScreen(opts?: {
  recipeName?: string;
  fileBase?: string;
  kind?: Screen["kind"];
}): Screen {
  const recipeName = opts?.recipeName ?? "MainWindow";
  const fileBase = opts?.fileBase ?? "main_gui";
  const kind = opts?.kind ?? "window";
  const root =
    kind === "window" ? createNode("Window", recipeName) : createNode("BoxLayout");
  return {
    id: createId(),
    fileBase,
    recipeName,
    kind,
    state: [],
    root,
    previewViewport: { w: 1920, h: 1080 },
  };
}

export function createEmptyProject(opts?: {
  modId?: string;
  modRoot?: string;
  catalogHash?: string;
}): TfuiProject {
  const modId = opts?.modId ?? "my_mod";
  const screen = createScreen();
  // Fenêtre prête : croix qui ferme en jeu, classe, taille, marge du contenu.
  const styleRules = applyNewWindowDefaults(screen.root, { modId, name: screen.recipeName });
  return {
    schemaVersion: 1,
    mod: {
      modId,
      modRoot: opts?.modRoot ?? "mod",
      guiDir: "gui",
    },
    screens: [screen],
    styleRules,
    catalogHash: opts?.catalogHash ?? "",
  };
}

/** Style d’élément posé à la création (visible et modifiable dans l’inspecteur). */
export interface StarterStyle {
  nodeId: string;
  key: string;
  value: unknown;
}

/** Libellé d’un bouton : TextView enfant (comme les boutons vanilla). */
export function createButtonLabel(text: string, catalog?: Catalog | null): UiNode {
  const label = createNode("TextView", undefined, catalog);
  label.props.text = { kind: "literal", value: text };
  return label;
}

/**
 * Élément prêt à l’emploi pour une insertion depuis la palette : un bouton
 * reçoit explicitement un TextView « Bouton » (visible dans l’arbre, éditable
 * au double-clic) et des styles d’élément tirés de la palette du jeu (un
 * Button sans classe est transparent en jeu, donc invisible).
 */
/**
 * Enfants dont la `value` doit être renseignée et unique dans le parent :
 * `TabWidgetChild` (« must be not nil and must be unique », builtin.d.tl ; sinon
 * le jeu avertit et prend `os.clock()`) et `ComboBoxItem` (renseignée 39/39 en
 * vanilla). Motif vanilla : `value = #tabWidgetChildren + 1`.
 */
export const VALUED_CHILD_TYPES = new Set(["TabWidgetChild", "ComboBoxItem"]);

/** Prochaine valeur libre parmi les frères : 1 + la plus grande valeur numérique. */
export function nextChildValue(siblings: UiNode[]): number {
  let max = 0;
  for (const s of siblings) {
    const v = s.props.value;
    if (v?.kind === "literal" && typeof v.value === "number") max = Math.max(max, v.value);
  }
  return Math.max(max, siblings.length) + 1;
}

export function createStarterNode(
  type: string,
  catalog?: Catalog | null,
  props?: Record<string, PropValue>,
  /** Préréglage de la palette (`palettePresets.ts`) : classes et nom. */
  presetId?: string,
  presetName?: string,
): { node: UiNode; styles: StarterStyle[] } {
  const node = createNode(type, undefined, catalog);
  // Props posées par la source (ex. image glissée depuis « Icônes du jeu »).
  if (props) Object.assign(node.props, props);
  const preset = findPreset(presetId);
  if (preset && preset.type === type) {
    node.meta.class = [...preset.classes];
    if (presetName) node.name = presetName;
    return { node, styles: [] };
  }
  if (type !== "Button" && type !== "ToggleButton") return { node, styles: [] };
  const label = createButtonLabel("Bouton", catalog);
  node.slots.content = [label];
  return {
    node,
    styles: [
      { nodeId: node.id, key: "backgroundColor1", value: { kind: "palette", name: "AccentDark" } },
      { nodeId: label.id, key: "color", value: { kind: "palette", name: "NeutralLightest" } },
    ],
  };
}
