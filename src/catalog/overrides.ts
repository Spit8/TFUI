import type {
  CatalogComponent,
  CatalogField,
  ComponentOverride,
  ComponentStatus,
} from "./types";
import { hasKey, t, translateKey } from "../i18n";

/** Identifiants stables des catégories (libellé traduit : `categoryLabel`). */
const CATEGORY = {
  windows: "windows",
  layouts: "layouts",
  textImage: "textImage",
  controls: "controls",
  collections: "collections",
  helpers: "helpers",
  advanced: "advanced",
  all: "all",
} as const;

/** Libellé traduit d’une catégorie de la palette. */
export function categoryLabel(id: string): string {
  const key = `catalog.category.${id}`;
  return hasKey(key) ? translateKey(key) : id;
}

/** Notes d’un composant (une par ligne de `catalog.notes.<Composant>`). */
export function componentNotes(name: string): string[] {
  const key = `catalog.notes.${name}`;
  if (!hasKey(key)) return [];
  return translateKey(key)
    .split("\n")
    .map((n) => n.trim())
    .filter(Boolean);
}

export const WHITELIST_ORDER: string[] = [
  "Window",
  "BoxLayout",
  "FlowLayout",
  "AbsoluteLayout",
  "AbsoluteLayoutChild",
  "FloatingLayout",
  "FloatingLayoutChild",
  "TableLayout",
  "Row",
  "ScrollArea",
  "Component",
  "TextView",
  "RichTextView",
  "ImageView",
  "Button",
  "ToggleButton",
  "ToggleButtonGroup",
  "CheckBox",
  "ComboBox",
  "ComboBoxItem",
  "Slider",
  "TextInputField",
  "DoubleSpinBox",
  "ProgressBar",
  "List",
  "TabWidget",
  "TabWidgetChild",
  "ContentCard",
  "TextButton",
  "DataTable",
  "Chart",
  "Series",
];

