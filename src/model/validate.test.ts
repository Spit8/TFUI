import { describe, expect, it } from "vitest";
import { createEmptyProject, createNode } from "./factory";
import { createModScaffoldProject } from "./modProject";
import { insertNode } from "./treeOps";
import { validateProject } from "./validate";

describe("validateProject", () => {
  it("accepte Window → BoxLayout → 3 TextView", () => {
    let project = createEmptyProject();
    const screen = project.screens[0];
    const box = createNode("BoxLayout");
    project = insertNode(project, screen.id, screen.root.id, "content", box);
    for (let i = 0; i < 3; i++) {
      project = insertNode(
        project,
        screen.id,
        box.id,
        "children",
        createNode("TextView"),
      );
    }
    const issues = validateProject(project);
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("signale BoxLayout children XOR child", () => {
    let project = createEmptyProject();
    const screen = project.screens[0];
    const box = createNode("BoxLayout");
    project = insertNode(project, screen.id, screen.root.id, "content", box);
    project = insertNode(
      project,
      screen.id,
      box.id,
      "children",
      createNode("TextView", "A"),
    );
    // force child slot
    project = {
      ...project,
      screens: project.screens.map((s) =>
        s.id !== screen.id
          ? s
          : {
              ...s,
              root: {
                ...s.root,
                slots: {
                  ...s.root.slots,
                  content: [
                    {
                      ...box,
                      slots: {
                        children: [createNode("TextView", "A")],
                        child: [createNode("TextView", "B")],
                      },
                    },
                  ],
                },
              },
            },
      ),
    };
    // Fix ids to match inserted box
    const issues = validateProject(project);
    expect(issues.some((i) => i.code === "boxlayout_xor")).toBe(true);
  });

  it("signale parent invalide AbsoluteLayoutChild", () => {
    let project = createEmptyProject();
    const screen = project.screens[0];
    const box = createNode("BoxLayout");
    project = insertNode(project, screen.id, screen.root.id, "content", box);
    project = insertNode(
      project,
      screen.id,
      box.id,
      "children",
      createNode("AbsoluteLayoutChild"),
    );
    const issues = validateProject(project);
    expect(issues.some((i) => i.code === "invalid_parent")).toBe(true);
  });

  it("signale initialX hors [0,1]", () => {
    const project = createEmptyProject();
    project.screens[0].root.props.initialX = { kind: "literal", value: 2 };
    const issues = validateProject(project);
    expect(issues.some((i) => i.code === "initial_xy_range")).toBe(true);
  });

  it("signale recipeName dupliqué", () => {
    const project = createEmptyProject();
    const second = structuredClone(project.screens[0]);
    second.id = "screen-2";
    second.root = createNode("Window");
    project.screens.push(second);
    const issues = validateProject(project);
    expect(issues.some((i) => i.code === "duplicate_recipe_name")).toBe(true);
  });

  it("plugin : racine non-layout → erreur ; scaffold OK", () => {
    const bad = createModScaffoldProject({
      modId: "tfui_sandbox",
      displayName: "S",
    });
    const plugin = bad.screens.find((s) => s.kind === "plugin")!;
    expect(plugin.root.type).toBe("BoxLayout");
    expect(
      validateProject(bad).some((i) => i.code === "plugin_root_must_be_layout"),
    ).toBe(false);

    plugin.root = createNode("Button");
    expect(
      validateProject(bad).some((i) => i.code === "plugin_root_must_be_layout"),
    ).toBe(true);
  });

  it("refuse un layout en item d’onglet, en contenu de ScrollArea ; exige un layout dans Component", () => {
    let project = createEmptyProject();
    const screen = project.screens[0]!;
    const root = createNode("BoxLayout");
    project = insertNode(project, screen.id, screen.root.id, "content", root);
    const tabs = createNode("TabWidget");
    const tab = createNode("TabWidgetChild");
    tab.slots.item = [createNode("BoxLayout")];
    tabs.slots.tabs = [tab];
    const scroll = createNode("ScrollArea");
    scroll.slots.content = [createNode("BoxLayout")];
    const comp = createNode("Component");
    comp.slots.layout = [createNode("TextView")];
    const okComp = createNode("Component");
    okComp.slots.layout = [createNode("BoxLayout")];
    const list = createNode("List");
    list.slots.children = [createNode("BoxLayout"), createNode("TextView")];
    for (const n of [tabs, scroll, comp, okComp, list]) project = insertNode(project, screen.id, root.id, "children", n);
    const codes = validateProject(project).filter((i) => i.code === "slot_layout_rule");
    expect(codes).toHaveLength(4);
  });

  it("signale une couleur de palette inconnue", () => {
    const project = createModScaffoldProject({ modId: "m", displayName: "M", catalogHash: "" });
    project.styleRules.push({ id: "r", selector: "TextView!x", props: { color: { kind: "palette", name: "Base" } } });
    const names = new Set(["BaseMedium"]);
    expect(validateProject(project, undefined, undefined, names).some((i) => i.code === "palette_unknown")).toBe(true);
    expect(validateProject(project, undefined, undefined, new Set(["Base"])).some((i) => i.code === "palette_unknown")).toBe(false);
  });

  it("signale un enfant jamais vu en vanilla (ProgressBar en cellule) et indicatorsScrollable sur un onglet latéral", () => {
    let project = createEmptyProject();
    const screen = project.screens[0]!;
    const root = createNode("BoxLayout");
    project = insertNode(project, screen.id, screen.root.id, "content", root);
    const table = createNode("TableLayout");
    const row = createNode("Row");
    row.slots.cells = [createNode("ProgressBar"), createNode("TextView")];
    table.slots.rows = [row];
    const tabs = createNode("TabWidget");
    tabs.props.orientation = { kind: "enum", value: "TabOrientation.West" };
    tabs.props.indicatorsScrollable = { kind: "literal", value: true };
    for (const n of [table, tabs]) project = insertNode(project, screen.id, root.id, "children", n);
    const issues = validateProject(project);
    expect(issues.filter((i) => i.code === "vanilla_unseen_child")).toHaveLength(1);
    expect(issues.some((i) => i.code === "tabs_scrollable_orientation")).toBe(true);
  });

  it("signale la prop size d’une ImageView sans données brutes (sans effet sur l’affichage)", () => {
    let project = createEmptyProject();
    const screen = project.screens[0]!;
    const root = createNode("BoxLayout");
    project = insertNode(project, screen.id, screen.root.id, "content", root);
    const img = createNode("ImageView");
    img.props.path = { kind: "literal", value: "::/gui/x.tga" };
    img.props.size = { kind: "literal", value: [48, 48] };
    const raw = createNode("ImageView");
    raw.props.size = { kind: "literal", value: [64, 32] };
    raw.props.data_native = { kind: "lua", code: "image.image_native" };
    for (const n of [img, raw]) project = insertNode(project, screen.id, root.id, "children", n);
    const hits = validateProject(project).filter((i) => i.code === "imageview_size_prop");
    expect(hits.map((i) => i.nodeId)).toEqual([img.id]);
  });
});

