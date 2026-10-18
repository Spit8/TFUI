import { describe, expect, it } from "vitest";
import { createEmptyProject } from "./factory";
import {
  addScreen,
  duplicateScreen,
  removeScreen,
  updateScreenMeta,
} from "./screenOps";

describe("screenOps (R14)", () => {
  it("addScreen ajoute un écran", () => {
    const p = createEmptyProject();
    const r = addScreen(p, "recipe");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.screens).toHaveLength(2);
    expect(r.project.screens[1]!.kind).toBe("recipe");
  });

  it("duplicateScreen clone avec nouveaux ids", () => {
    const p = createEmptyProject();
    const id = p.screens[0]!.id;
    const r = duplicateScreen(p, id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.screens).toHaveLength(2);
    expect(r.project.screens[1]!.id).not.toBe(id);
    expect(r.project.screens[1]!.root.id).not.toBe(p.screens[0]!.root.id);
  });

  it("removeScreen refuse le dernier", () => {
    const p = createEmptyProject();
    const r = removeScreen(p, p.screens[0]!.id);
    expect(r.ok).toBe(false);
  });

  it("updateScreenMeta change recipeName", () => {
    const p = createEmptyProject();
    const id = p.screens[0]!.id;
    const r = updateScreenMeta(p, id, { recipeName: "Renamed" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.screens[0]!.recipeName).toBe("Renamed");
  });
});
