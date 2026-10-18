import { describe, expect, it } from "vitest";
import { createEmptyProject, createScreen } from "../model/factory";
import { createId } from "../model/uuid";
import { genCss } from "./genCss";

describe("genCss rules (R4)", () => {
  it("émet les règles non scopées dans chaque écran multi", () => {
    const project = createEmptyProject({ modId: "m" });
    const second = createScreen({
      recipeName: "OtherWin",
      fileBase: "other_gui",
    });
    project.screens.push(second);
    project.styleRules = [
      {
        id: "u1",
        selector: "BoxLayout !shared",
        props: { innerSpacing: [4, 4] },
      },
      {
        id: "s1",
        selector: `R::${project.screens[0].recipeName} TextView`,
        props: { color: [1, 1, 1, 1] },
      },
    ];

    const cssMain = genCss(project, project.screens[0]);
    const cssOther = genCss(project, second);
    expect(cssMain.content).toContain("BoxLayout !shared");
    expect(cssOther.content).toContain("BoxLayout !shared");
    expect(cssMain.content).toContain(`R::${project.screens[0].recipeName}`);
    expect(cssOther.content).not.toContain(
      `R::${project.screens[0].recipeName}`,
    );
  });

  it("déduplique par id, pas par sélecteur", () => {
    const project = createEmptyProject({ modId: "m" });
    const recipe = project.screens[0].recipeName;
    project.styleRules = [
      {
        id: createId(),
        selector: `R::${recipe} TextView`,
        props: { color: [1, 0, 0, 1] },
        comment: "first",
      },
      {
        id: createId(),
        selector: `R::${recipe} TextView`,
        props: { color: [0, 1, 0, 1] },
        comment: "second",
      },
    ];
    const css = genCss(project, project.screens[0]);
    expect(css.content).toContain("-- first");
    expect(css.content).toContain("-- second");
    const matches = css.content.match(/R::MainWindow TextView/g) ?? [];
    expect(matches.length).toBe(2);
  });
});
