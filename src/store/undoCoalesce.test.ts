import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectStore } from "./projectStore";

describe("undo coalescence (R15)", () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: null,
      projectPath: null,
      selectedNodeId: null,
      selectedScreenId: null,
      hoveredNodeId: null,
      stateSim: {},
      dirty: false,
      lastDropError: null,
      history: { undo: [], redo: [] },
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  it("fusionne setProp rapides sur la même clé", () => {
    useProjectStore.getState().newProject();
    const rootId = useProjectStore.getState().project!.screens[0].root.id;
    const t0 = Date.now();
    useProjectStore.getState().setProp(rootId, "title", {
      kind: "literal",
      value: "A",
    });
    vi.setSystemTime(t0 + 100);
    useProjectStore.getState().setProp(rootId, "title", {
      kind: "literal",
      value: "AB",
    });
    vi.setSystemTime(t0 + 200);
    useProjectStore.getState().setProp(rootId, "title", {
      kind: "literal",
      value: "ABC",
    });
    expect(useProjectStore.getState().history.undo).toHaveLength(1);
    expect(
      useProjectStore.getState().project!.screens[0].root.props.title,
    ).toEqual({ kind: "literal", value: "ABC" });

    useProjectStore.getState().undo();
    const title =
      useProjectStore.getState().project!.screens[0].root.props.title;
    // Premier "before" : pas encore de title défini (defaults sur createNode)
    expect(title?.kind === "literal" ? title.value : undefined).not.toBe(
      "ABC",
    );
  });

  it("empile si délai > 500 ms", () => {
    useProjectStore.getState().newProject();
    const rootId = useProjectStore.getState().project!.screens[0].root.id;
    const t0 = Date.now();
    useProjectStore.getState().setProp(rootId, "title", {
      kind: "literal",
      value: "A",
    });
    vi.setSystemTime(t0 + 600);
    useProjectStore.getState().setProp(rootId, "title", {
      kind: "literal",
      value: "B",
    });
    expect(useProjectStore.getState().history.undo).toHaveLength(2);
  });

  it("setModInfo passe par undo", () => {
    useProjectStore.getState().newProject();
    useProjectStore.getState().setModInfo({ modId: "changed_mod" });
    expect(useProjectStore.getState().project!.mod.modId).toBe("changed_mod");
    expect(useProjectStore.getState().history.undo.length).toBeGreaterThan(0);
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project!.mod.modId).not.toBe(
      "changed_mod",
    );
  });
});
