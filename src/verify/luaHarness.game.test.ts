import { beforeAll, describe, expect, it } from "vitest";
import { getActiveCatalog } from "../catalog/activeCatalog";
import { FIXTURES_SKIP_MESSAGE, fixturesLinked } from "../catalog/fixtures";
import { generateProject } from "../codegen/generate";
import { genHandlersFile, handlersModulePath } from "../codegen/handlersFile";
import { setElementStyleValue } from "../model/elementStyle";
import { createNode, createStarterNode } from "../model/factory";
import { createModScaffoldProject } from "../model/modProject";
import { createId } from "../model/uuid";
import type { TfuiProject, UiNode } from "../model/types";
import { readGameRuntimeFromFixtures } from "./fixtureRuntime";
import { runGeneratedGui, type HarnessReport } from "./luaHarness";

let gameFiles: Record<string, string> = {};

async function run(project: TfuiProject): Promise<HarnessReport> {
  const catalog = getActiveCatalog();
  if (!catalog) throw new Error("catalogue absent");
  return runGeneratedGui({ files: generateProject(project), catalog, gameFiles });
}

function errors(report: HarnessReport): string[] {
  return report.issues.filter((i) => i.severity === "error").map((i) => i.message);
}

/** Remplace la racine du premier écran fenêtre. */
function withWindowRoot(project: TfuiProject, patch: (root: UiNode) => UiNode): TfuiProject {
  return {
    ...project,
    screens: project.screens.map((s) => (s.kind === "window" ? { ...s, root: patch(s.root) } : s)),
  };
}