export const COMPONENT_OVERRIDES: Record<string, ComponentOverride> = {
  Window: {
    category: CATEGORY.windows,
    status: "stable",
    icon: "AppWindow",
    defaults: {
      // Valeurs par défaut à l’insertion : dans la langue de l’interface.
      get title() { return t("defaults.windowTitle"); },
      initialX: 0.1,
      initialY: 0.1,
      closable: true,
      movable: true,
    },
  },
  BoxLayout: {
    category: CATEGORY.layouts,
    status: "stable",
    icon: "Rows3",
    defaults: { orientation: "Orientation.Vertical" },
  },
  FlowLayout: {
    category: CATEGORY.layouts,
    status: "stable",
    icon: "WrapText",
  },
  AbsoluteLayout: {
    category: CATEGORY.layouts,
    // Aucun usage Lua vanilla ; aucun moyen connu de placer ses enfants.
    status: "experimental",
    icon: "Move",
    manual: {
      paramRecord: "AbsoluteLayoutParam",
      fields: [
        {
          name: "children",
          tealType: "{TreeNodeId}",
          kind: "slot-multi",
        },
      ],
    },
  },
  AbsoluteLayoutChild: {
    category: CATEGORY.layouts,
    status: "experimental",
    icon: "Crosshair",
  },
  // 2e motif de mise en page du jeu (118 FloatingLayout, 296 FloatingLayoutChild) :
  // superpositions, badges, icône sur une image.
  FloatingLayout: {
    category: CATEGORY.layouts,
    status: "stable",
    icon: "Layers",
  },
  FloatingLayoutChild: {
    category: CATEGORY.layouts,
    status: "stable",
    icon: "Crosshair",
  },
  TableLayout: {
    category: CATEGORY.layouts,
    status: "stable",
    icon: "Table",
  },
  Row: {
    category: CATEGORY.layouts,
    status: "stable",
    icon: "TableRowsSplit",
  },
  ScrollArea: {
    category: CATEGORY.layouts,
    status: "stable",
    icon: "ScrollText",
  },
  Component: {
    category: CATEGORY.layouts,
    status: "stable",
    icon: "Box",
  },
  TextView: {
    category: CATEGORY.textImage,
    status: "stable",
    icon: "Type",
    defaults: {
      get text() { return t("defaults.text"); },
    },
  },
  RichTextView: {
    category: CATEGORY.textImage,
    status: "stable",
    icon: "Pilcrow",
  },
  ImageView: {
    category: CATEGORY.textImage,
    status: "stable",
    icon: "Image",
  },
  Button: {
    category: CATEGORY.controls,
    status: "stable",
    icon: "MousePointerClick",
  },
  ToggleButton: {
    category: CATEGORY.controls,
    status: "stable",
    icon: "ToggleLeft",
  },
  ToggleButtonGroup: {
    category: CATEGORY.controls,
    status: "stable",
    icon: "ToggleRight",
  },
  CheckBox: {
    category: CATEGORY.controls,
    status: "stable",
    icon: "SquareCheck",
  },
  ComboBox: {
    category: CATEGORY.controls,
    status: "stable",
    icon: "ChevronsUpDown",
  },
  ComboBoxItem: {
    category: CATEGORY.controls,
    status: "stable",
    icon: "ListChecks",
  },
  Slider: {
    category: CATEGORY.controls,
    status: "stable",
    icon: "SlidersHorizontal",
  },
  TextInputField: {
    category: CATEGORY.controls,
    status: "stable",
    icon: "TextCursorInput",
  },
  DoubleSpinBox: {
    category: CATEGORY.controls,
    status: "stable",
    icon: "Hash",
  },
  ProgressBar: {
    category: CATEGORY.controls,
    status: "stable",
    icon: "Gauge",
  },
  List: {
    category: CATEGORY.collections,
    status: "stable",
    icon: "List",
  },
  TabWidget: {
    category: CATEGORY.collections,
    status: "stable",
    icon: "PanelsTopLeft",
  },
  TabWidgetChild: {
    category: CATEGORY.collections,
    status: "stable",
    icon: "PanelTop",
  },
  ContentCard: {
    category: CATEGORY.helpers,
    status: "stable",
    icon: "IdCard",
    ugRequire: "::/gui/main/content_card.tl",
    helperExport: "ContentCard",
    manual: {
      paramRecord: "ContentCardParam",
      fields: [
        { name: "title", tealType: "string", kind: "string" },
        {
          name: "extraChildrenPermanent",
          tealType: "{TreeNodeId}",
          kind: "slot-multi",
        },
      ],
    },
  },
  TextButton: {
    category: CATEGORY.helpers,
    status: "stable",
    icon: "RectangleHorizontal",
    ugRequire: "::/gui/main/button_react_util.tl",
    helperExport: "makeTextButton",
    manual: {
      paramRecord: "TextButtonParam",
      fields: [
        { name: "text", tealType: "string", kind: "string" },
        { name: "onClick", tealType: "function()", kind: "handler" },
      ],
    },
    defaults: {
      get text() { return t("defaults.button"); },
    },
  },
  DataTable: {
    category: CATEGORY.advanced,
    status: "unsafe",
    icon: "Sheet",
  },
  Chart: {
    category: CATEGORY.advanced,
    status: "experimental",
    icon: "ChartLine",
  },
  Series: {
    category: CATEGORY.advanced,
    status: "experimental",
    icon: "ChartSpline",
  },
};

/** Composants décrits uniquement via overrides.manual (helpers + AbsoluteLayout). */
export function buildManualHelperComponents(): CatalogComponent[] {
  const helpers: CatalogComponent[] = [];
  for (const [name, ov] of Object.entries(COMPONENT_OVERRIDES)) {
    if (!ov.manual) continue;
    helpers.push({
      name,
      paramRecord: ov.manual.paramRecord,
      fields: ov.manual.fields as CatalogField[],
      source: name === "AbsoluteLayout" ? "builtin" : "helper",
    });
  }
  return helpers;
}

export function resolveCategory(name: string): string {
  return COMPONENT_OVERRIDES[name]?.category ?? CATEGORY.all;
}

export function resolveStatus(name: string): ComponentStatus {
  return COMPONENT_OVERRIDES[name]?.status ?? "stable";
}

export { CATEGORY };
