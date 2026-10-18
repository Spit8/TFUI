import { describe, expect, it } from "vitest";
import { createEmptyProject, createNode } from "./factory";
import {
  canDrop,
  findNode,
  insertNode,
  moveNode,
} from "./treeOps";
import { primaryInsertSlot } from "./slots";

describe("treeOps", () => {
  it("construit Window → BoxLayout → 3 TextView", () => {
    let project = createEmptyProject();
    const screen = project.screens[0];
    const window = screen.root;
    expect(window.type).toBe("Window");

    const box = createNode("BoxLayout");
    project = insertNode(
      project,
      screen.id,
      window.id,
      "content",
      box,
    );

    const boxLoc = findNode(project, box.id)!;
    for (let i = 0; i < 3; i++) {
      project = insertNode(
        project,
        screen.id,
        boxLoc.node.id,
        "children",
        createNode("TextView", `TextView ${i + 1}`),
      );
    }

    const updatedBox = findNode(project, box.id)!.node;
    expect(updatedBox.slots.children).toHaveLength(3);
    expect(updatedBox.slots.children.map((n) => n.type)).toEqual([
      "TextView",
      "TextView",
      "TextView",
    ]);
  });

  it("réordonne par moveNode", () => {
    let project = createEmptyProject();
    const screen = project.screens[0];
    const box = createNode("BoxLayout");
    project = insertNode(project, screen.id, screen.root.id, "content", box);

    const a = createNode("TextView", "A");
    const b = createNode("TextView", "B");
    const c = createNode("TextView", "C");
    project = insertNode(project, screen.id, box.id, "children", a);
    project = insertNode(project, screen.id, box.id, "children", b);
    project = insertNode(project, screen.id, box.id, "children", c);

    project = moveNode(project, c.id, box.id, "children", 0);
    const children = findNode(project, box.id)!.node.slots.children;
    expect(children.map((n) => n.name)).toEqual(["C", "A", "B"]);
  });

  it("refuse un drop interdit avec une raison", () => {
    let project = createEmptyProject();
    const screen = project.screens[0];
    const box = createNode("BoxLayout");
    project = insertNode(project, screen.id, screen.root.id, "content", box);
    const text = createNode("TextView");
    project = insertNode(project, screen.id, box.id, "children", text);

    const intoSelf = canDrop(project, box.id, box.id, "children", screen.id);
    expect(intoSelf.ok).toBe(false);
    if (!intoSelf.ok) {
      expect(intoSelf.reason.length).toBeGreaterThan(0);
    }

    const windowMove = canDrop(
      project,
      screen.root.id,
      box.id,
      "children",
      screen.id,
    );
    // Window is root — findNode works but canDrop should reject Window type when dragged...
    // Root Window can't be detached easily; canPlaceType rejects Window:
    expect(windowMove.ok).toBe(false);

    const absChild = createNode("AbsoluteLayoutChild");
    const place = canDrop(
      // simulate checking via canPlace by inserting first under wrong parent then canDrop move
      insertNode(project, screen.id, box.id, "children", absChild),
      absChild.id,
      box.id,
      "children",
      screen.id,
    );
    // Already under BoxLayout — canDrop for same place may ok for reorder, but type rule:
    // AbsoluteLayoutChild under BoxLayout — canPlaceType fails if we try to validate type
    expect(place.ok).toBe(false);
    if (!place.ok) {
      expect(place.reason).toMatch(/AbsoluteLayout/);
    }
  });

  it("primaryInsertSlot pour Window est content", () => {
    expect(primaryInsertSlot("Window")).toBe("content");
    expect(primaryInsertSlot("BoxLayout")).toBe("children");
    expect(primaryInsertSlot("List")).toBe("children");
    expect(primaryInsertSlot("ComboBox")).toBe("items");
  });
});
