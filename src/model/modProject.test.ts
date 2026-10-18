import { describe, expect, it } from "vitest";
import { genCss } from "../codegen/genCss";
import { generateProject } from "../codegen/generate";
import { validateLuaContent } from "../codegen/validateLua";
import { createEmptyProject } from "./factory";
import { createModScaffoldProject } from "./modProject";
import { addScreen } from "./screenOps";
import type { Screen, TfuiProject } from "./types";
import { closeButtonInert, needsDefaultOnClose } from "./metaRules";

/** Fenêtre neuve : croix qui ferme en jeu, classe, taille et marge du contenu. */
function expectNewWindowDefaults(project: TfuiProject, screen: Screen, id: string, cls: string) {
  const win = screen.root;
  expect(win.meta.id).toBe(id);
  expect(win.meta.class).toContain(cls);
  expect(win.props.closable).toEqual({ kind: "literal", value: true });
  expect(win.props.expanded).toEqual({ kind: "literal", value: true });
  expect(needsDefaultOnClose(win)).toBe(true);
  expect(closeButtonInert(win)).toBe(false);
  const props = (sel: string) => project.styleRules.find((r) => r.selector === sel)?.props;
  expect(props(`Window!${cls}!window-expanded`)).toEqual({ size: [720, 420] });
  expect(props(`Window!${cls} Window::Content`)).toEqual({ padding: [8, 8, 8, 8] });
  // Jamais sur la Window elle-même : la barre de titre et la croix bougeraient.
  expect(project.styleRules.some((r) => r.selector === `Window!${cls}` && r.props.padding)).toBe(false);

  const css = genCss(project, screen).content;
  expect(css).toContain(`a("Window!${cls} Window::Content", {\n\t\tpadding = { 8, 8, 8, 8 },\n\t})`);
  expect(validateLuaContent(`${screen.fileBase}.css.lua`, css)).toEqual([]);
  const script = generateProject(project).find((f) => f.kind === "script" && f.content.includes(`id = "${id}"`));
  expect(script?.content).toContain(`api.gui.byId.setVisible("${id}", false)`);
}

describe("réglages de toute nouvelle fenêtre", () => {
  it("nouveau mod", () => {
    const project = createModScaffoldProject({ modId: "demo_mod", displayName: "Demo" });
    const window = project.screens.find((s) => s.kind === "window")!;
    expectNewWindowDefaults(project, window, "demo_mod.main", "demo-mod-main-window");
  });

  it("nouveau projet", () => {
    const project = createEmptyProject({ modId: "demo_mod" });
    expectNewWindowDefaults(project, project.screens[0]!, "demo_mod.main_window", "demo-mod-main-window-window");
  });

  it("nouvel écran fenêtre : identifiant et classe uniques", () => {
    let project = createEmptyProject({ modId: "demo_mod" });
    for (const n of [1, 2]) {
      const r = addScreen(project, "window");
      if (!r.ok) throw new Error(r.reason);
      project = r.project;
      const screen = project.screens.find((s) => s.id === r.screenId)!;
      const suffix = n === 1 ? "" : "_2";
      const cls = n === 1 ? "demo-mod-new-window-window" : "demo-mod-new-window-2-window";
      expectNewWindowDefaults(project, screen, `demo_mod.new_window${suffix}`, cls);
    }
  });

  it("un écran recette ou plugin ne reçoit rien", () => {
    const project = createEmptyProject({ modId: "demo_mod" });
    const r = addScreen(project, "recipe");
    if (!r.ok) throw new Error(r.reason);
    expect(r.project.styleRules).toHaveLength(project.styleRules.length);
  });
});
