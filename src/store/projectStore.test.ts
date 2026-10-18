import { beforeEach, describe, expect, it } from "vitest";
import { useProjectStore } from "./projectStore";
import { MAX_UNDO } from "./undoStack";

describe("projectStore", () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: null,
      projectPath: null,
      selectedNodeId: null,
      selectedScreenId: null,
      hoveredNodeId: null,
      stateSim: {},
      dirty: false,
      savedProject: null,
      lastDropError: null,
      history: { undo: [], redo: [] },
      sessions: [],
      activeSessionId: null,
    });
  });

  it("« modifié » disparaît quand un undo revient à l’état enregistré", () => {
    const store = useProjectStore.getState();
    store.newProject("hash1");
    store.markSaved("C:/sandbox/a.tfui.json");
    const rootId = useProjectStore.getState().project!.screens[0].root.id;
    expect(useProjectStore.getState().dirty).toBe(false);

    store.insertChild(rootId, "BoxLayout");
    expect(useProjectStore.getState().dirty).toBe(true);

    store.undo();
    expect(useProjectStore.getState().dirty).toBe(false);

    store.redo();
    expect(useProjectStore.getState().dirty).toBe(true);

    store.markSaved("C:/sandbox/a.tfui.json");
    store.undo();
    expect(useProjectStore.getState().dirty).toBe(true);
  });

  it("newProject + insertChild + undo/redo", () => {
    const store = useProjectStore.getState();
    store.newProject("hash1");
    const project = useProjectStore.getState().project!;
    const rootId = project.screens[0].root.id;

    expect(store.insertChild(rootId, "BoxLayout")).toBe(true);
    const boxId = useProjectStore.getState().selectedNodeId!;
    expect(useProjectStore.getState().project!.screens[0].root.slots.content).toHaveLength(
      1,
    );

    expect(store.insertChild(boxId, "TextView")).toBe(true);
    expect(store.insertChild(boxId, "TextView")).toBe(true);
    expect(store.insertChild(boxId, "TextView")).toBe(true);

    const box = useProjectStore
      .getState()
      .project!.screens[0].root.slots.content[0];
    expect(box.slots.children).toHaveLength(3);

    useProjectStore.getState().undo();
    expect(
      useProjectStore.getState().project!.screens[0].root.slots.content[0]
        .slots.children,
    ).toHaveLength(2);

    useProjectStore.getState().redo();
    expect(
      useProjectStore.getState().project!.screens[0].root.slots.content[0]
        .slots.children,
    ).toHaveLength(3);
  });

  it("refuse insert avec raison", () => {
    useProjectStore.getState().newProject();
    const rootId = useProjectStore.getState().project!.screens[0].root.id;
    useProjectStore.getState().insertChild(rootId, "BoxLayout");
    const boxId = useProjectStore.getState().selectedNodeId!;
    const ok = useProjectStore.getState().insertChild(boxId, "AbsoluteLayoutChild");
    expect(ok).toBe(false);
    expect(useProjectStore.getState().lastDropError).toMatch(/AbsoluteLayout/);
  });

  it("limite undo à MAX_UNDO", () => {
    useProjectStore.getState().newProject();
    const rootId = useProjectStore.getState().project!.screens[0].root.id;
    useProjectStore.getState().insertChild(rootId, "BoxLayout");
    const boxId = useProjectStore.getState().selectedNodeId!;
    for (let i = 0; i < MAX_UNDO + 20; i++) {
      useProjectStore.getState().insertChild(boxId, "TextView");
    }
    expect(useProjectStore.getState().history.undo.length).toBeLessThanOrEqual(
      MAX_UNDO,
    );
  });

  it("round-trip JSON via loadFromJson", () => {
    useProjectStore.getState().newProject("abc");
    const json = JSON.stringify(useProjectStore.getState().project, null, 2);
    useProjectStore.getState().newProject("other");
    const result = useProjectStore.getState().loadFromJson(json, "/tmp/x.tfui.json");
    expect(result.ok).toBe(true);
    expect(useProjectStore.getState().project!.catalogHash).toBe("abc");
    expect(useProjectStore.getState().projectPath).toBe("/tmp/x.tfui.json");
  });

  it("setNodeStyle crée, modifie puis retire la règle de l’élément", () => {
    useProjectStore.getState().newProject();
    const rootId = useProjectStore.getState().project!.screens[0].root.id;
    const store = useProjectStore.getState();

    store.setNodeStyle(rootId, null, "size", [100, 80]);
    store.setNodeStyle(rootId, "hover", "color", [1, 0, 0, 1]);
    // Règles d’élément seulement (la fenêtre neuve a ses classes partagées).
    const own = () => useProjectStore.getState().project!.styleRules.filter((r) => r.ownerNodeId);
    let rules = own();
    expect(rules).toHaveLength(2);
    expect(rules.every((r) => r.ownerNodeId === rootId)).toBe(true);
    expect(rules.find((r) => !r.state)?.props.size).toEqual([100, 80]);

    store.setNodeStyle(rootId, "hover", "color", undefined);
    rules = own();
    expect(rules).toHaveLength(1);
  });

  it("supprimer un nœud retire ses styles ; dupliquer les copie", () => {
    useProjectStore.getState().newProject();
    const store = useProjectStore.getState();
    const rootId = useProjectStore.getState().project!.screens[0].root.id;
    // Window.content n’accepte qu’un enfant : on duplique dans un conteneur.
    store.insertChild(rootId, "BoxLayout");
    const outerId = useProjectStore.getState().selectedNodeId!;
    store.insertChild(outerId, "BoxLayout");
    const boxId = useProjectStore.getState().selectedNodeId!;
    store.insertChild(boxId, "TextView");
    const textId = useProjectStore.getState().selectedNodeId!;
    store.setNodeStyle(textId, null, "padding", [1, 2, 3, 4]);

    store.setSelection(useProjectStore.getState().selectedScreenId, boxId);
    store.duplicateSelected();
    const owners = useProjectStore
      .getState()
      .project!.styleRules.filter((r) => r.ownerNodeId)
      .map((r) => r.ownerNodeId);
    expect(owners).toHaveLength(2);
    expect(new Set(owners).size).toBe(2);

    store.deleteNode(boxId);
    expect(useProjectStore.getState().project!.styleRules.filter((r) => r.ownerNodeId)).toHaveLength(1);
  });

  it("variables d’état", () => {
    useProjectStore.getState().newProject();
    const screen = useProjectStore.getState().project!.screens[0];

    useProjectStore.getState().addStateVar(screen.id, { name: "tab", initial: "a" });
    expect(useProjectStore.getState().project!.screens[0].state).toEqual([
      { name: "tab", initial: "a" },
    ]);
  });

  it("removeStyleRule + reorderStyleRules", () => {
    useProjectStore.getState().newProject();
    // Part d’un projet sans classes partagées (la fenêtre neuve en a deux).
    useProjectStore.setState((s) => {
      s.project!.styleRules = [];
    });
    useProjectStore.getState().addStyleRule({ selector: "A", props: {} });
    useProjectStore.getState().addStyleRule({ selector: "B", props: {} });
    useProjectStore.getState().addStyleRule({ selector: "C", props: {} });
    let rules = useProjectStore.getState().project!.styleRules;
    expect(rules.map((r) => r.selector)).toEqual(["A", "B", "C"]);

    useProjectStore.getState().reorderStyleRules(0, 2);
    rules = useProjectStore.getState().project!.styleRules;
    expect(rules.map((r) => r.selector)).toEqual(["B", "C", "A"]);

    useProjectStore.getState().removeStyleRule(rules[1].id);
    expect(
      useProjectStore.getState().project!.styleRules.map((r) => r.selector),
    ).toEqual(["B", "A"]);
  });

  it("tout désélectionner : plus de nœud ni d’inspecteur d’écran, l’écran reste affiché", () => {
    useProjectStore.getState().newProject("h");
    const screenId = useProjectStore.getState().selectedScreenId;
    useProjectStore.getState().clearSelection();
    let st = useProjectStore.getState();
    expect(st.selectedNodeId).toBeNull();
    expect(st.screenInspected).toBe(false);
    expect(st.selectedScreenId).toBe(screenId);
    // Choisir l’écran dans l’arbre rouvre son inspecteur.
    st.setSelection(screenId, null);
    st = useProjectStore.getState();
    expect(st.screenInspected).toBe(true);
  });

  it("un bouton inséré arrive prêt : TextView « Bouton » et styles de la palette, en une action", () => {
    const st = useProjectStore.getState();
    st.newProject("h");
    const root = useProjectStore.getState().project!.screens[0]!.root;
    const box = root.slots.content?.[0] ?? root;
    const undoBefore = useProjectStore.getState().history.undo.length;
    expect(useProjectStore.getState().insertChild(box.id, "Button")).toBe(true);
    const after = useProjectStore.getState();
    const btnId = after.selectedNodeId!;
    const find = (n: typeof root): typeof root | undefined =>
      n.id === btnId ? n : Object.values(n.slots).flat().map(find).find(Boolean);
    const btn = find(after.project!.screens[0]!.root)!;
    const label = btn.slots.content![0]!;
    expect(label.type).toBe("TextView");
    expect(label.props.text).toEqual({ kind: "literal", value: "Bouton" });
    const own = (id: string) => after.project!.styleRules.find((r) => r.ownerNodeId === id)?.props;
    expect(own(btn.id)).toEqual({ backgroundColor1: { kind: "palette", name: "AccentDark" } });
    expect(own(label.id)).toEqual({ color: { kind: "palette", name: "NeutralLightest" } });
    expect(after.history.undo.length).toBe(undoBefore + 1);
  });

  it("clic sur une classe : éléments en surbrillance, inspecteur vide ; une sélection l’efface", () => {
    const st = useProjectStore.getState();
    st.newProject("h");
    const rootId = useProjectStore.getState().project!.screens[0]!.root.id;
    useProjectStore.getState().highlightNodes(["a", "b"]);
    let now = useProjectStore.getState();
    expect(now.highlightedNodeIds).toEqual(["a", "b"]);
    expect(now.selectedNodeId).toBeNull();
    expect(now.screenInspected).toBe(false);
    now.setSelection(now.selectedScreenId, rootId);
    now = useProjectStore.getState();
    expect(now.highlightedNodeIds).toEqual([]);
  });

  it("multi-projets : chaque projet garde son état ; fermer active le suivant", () => {
    const st = useProjectStore.getState();
    st.newProject("a");
    const a = useProjectStore.getState();
    const aRoot = a.project!.screens[0]!.root;
    a.renameNode(aRoot.id, "Fenêtre A");
    expect(useProjectStore.getState().dirty).toBe(true);
    const aSession = useProjectStore.getState().activeSessionId!;

    useProjectStore.getState().newProject("b");
    let now = useProjectStore.getState();
    expect(now.sessions).toHaveLength(2);
    expect(now.dirty).toBe(false);
    expect(now.project!.catalogHash).toBe("b");

    now.switchProject(aSession);
    now = useProjectStore.getState();
    expect(now.project!.catalogHash).toBe("a");
    expect(now.dirty).toBe(true);
    expect(now.project!.screens[0]!.root.name).toBe("Fenêtre A");
    expect(now.history.undo.length).toBe(1);

    now.closeProject();
    now = useProjectStore.getState();
    expect(now.sessions).toHaveLength(1);
    expect(now.project!.catalogHash).toBe("b");
    now.closeProject();
    expect(useProjectStore.getState().project).toBeNull();
  });

  it("rouvrir un fichier déjà ouvert bascule dessus au lieu de le dupliquer", () => {
    const st = useProjectStore.getState();
    st.newProject("x");
    const p = useProjectStore.getState().project!;
    st.setProject(p, "C:/a.tfui.json");
    st.newProject("y");
    useProjectStore.getState().setProject(p, "C:/a.tfui.json");
    const now = useProjectStore.getState();
    expect(now.sessions.filter((x) => x.projectPath === "C:/a.tfui.json")).toHaveLength(1);
    expect(now.projectPath).toBe("C:/a.tfui.json");
  });

  it("icône du jeu insérée : ImageView avec son path, en une action", () => {
    useProjectStore.getState().newProject("h");
    const root = useProjectStore.getState().project!.screens[0]!.root;
    const box = root.slots.content?.[0] ?? root;
    const before = useProjectStore.getState().history.undo.length;
    const ok = useProjectStore
      .getState()
      .insertChild(box.id, "ImageView", undefined, undefined, { path: { kind: "literal", value: "::/gui/hud/icons/bus.tga" } });
    expect(ok).toBe(true);
    const st = useProjectStore.getState();
    const find = (n: typeof root): typeof root | undefined =>
      n.id === st.selectedNodeId ? n : Object.values(n.slots).flat().map(find).find(Boolean);
    const img = find(st.project!.screens[0]!.root)!;
    expect(img.type).toBe("ImageView");
    expect(img.props.path).toEqual({ kind: "literal", value: "::/gui/hud/icons/bus.tga" });
    expect(st.history.undo.length).toBe(before + 1);
  });
});
