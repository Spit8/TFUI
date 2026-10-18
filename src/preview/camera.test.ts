import { describe, expect, it } from "vitest";
import {
  clampZoom,
  fit,
  panBy,
  zoomAt,
  type CameraState,
} from "./camera";

describe("clampZoom", () => {
  it("borne entre 0.1 et 4", () => {
    expect(clampZoom(0.01)).toBe(0.1);
    expect(clampZoom(10)).toBe(4);
    expect(clampZoom(1)).toBe(1);
  });
});

describe("panBy", () => {
  it("ajoute les deltas", () => {
    const cam: CameraState = { panX: 10, panY: 20, zoom: 1 };
    expect(panBy(cam, -5, 3)).toEqual({ panX: 5, panY: 23, zoom: 1 });
  });
});

describe("zoomAt", () => {
  it("garde le point sous le curseur fixe", () => {
    const cam: CameraState = { panX: 100, panY: 50, zoom: 1 };
    const next = zoomAt(cam, 2, 200, 150);
    expect(next.zoom).toBe(2);
    // content point under cursor: (200-100)/1 = 100, (150-50)/1 = 100
    // after: pan = cursor - content*zoom → 200-200=0, 150-200=-50
    expect(next.panX).toBe(0);
    expect(next.panY).toBe(-50);
  });

  it("clamp le zoom", () => {
    const cam: CameraState = { panX: 0, panY: 0, zoom: 1 };
    expect(zoomAt(cam, 100, 0, 0).zoom).toBe(4);
  });
});

describe("fit", () => {
  it("centre et réduit pour entrer dans la map", () => {
    const cam = fit(400, 300, 1920, 1080, 0);
    expect(cam.zoom).toBeCloseTo(400 / 1920, 5);
    expect(cam.panX).toBeCloseTo((400 - 1920 * cam.zoom) / 2, 5);
    expect(cam.panY).toBeCloseTo((300 - 1080 * cam.zoom) / 2, 5);
  });

  it("gère les dimensions invalides", () => {
    expect(fit(0, 100, 1920, 1080)).toEqual({
      panX: 0,
      panY: 0,
      zoom: 1,
    });
  });
});
