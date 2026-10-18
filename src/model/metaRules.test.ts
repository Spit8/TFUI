import { describe, expect, it } from "vitest";
import { genScript } from "../codegen/genScript";
import { createEmptyProject, createNode } from "./factory";
import { insertNode } from "./treeOps";
import { validateProject } from "./validate";

const lit = (value: boolean) => ({ kind: "literal" as const, value });

describe("meta de la fenêtre racine (Wrapper recipe must return child)", () => {
  it("refuse enabled = false sur la racine Window", () => {
    const project = createEmptyProject();
    const root = project.screens[0]!.root;
    const bad = {
      ...project,
      screens: [
        {
          ...project.screens[0]!,
          root: { ...root, meta: { class: ["window-expanded"], enabled: lit(false) } },
        },
      ],
    };
    const issues = validateProject(bad).filter((i) => i.code === "window_root_meta");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("error");
  });

  it("accepte une classe seule sur la racine", () => {
    const project = createEmptyProject();
    const root = project.screens[0]!.root;
    const ok = {
      ...project,
      screens: [{ ...project.screens[0]!, root: { ...root, meta: { class: ["x"], enabled: lit(true) } } }],
    };
    expect(validateProject(ok).some((i) => i.code === "window_root_meta")).toBe(false);
  });

  it("ajoute un onClose qui masque une fenêtre fermable qui n’en a pas", () => {
    const project = createEmptyProject();
    const s = project.screens[0]!;
    const root = {
      ...s.root,
      props: { ...s.root.props, closable: lit(true) },
      meta: { ...s.root.meta, id: "demo.main" },
    };
    const script = genScript({ ...project, screens: [{ ...s, root }] }, { ...s, root }).content;
    expect(script).toMatch(/onClose = function\(\)/);
    expect(script).toContain('api.gui.byId.setVisible("demo.main", false)');

    const noId = { ...root, meta: {} };
    const issues = validateProject({ ...project, screens: [{ ...s, root: noId }] });
    expect(issues.some((i) => i.code === "window_close_inert")).toBe(true);
  });

  it("qualifie une enum enregistrée sans son type (Vertical → Orientation.Vertical)", () => {
    let project = createEmptyProject();
    const screen = project.screens[0]!;
    const box = createNode("BoxLayout");
    box.props.orientation = { kind: "enum", value: "Vertical" };
    project = insertNode(project, screen.id, screen.root.id, "content", box);
    const script = genScript(project, project.screens[0]!).content;
    expect(script).toContain("builtin.type.Orientation.Vertical");
    expect(script).not.toMatch(/builtin\.type\.Vertical/);
  });

  it("signale une ScrollArea vide (le jeu de base n’en a jamais)", () => {
    let project = createEmptyProject();
    const screen = project.screens[0]!;
    const box = createNode("BoxLayout");
    project = insertNode(project, screen.id, screen.root.id, "content", box);
    project = insertNode(project, screen.id, box.id, "children", createNode("ScrollArea"));
    const issues = validateProject(project).filter((i) => i.code === "vanilla_never_empty");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/ScrollArea sans content/);
  });

  it("n’émet pas enabled = true (valeur par défaut)", () => {
    let project = createEmptyProject();
    const screen = project.screens[0]!;
    const box = createNode("BoxLayout");
    box.meta.enabled = lit(true);
    project = insertNode(project, screen.id, screen.root.id, "content", box);
    const script = genScript(project, project.screens[0]!).content;
    expect(script).not.toContain("enabled = true");
  });
});