describe.skipIf(!fixturesLinked())("banc d’exécution Lua (runtime React du jeu)", () => {
  beforeAll(async () => {
    gameFiles = await readGameRuntimeFromFixtures();
  });

  it(FIXTURES_SKIP_MESSAGE, () => {
    expect(Object.keys(gameFiles)).toHaveLength(3);
  });

  it("le projet de base d’un nouveau mod s’exécute sans erreur (bouton → fenêtre)", async () => {
    const project = createModScaffoldProject({ modId: "tfui_test", displayName: "Test", catalogHash: "" });
    const report = await run(project);
    expect(errors(report)).toEqual([]);
    // plugin + bouton + fenêtre ouverte par le clic
    expect(report.rendered).toBeGreaterThan(4);
  });

  it("charge le fichier handlers du mod (chemin <modId>::/gui/…) ; absent → erreur", async () => {
    const project = withWindowRoot(
      createModScaffoldProject({ modId: "tfui_test", displayName: "Test", catalogHash: "" }),
      (root) => ({ ...root, props: { ...root.props, onClose: { kind: "handler", fn: "onFermer" } } }),
    );
    const files = generateProject(project);
    const script = files.find((f) => f.kind === "script" && f.handlers?.includes("onFermer"))!;
    const fileBase = script.path.replace(/\.script\.lua$/, "");
    const modFiles = {
      [handlersModulePath("tfui_test", project.mod.guiDir, fileBase)]: genHandlersFile({ fileBase, handlerNames: ["onFermer"] }),
    };
    const catalog = getActiveCatalog()!;
    const ok = await runGeneratedGui({ files, catalog, gameFiles, modFiles });
    expect(errors(ok)).toEqual([]);
    const missing = await runGeneratedGui({ files, catalog, gameFiles });
    expect(errors(missing).join("\n")).toMatch(/handlers\.lua/);
  });

  it("un bouton inséré depuis la palette (couleurs colorDefault) s’exécute sans erreur", async () => {
    const { node, styles } = createStarterNode("Button");
    let project = withWindowRoot(
      createModScaffoldProject({ modId: "tfui_test", displayName: "Test", catalogHash: "" }),
      (root) => ({ ...root, slots: { ...root.slots, content: [...(root.slots.content ?? []), node] } }),
    );
    for (const st of styles) project = setElementStyleValue(project, st.nodeId, null, st.key, st.value, createId);
    const report = await run(project);
    expect(errors(report)).toEqual([]);
  });

  it("une CheckBox s’exécute (état du hook lu par :old(), comme dans builtin.lua)", async () => {
    const box = createStarterNode("CheckBox").node;
    const project = withWindowRoot(
      createModScaffoldProject({ modId: "tfui_test", displayName: "Test", catalogHash: "" }),
      (root) => {
        // Dans la BoxLayout racine (le slot content de la Window est unique).
        const layout = root.slots.content![0]!;
        const content = [{ ...layout, slots: { ...layout.slots, children: [...(layout.slots.children ?? []), box] } }];
        return { ...root, slots: { ...root.slots, content } };
      },
    );
    const report = await run(project);
    expect(report.rendered).toBeGreaterThan(5);
    expect(errors(report)).toEqual([]);
  });

  it("des onglets créés depuis la palette (titre dans indicator) s’exécutent", async () => {
    const tabs = createNode("TabWidget");
    tabs.slots.tabs = [1, 2].map((n) => {
      const tab = createStarterNode("TabWidgetChild").node;
      tab.props.value = { kind: "literal", value: n };
      const body = createNode("TextView");
      body.props.text = { kind: "literal", value: `Contenu ${n}` };
      tab.slots.item = [body];
      return tab;
    });
    const project = withWindowRoot(
      createModScaffoldProject({ modId: "tfui_test", displayName: "Test", catalogHash: "" }),
      (root) => {
        const layout = root.slots.content![0]!;
        const content = [{ ...layout, slots: { ...layout.slots, children: [...(layout.slots.children ?? []), tabs] } }];
        return { ...root, slots: { ...root.slots, content } };
      },
    );
    const report = await run(project);
    expect(errors(report)).toEqual([]);
  });

  it("reproduit le crash « Wrapper recipe must return child » (meta.enabled sur la Window)", async () => {
    const project = withWindowRoot(
      createModScaffoldProject({ modId: "tfui_test", displayName: "Test", catalogHash: "" }),
      (root) => ({ ...root, meta: { ...root.meta, enabled: { kind: "literal", value: false } } }),
    );
    const report = await run(project);
    expect(errors(report).join("\n")).toMatch(/Wrapper recipe must return child/);
  });

  it("signale une prop inexistante comme le jeu (Could not assign value to userdata)", async () => {
    const project = withWindowRoot(
      createModScaffoldProject({ modId: "tfui_test", displayName: "Test", catalogHash: "" }),
      (root) => ({ ...root, props: { ...root.props, notAWindowProp: { kind: "literal", value: 3 } } }),
    );
    const report = await run(project);
    expect(errors(report).join("\n")).toMatch(/notAWindowProp/);
  });

  it("signale builtin.type.Vertical (enum non qualifiée, nil en jeu)", async () => {
    const project = withWindowRoot(
      createModScaffoldProject({ modId: "tfui_test", displayName: "Test", catalogHash: "" }),
      (root) => ({ ...root, props: { ...root.props, inputActionBubbleUpFilter: { kind: "lua", code: "builtin.type.Vertical" } } }),
    );
    const report = await run(project);
    expect(errors(report).join("\n")).toMatch(/builtin\.type\.Vertical n’existe pas/);
  });

  it("signale un type de valeur faux", async () => {
    const project = withWindowRoot(
      createModScaffoldProject({ modId: "tfui_test", displayName: "Test", catalogHash: "" }),
      (root) => ({ ...root, props: { ...root.props, title: { kind: "literal", value: 42 } } }),
    );
    const report = await run(project);
    expect(errors(report).join("\n")).toMatch(/title/);
  });

  it("une ImageView avec size s’exécute (Vec2i émis par api.type.Vec2i.new)", async () => {
    const image: UiNode = {
      ...createStarterNode("ImageView").node,
      props: { path: { kind: "literal", value: "::/gui/x.tga" }, size: { kind: "literal", value: [15, 15] } },
    };
    const project = withWindowRoot(
      createModScaffoldProject({ modId: "tfui_test", displayName: "Test", catalogHash: "" }),
      (root) => {
        const layout = root.slots.content![0]!;
        const content = [{ ...layout, slots: { ...layout.slots, children: [...(layout.slots.children ?? []), image] } }];
        return { ...root, slots: { ...root.slots, content } };
      },
    );
    const files = generateProject(project);
    expect(files.find((f) => f.kind === "script")!.content).toContain("size = api.type.Vec2i.new(15, 15),");
    const report = await run(project);
    expect(errors(report)).toEqual([]);
  });

  it("signale une table Lua passée à un champ vecteur (refusée par le jeu)", async () => {
    const image: UiNode = {
      ...createStarterNode("ImageView").node,
      props: { size: { kind: "lua", code: "{ 15, 15 }" } },
    };
    const project = withWindowRoot(
      createModScaffoldProject({ modId: "tfui_test", displayName: "Test", catalogHash: "" }),
      (root) => {
        const layout = root.slots.content![0]!;
        const content = [{ ...layout, slots: { ...layout.slots, children: [...(layout.slots.children ?? []), image] } }];
        return { ...root, slots: { ...root.slots, content } };
      },
    );
    const report = await run(project);
    expect(errors(report).join("\n")).toMatch(/ImageView\.size.*Vec2i/);
  });

  it("un espaceur de la palette (Component vide, classe vanilla) s’exécute", async () => {
    const spacer = createStarterNode("Component", getActiveCatalog(), undefined, "HorizontalSpacer", "Espaceur").node;
    const project = withWindowRoot(
      createModScaffoldProject({ modId: "tfui_test", displayName: "Test", catalogHash: "" }),
      (root) => {
        const layout = root.slots.content![0]!;
        const content = [{ ...layout, slots: { ...layout.slots, children: [...(layout.slots.children ?? []), spacer] } }];
        return { ...root, slots: { ...root.slots, content } };
      },
    );
    const script = generateProject(project).find((f) => f.kind === "script")!.content;
    expect(script).toMatch(/builtin\.Component \{\s*meta = \{\s*class = "horizontal-spacer",\s*\},\s*\}/);
    const report = await run(project);
    expect(errors(report)).toEqual([]);
  });

  it("AbsoluteLayout : enfants positionnels (builtin.d.tl function({TreeNodeId})), sans meta", async () => {
    const abs = createStarterNode("AbsoluteLayout").node;
    const child = createStarterNode("AbsoluteLayoutChild").node;
    const label = { ...createStarterNode("TextView").node, props: { text: { kind: "literal" as const, value: "x" } } };
    child.slots.item = [label];
    abs.slots.children = [child];
    abs.meta.class = ["ignored"];
    const project = withWindowRoot(
      createModScaffoldProject({ modId: "tfui_test", displayName: "Test", catalogHash: "" }),
      (root) => {
        const layout = root.slots.content![0]!;
        const content = [{ ...layout, slots: { ...layout.slots, children: [...(layout.slots.children ?? []), abs] } }];
        return { ...root, slots: { ...root.slots, content } };
      },
    );
    const script = generateProject(project).find((f) => f.kind === "script")!.content;
    expect(script).toMatch(/builtin\.AbsoluteLayout \{\s*builtin\.AbsoluteLayoutChild \{/);
    expect(script).not.toMatch(/class = "ignored"/);
    const report = await run(project);
    expect(errors(report)).toEqual([]);
  });

  it("signale un layout en item d’onglet (« TabWidgetChild item must not be a Layout »)", async () => {
    const tabs = createStarterNode("TabWidget").node;
    const tab = createStarterNode("TabWidgetChild").node;
    tab.props.value = { kind: "literal", value: 1 };
    tab.slots.indicator = [{ ...createStarterNode("TextView").node, props: { text: { kind: "literal", value: "A" } } }];
    tab.slots.item = [createStarterNode("BoxLayout").node];
    tabs.slots.tabs = [tab];
    const project = withWindowRoot(
      createModScaffoldProject({ modId: "tfui_test", displayName: "Test", catalogHash: "" }),
      (root) => {
        const layout = root.slots.content![0]!;
        const content = [{ ...layout, slots: { ...layout.slots, children: [...(layout.slots.children ?? []), tabs] } }];
        return { ...root, slots: { ...root.slots, content } };
      },
    );
    const report = await run(project);
    expect(errors(report).join("\n")).toMatch(/TabWidgetChild item must not be a Layout/);
  });

  it("signale une couleur de palette inconnue quand la palette est connue", async () => {
    const project = createModScaffoldProject({ modId: "tfui_test", displayName: "Test", catalogHash: "" });
    const rootId = project.screens[0]!.root.id;
    const withStyle = setElementStyleValue(project, rootId, null, "color", { kind: "palette", name: "Base", alpha: 0.5 }, createId);
    const catalog = getActiveCatalog()!;
    const files = generateProject(withStyle);
    const unknown = await runGeneratedGui({ files, catalog, gameFiles, paletteNames: ["BaseMedium"] });
    expect(errors(unknown).join("\n")).toMatch(/Base/);
    const known = await runGeneratedGui({ files, catalog, gameFiles, paletteNames: ["Base"] });
    expect(errors(known)).toEqual([]);
  });
});
