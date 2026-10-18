import { describe, expect, it } from "vitest";
import { elementClassName, setElementStyleValue } from "../model/elementStyle";
import { createEmptyProject, createNode } from "../model/factory";
import { insertNode } from "../model/treeOps";
import { createId } from "../model/uuid";
import { genCss } from "./genCss";
import { genScript } from "./genScript";

function projectWithStyledBox() {
  let project = createEmptyProject({ modId: "m" });
  const screen = project.screens[0]!;
  const box = createNode("BoxLayout");
  project = insertNode(project, screen.id, screen.root.id, "content", box);
  project = {
    ...project,
    styleRules: [
      {
        id: "shared",
        selector: `R::${screen.recipeName} BoxLayout`,
        props: { padding: [9, 9, 9, 9] },
      },
    ],
  };
  project = setElementStyleValue(project, box.id, "hover", "color", [1, 0, 0, 1], createId);
  project = setElementStyleValue(project, box.id, null, "padding", [1, 2, 3, 4], createId);
  return { project, screen: project.screens[0]!, box };
}

describe("genCss — style par élément", () => {
  it("émet la règle de l’élément après les classes partagées, Normal puis états", () => {
    const { project, screen, box } = projectWithStyledBox();
    const css = genCss(project, screen).content;
    const cls = elementClassName(box.id);
    const shared = css.indexOf(`R::${screen.recipeName} BoxLayout`);
    const normal = css.indexOf(`a("BoxLayout!${cls}"`);
    const hover = css.indexOf(`a("BoxLayout!${cls}:hover"`);
    expect(shared).toBeGreaterThanOrEqual(0);
    expect(normal).toBeGreaterThan(shared);
    expect(hover).toBeGreaterThan(normal);
  });

  it("ajoute la classe tfui-… au nœud dans le .script.lua", () => {
    const { project, screen, box } = projectWithStyledBox();
    const script = genScript(project, screen).content;
    expect(script).toContain(`class = "${elementClassName(box.id)}"`);
    expect(script).not.toContain("styleSheet");
  });
});
