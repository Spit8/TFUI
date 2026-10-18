import { describe, expect, it } from "vitest";
import { createModScaffoldProject } from "../model/modProject";
import { createEmptyProject, createNode } from "../model/factory";
import {
  collectGenerationNotices,
  describeEffectiveFileBase,
} from "./generate";
import {
  REWRITE_RULE_IDS,
  rewriteWindowOpenLua,
} from "./propEmit";

/** Entrée minimale qui déclenche chaque règle isolément (autant que possible). */
const RULE_INPUTS: Record<string, string> = {
  colon_addSingletonWindow: "api:addSingletonWindow(r, {})",
  colon_addWindow: "api:addWindow(r, {})",
  colon_moveSingletonWindowToFront: "api:moveSingletonWindowToFront(r)",
  strip_local_util: 'function()\n\tlocal util = ug_require "/scripts/util.tl"\nend',
  util_useFn_to_recipes:
    'util.useFn("mod::/gui/x.script@MyWin")',
  strip_local_main:
    'function()\n\tlocal main = ug_require "mod::/gui/x.script"\nend',
  main_Recipe_to_recipes: "addSingletonWindow(main.MyWin,",
  strip_api_nil_guard:
    'function()\n\tif api == nil then\n\t\tprint("[tfui] getDefaultWindowApi() is nil")\n\t\treturn\n\tend\nend',
  strip_recipe_nil_guard:
    'function()\n\tif recipe == nil then\n\t\tprint("[tfui] missing")\n\t\treturn\n\tend\nend',
  local_recipe_to_recipes:
    "function()\n\tlocal recipe = FooBar\n\taddSingletonWindow(recipe, {})\nend",
  bare_Recipe_to_recipes: "addSingletonWindow(FooBar,",
  strip_local_game_react_globals:
    'function()\n\tlocal game_react_globals = ug_require "::/gui/main/game_react_globals.tl"\nend',
  api_to_wapi_local:
    "local api = game_react_globals.getDefaultWindowApi()",
  api_addSingleton_to_wapi: "api.addSingletonWindow(r, {})",
  api_moveToFront_to_wapi: "api.moveSingletonWindowToFront(r)",
  if_api_and_recipe_to_wapi: "if api ~= nil and recipe ~= nil then",
  if_api_ne_nil_to_wapi: "if api ~= nil then",
  if_api_eq_nil_to_wapi: "if api == nil then",
};

describe("rewrite rules 1:1", () => {
  it("couvre tous les ids déclarés", () => {
    expect(Object.keys(RULE_INPUTS).sort()).toEqual(
      [...REWRITE_RULE_IDS].sort(),
    );
  });

  for (const id of REWRITE_RULE_IDS) {
    it(`applique la règle ${id}`, () => {
      const input = RULE_INPUTS[id]!;
      const { applied, code } = rewriteWindowOpenLua(input);
      expect(applied.map((a) => a.id)).toContain(id);
      expect(code).not.toBe(input);
    });
  }
});

describe("collectGenerationNotices", () => {
  it("signale les réécritures sur une prop lua", () => {
    const project = createEmptyProject();
    const screen = project.screens[0]!;
    const btn = createNode("TextButton", "Open");
    btn.props.onClick = {
      kind: "lua",
      code: "function() api:addSingletonWindow(r, {}) end",
    };
    screen.root.slots.content = [btn];
    const notices = collectGenerationNotices(project);
    expect(notices.some((n) => n.propKey === "onClick")).toBe(true);
    expect(notices.some((n) => n.nodeId === btn.id)).toBe(true);
  });

  it("signale la co-localisation plugin + fenêtre", () => {
    const project = createModScaffoldProject({
      modId: "tfui_sandbox",
      displayName: "Sandbox",
    });
    const plugin = project.screens.find((s) => s.kind === "plugin")!;
    const eff = describeEffectiveFileBase(plugin, project);
    expect(eff.colocated).toBeDefined();
    const notices = collectGenerationNotices(project);
    expect(notices.some((n) => n.id === "coloc:plugin_window")).toBe(true);
  });
});
