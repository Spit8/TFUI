import { describe, expect, it } from "vitest";
import {
  isBoxOffscreen,
  isPointInWindow,
  popoutBoxAtPoint,
  sanitizePopoutPositions,
  screenToClient,
  type MonitorBounds,
} from "./popoutLayout";

const primary: MonitorBounds = { left: 0, top: 0, width: 1920, height: 1040 };
const secondary: MonitorBounds = {
  left: 1920,
  top: 0,
  width: 2560,
  height: 1400,
};
const origin = { screenX: 0, screenY: 0 };

function layoutWithPopout(
  position: { top: number; left: number; width: number; height: number } | null,
) {
  return {
    grid: {
      root: { type: "leaf" as const, data: { id: "root", views: [] }, size: 1 },
      height: 800,
      width: 1200,
      orientation: "HORIZONTAL" as const,
    },
    panels: {},
    popoutGroups: [
      {
        data: { id: "g1", views: ["preview"], activeView: "preview" },
        position,
        url: "/popout.html",
      },
    ],
  };
}

describe("isBoxOffscreen", () => {
  it("détecte une fenêtre hors de tous les écrans", () => {
    expect(
      isBoxOffscreen({ top: -2000, left: -2000, width: 400, height: 300 }, [
        primary,
      ]),
    ).toBe(true);
  });

  it("accepte une fenêtre sur le second écran", () => {
    const box = { top: 100, left: 2200, width: 800, height: 600 };
    expect(isBoxOffscreen(box, [primary])).toBe(true);
    expect(isBoxOffscreen(box, [primary, secondary])).toBe(false);
  });

  it("refuse une fenêtre qui ne dépasse que de quelques pixels", () => {
    expect(
      isBoxOffscreen({ top: 100, left: 1900, width: 800, height: 600 }, [
        primary,
      ]),
    ).toBe(true);
  });
});

describe("sanitizePopoutPositions", () => {
  it("recentre une position hors écran sur le premier moniteur", () => {
    const out = sanitizePopoutPositions(
      layoutWithPopout({ top: -5000, left: -5000, width: 640, height: 480 }) as never,
      [primary],
      origin,
    );
    expect(out.popoutGroups![0]!.position).toEqual({
      top: 80,
      left: 80,
      width: 640,
      height: 480,
    });
  });

  it("garde une position valide sur le second écran", () => {
    const pos = { top: 120, left: 2200, width: 800, height: 600 };
    const out = sanitizePopoutPositions(
      layoutWithPopout(pos) as never,
      [primary, secondary],
      origin,
    );
    expect(out.popoutGroups![0]!.position).toEqual(pos);
  });

  it("convertit en position relative à la fenêtre principale", () => {
    const pos = { top: 300, left: 500, width: 800, height: 600 };
    const out = sanitizePopoutPositions(
      layoutWithPopout(pos) as never,
      [primary],
      { screenX: 100, screenY: 50 },
    );
    expect(out.popoutGroups![0]!.position).toEqual({
      top: 250,
      left: 400,
      width: 800,
      height: 600,
    });
  });

  it("remplace une position null", () => {
    const out = sanitizePopoutPositions(
      layoutWithPopout(null) as never,
      [primary],
      origin,
    );
    const pos = out.popoutGroups![0]!.position!;
    expect(pos.top).toBe(80);
    expect(pos.left).toBe(80);
  });
});

const mainWin = {
  screenX: 100,
  screenY: 50,
  outerWidth: 1216,
  outerHeight: 839,
  innerWidth: 1200,
  innerHeight: 800,
};

describe("isPointInWindow", () => {
  it("détecte un point dans le cadre", () => {
    expect(isPointInWindow({ x: 150, y: 60 }, mainWin)).toBe(true);
    expect(isPointInWindow({ x: 50, y: 60 }, mainWin)).toBe(false);
    expect(isPointInWindow({ x: 150, y: 1000 }, mainWin)).toBe(false);
  });
});

describe("screenToClient", () => {
  it("retire bordure et barre de titre", () => {
    // bordure (1216-1200)/2 = 8, barre = 839-800-8 = 31
    expect(screenToClient({ x: 108, y: 81 }, mainWin)).toEqual({ x: 0, y: 0 });
  });
});

describe("popoutBoxAtPoint", () => {
  it("ouvre la fenêtre sous le pointeur, relative à la fenêtre principale", () => {
    expect(
      popoutBoxAtPoint({ x: 1000, y: 500 }, { width: 500, height: 400 }, mainWin),
    ).toEqual({ left: 840, top: 434, width: 500, height: 400 });
  });

  it("impose une taille minimale", () => {
    const box = popoutBoxAtPoint({ x: 0, y: 0 }, { width: 10, height: 10 }, mainWin);
    expect(box.width).toBe(320);
    expect(box.height).toBe(240);
  });
});
