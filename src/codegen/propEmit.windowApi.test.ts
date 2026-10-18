import { describe, expect, it } from "vitest";
import { createModScaffoldProject } from "../model/modProject";
import { generateProject } from "./generate";
import { createNode } from "../model/factory";
import type { Screen, TfuiProject } from "../model/types";
import { genScript } from "./genScript";
import {
  emitPropValue,
  isEmittablePropValue,
  rewriteWindowOpenLua,
} from "./propEmit";

describe("emitPropValue WindowAPI", () => {
  it("réécrit :addSingletonWindow en .addSingletonWindow", () => {
    const out = emitPropValue({
      kind: "lua",
      code: "function() api:addSingletonWindow(r, {}) end",
    });
    expect(out).toContain("wapi.addSingletonWindow");
    expect(out).not.toContain("api:addSingletonWindow");
  });

  it("réécrit ug_require(script).Recipe en recipes.Recipe + wapi", () => {
    const src = `function()
					local game_react_globals = ug_require "::/gui/main/game_react_globals.tl"
					local main = ug_require "tfui_sandbox::/gui/main_gui.script"
					local api = game_react_globals.getDefaultWindowApi()
					if api ~= nil then
						api.addSingletonWindow(main.TfuiSandboxMainWindow, {})
					end
				end`;
    const { code: out, applied } = rewriteWindowOpenLua(src);
    expect(out).toContain(
      "wapi.addSingletonWindow(recipes.TfuiSandboxMainWindow, {})",
    );
    expect(out).not.toContain("main.TfuiSandboxMainWindow");
    expect(out).not.toContain("util.useFn");
    expect(out).not.toContain("local api =");
    expect(applied.map((a) => a.id)).toContain("main_Recipe_to_recipes");
    expect(applied.map((a) => a.id)).toContain("api_to_wapi_local");
  });

  it("réécrit util.useFn(@Recipe) en recipes.Recipe", () => {
    const src = `function()
					local util = ug_require "/scripts/util.tl"
					local recipe = util.useFn("tfui_sandbox::/gui/main_gui.script@TfuiSandboxMainWindow")
					local api = game_react_globals.getDefaultWindowApi()
					if api ~= nil then
						api.addSingletonWindow(recipe, {})
					end
				end`;
    const { code: out, applied } = rewriteWindowOpenLua(src);
    expect(out).toContain(
      "wapi.addSingletonWindow(recipes.TfuiSandboxMainWindow, {})",
    );
    expect(out).not.toContain("util.useFn");
    expect(applied.map((a) => a.id)).toContain("util_useFn_to_recipes");
  });
});

describe("empty handler props", () => {
  it("n’émet pas onClose = , pour un handler vide", () => {
    expect(
      isEmittablePropValue({ kind: "handler", fn: "" }),
    ).toBe(false);
    expect(
      isEmittablePropValue({ kind: "lua", code: "   " }),
    ).toBe(false);

    const win = createNode("Window", "EmptyCloseWin");
    win.meta.id = "mod.main";
    win.props.title = { kind: "literal", value: "T" };
    win.props.onClose = { kind: "handler", fn: "" };
    win.slots.content = [createNode("BoxLayout")];
    const screen: Screen = {
      id: "s1",
      fileBase: "main_gui",
      recipeName: "EmptyCloseWin",
      kind: "window",
      state: [],
      root: win,
      previewViewport: { w: 800, h: 600 },
    };
    const project: TfuiProject = {
      schemaVersion: 1,
      mod: { modId: "m", modRoot: "mod", guiDir: "gui" },
      screens: [screen],
      styleRules: [],
      catalogHash: "",
    };
    const out = genScript(project, screen).content;
    expect(out).not.toContain("onClose");
    expect(out).not.toMatch(/=\s*,/);
  });
});

describe("scaffold co-localisation", () => {
  it("émet fenêtre + plugin (recipes + Window.id + wapi)", () => {
    const project = createModScaffoldProject({
      modId: "tfui_sandbox",
      displayName: "Sandbox",
    });
    const files = generateProject(project);
    const scripts = files.filter((f) => f.kind === "script");
    expect(scripts).toHaveLength(1);
    expect(scripts[0].path).toBe("main_gui.script.lua");
    expect(scripts[0].content).toContain("local recipes = {}");
    expect(scripts[0].content).toContain("recipes.TfuiSandboxMainWindow =");
    expect(scripts[0].content).toContain("recipes.TfuiSandboxModButton =");
    expect(scripts[0].content).toContain('id = "tfui_sandbox.main"');
    expect(scripts[0].content).not.toMatch(/meta = \{\s*id =/);
    expect(scripts[0].content).toContain(
      "wapi.addSingletonWindow(recipes.TfuiSandboxMainWindow, {})",
    );
    expect(scripts[0].content).not.toContain("util.useFn");
    expect(scripts[0].content).not.toContain(
      "local api = game_react_globals.getDefaultWindowApi()",
    );
    expect(scripts[0].content).toContain(
      'ug_require "::/gui/main/game_react_globals.tl"',
    );

    const res = files.find((f) => f.kind === "res");
    expect(res?.content).toContain(
      'filePath = "tfui_sandbox::/gui/main_gui.script@TfuiSandboxModButton"',
    );

    const css = files.find((f) => f.kind === "css");
    expect(css?.content).toContain("!window-expanded");
  });
});
