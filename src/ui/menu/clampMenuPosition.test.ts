import { describe, expect, it } from "vitest";
import { clampMenuPosition, clampSubmenuPosition } from "./clampMenuPosition";

describe("clampMenuPosition (§3.3)", () => {
  const viewport = { width: 800, height: 600 };
  const size = { width: 200, height: 180 };

  it("garde le menu dans le coin haut-gauche", () => {
    const r = clampMenuPosition({ x: 10, y: 10 }, size, viewport);
    expect(r.x).toBe(10);
    expect(r.y).toBe(10);
    expect(r.flipY).toBe(false);
    expect(r.flipX).toBe(false);
  });

  it("ouvre vers le haut près du bas", () => {
    const r = clampMenuPosition({ x: 100, y: 550 }, size, viewport);
    expect(r.flipY).toBe(true);
    expect(r.y).toBe(550 - 180);
  });

  it("ouvre vers la gauche près du bord droit", () => {
    const r = clampMenuPosition({ x: 750, y: 100 }, size, viewport);
    expect(r.flipX).toBe(true);
    expect(r.x).toBe(750 - 200);
  });

  it("plafonne près du coin bas-droit", () => {
    const r = clampMenuPosition({ x: 780, y: 580 }, size, viewport);
    expect(r.x + size.width).toBeLessThanOrEqual(viewport.width);
    expect(r.y).toBeGreaterThanOrEqual(4);
    expect(r.maxHeight).toBeGreaterThan(0);
  });
});

describe("clampSubmenuPosition", () => {
  it("bascule à gauche s’il manque de place à droite", () => {
    const r = clampSubmenuPosition(
      { left: 600, top: 100, right: 750, bottom: 120 },
      { width: 180, height: 100 },
      { width: 800, height: 600 },
    );
    expect(r.flipX).toBe(true);
  });
});
