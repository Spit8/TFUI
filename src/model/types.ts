export type PropValue =
  | { kind: "literal"; value: string | number | boolean | number[] }
  | { kind: "enum"; value: string }
  | { kind: "state"; stateVar: string }
  | { kind: "handler"; fn: string }
  | { kind: "lua"; code: string };

/**
 * Couleur nommée de la palette du jeu (`default_colors.gres`), émise comme le
 * vanilla : `colorDefault.<name>` ; `alpha` remplace la transparence.
 */
export interface PaletteColor {
  kind: "palette";
  name: string;
  alpha?: number;
}

export type StyleProps = Partial<{
  size: [number, number];
  innerSpacing: [number, number];
  outerSpacing: [number, number];
  padding: [number, number, number, number];
  color: [number, number, number, number] | PaletteColor;
}> &
  Record<string, unknown>;

export interface UiNodeMeta {
  id?: string;
  class?: string[];
  tooltip?: string;
  enabled?: PropValue;
  inlineStyle?: StyleProps;
}

export interface UiNode {
  id: string;
  type: string;
  name?: string;
  props: Record<string, PropValue>;
  meta: UiNodeMeta;
  slots: Record<string, UiNode[]>;
  locked?: boolean;
  hidden?: boolean;
}

export interface StateVar {
  name: string;
  initial: string | number | boolean | null;
}

export interface ScreenPlugin {
  extensionPoint: "MainModButtonAreaExtension";
  pluginName: string;
  order: number;
  buttonLabel: string;
}

export interface Screen {
  id: string;
  fileBase: string;
  recipeName: string;
  kind: "window" | "recipe" | "plugin";
  plugin?: ScreenPlugin;
  state: StateVar[];
  root: UiNode;
  previewViewport: { w: number; h: number };
}

export interface StyleRule {
  id: string;
  /** Sélecteur saisi (classes partagées) ; ignoré pour une règle d’élément. */
  selector: string;
  props: StyleProps;
  comment?: string;
  /**
   * Règle propre à un nœud (style « par élément ») : le sélecteur est dérivé
   * (`R::<recipe> !tfui-<id>`), voir `model/elementStyle.ts`.
   */
  ownerNodeId?: string;
  /** État de la règle d’élément (absent = Normal). */
  state?: "hover" | "active" | "disabled";
}

export interface TfuiProject {
  schemaVersion: 1;
  mod: {
    modId: string;
    modRoot: string;
    guiDir: string;
  };
  screens: Screen[];
  styleRules: StyleRule[];
  catalogHash: string;
  /** Fichiers générés lors de la dernière écriture GUI (relatifs à guiDir). */
  lastWrittenFiles?: string[];
}

export type DropPosition = "before" | "after" | "into";

export interface DropTarget {
  screenId: string;
  parentId: string | null;
  slot: string;
  index: number;
  position: DropPosition;
}

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  screenId?: string;
  nodeId?: string;
}
