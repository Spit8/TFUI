import { createId } from "./uuid";
import { createButtonLabel, createNode } from "./factory";
import type { Screen, StyleRule, TfuiProject } from "./types";
import { applyNewWindowDefaults } from "./windowDefaults";
import { t } from "../i18n";

/** Projet initial pour « Nouveau mod » : fenêtre + bouton MainModButtonArea. */
export function createModScaffoldProject(opts: {
  modId: string;
  displayName: string;
  catalogHash?: string;
}): TfuiProject {
  const { modId, displayName } = opts;
  const windowRecipe = toPascal(`${modId}_main_window`);
  const pluginRecipe = toPascal(`${modId}_mod_button`);
  // Croix, identifiant `<modId>.main`, classe, taille et marge du contenu.
  let windowRules: StyleRule[] = [];

  const window: Screen = {
    id: createId(),
    fileBase: "main_gui",
    recipeName: windowRecipe,
    kind: "window",
    state: [],
    root: (() => {
      const win = createNode("Window", windowRecipe);
      win.props.title = { kind: "literal", value: displayName };
      win.props.initialX = { kind: "literal", value: 0.15 };
      win.props.initialY = { kind: "literal", value: 0.12 };
      windowRules = applyNewWindowDefaults(win, { modId, name: "main" });
      const box = createNode("BoxLayout");
      box.props.orientation = {
        kind: "enum",
        value: "Orientation.Vertical",
      };
      box.meta.class = ["my-root"];
      const text = createNode("TextView");
      text.props.text = {
        kind: "literal",
        value: t("defaults.scaffoldPreviewText", { name: displayName }),
      };
      text.meta.class = ["font-scale-body"];
      box.slots.children = [text];
      win.slots.content = [box];
      return win;
    })(),
    previewViewport: { w: 1920, h: 1080 },
  };

  const plugin: Screen = {
    id: createId(),
    // Same script as the window so onClick can use the local recipe (useFn crashes).
    fileBase: "main_gui",
    recipeName: pluginRecipe,
    kind: "plugin",
    plugin: {
      extensionPoint: "MainModButtonAreaExtension",
      pluginName: pluginRecipe,
      order: 100,
      buttonLabel: displayName,
    },
    state: [],
    root: (() => {
      // MainModButtonArea place les plugins dans un BoxLayout horizontal :
      // la racine du plugin DOIT être un layout (sinon « Recipe child must be a layout »).
      const box = createNode("BoxLayout");
      box.props.orientation = {
        kind: "enum",
        value: "Orientation.Horizontal",
      };
      // Mirror button_react_util.makeTextButton("secondary", …) — proven in-game.
      const btn = createNode("Button");
      btn.meta.class = ["secondary"];
      btn.meta.tooltip = displayName;
      btn.props.onClick = {
        kind: "lua",
        // Same pattern as a working mod: recipes table + wapi (never shadow global api).
        code: `function()
					local wapi = game_react_globals.getDefaultWindowApi()
					if wapi == nil then
						return
					end
					wapi.addSingletonWindow(recipes.${windowRecipe}, {})
					pcall(function()
						api.gui.byId.setVisible("${modId}.main", true)
					end)
					wapi.moveSingletonWindowToFront(recipes.${windowRecipe})
				end`,
      };
      const label = createButtonLabel(displayName);
      label.meta.class = ["font-scale-body"];
      btn.slots.content = [label];
      box.slots.children = [btn];
      return box;
    })(),
    previewViewport: { w: 400, h: 80 },
  };

  return {
    schemaVersion: 1,
    mod: {
      modId,
      modRoot: "mod",
      guiDir: "gui",
    },
    screens: [window, plugin],
    styleRules: [
      {
        id: createId(),
        // Pas d’espace entre le type et la classe : c’est le BoxLayout qui la
        // porte (un espace désignerait un descendant). Pas de R::<fenêtre> :
        // ce niveau ne touche rien en jeu.
        selector: `BoxLayout!my-root`,
        props: { innerSpacing: [12, 10] },
      },
      ...windowRules,
    ],
    catalogHash: opts.catalogHash ?? "",
  };
}

function toPascal(id: string): string {
  return id
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}
