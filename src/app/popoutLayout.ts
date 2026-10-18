import type { SerializedDockview } from "dockview";

export const POPOUT_URL = "/popout.html";

/** Zone de travail d’un moniteur, en pixels logiques (repère `screenX/Y`). */
export interface MonitorBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Position extérieure d’une fenêtre à l’écran (repère `screenX/Y`). */
export interface WindowRect {
  screenX: number;
  screenY: number;
  outerWidth: number;
  outerHeight: number;
  innerWidth: number;
  innerHeight: number;
}

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Repli quand la commande Rust n’est pas disponible : l’écran courant. */
export function getCurrentScreenBounds(win: Window = window): MonitorBounds {
  const s = win.screen as Screen & { availLeft?: number; availTop?: number };
  return {
    left: s.availLeft ?? 0,
    top: s.availTop ?? 0,
    width: Math.max(1, s.availWidth || win.innerWidth || 1280),
    height: Math.max(1, s.availHeight || win.innerHeight || 720),
  };
}

export function windowRectOf(win: Window): WindowRect {
  return {
    screenX: win.screenX,
    screenY: win.screenY,
    outerWidth: win.outerWidth,
    outerHeight: win.outerHeight,
    innerWidth: win.innerWidth,
    innerHeight: win.innerHeight,
  };
}

function isFinitePositive(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** Surface minimale visible (px) pour qu’une fenêtre reste attrapable. */
const MIN_VISIBLE = 48;

/** Vrai si la boîte n’est visible (assez) sur aucun des moniteurs. */
export function isBoxOffscreen(box: Box, monitors: MonitorBounds[]): boolean {
  return !monitors.some((m) => {
    const w =
      Math.min(box.left + box.width, m.left + m.width) -
      Math.max(box.left, m.left);
    const h =
      Math.min(box.top + box.height, m.top + m.height) -
      Math.max(box.top, m.top);
    return w >= MIN_VISIBLE && h >= MIN_VISIBLE;
  });
}

function isValidBox(pos: Partial<Box> | null | undefined): pos is Box {
  return (
    !!pos &&
    isFinitePositive(pos.width) &&
    isFinitePositive(pos.height) &&
    typeof pos.top === "number" &&
    typeof pos.left === "number" &&
    Number.isFinite(pos.top) &&
    Number.isFinite(pos.left)
  );
}

/**
 * Prépare les fenêtres détachées d’une disposition enregistrée pour `fromJSON`.
 *
 * - dockview enregistre la position **absolue** (`screenX/Y`) de chaque popout,
 *   mais à la réouverture il ajoute `window.screenX/Y` de la fenêtre principale :
 *   on convertit donc en position relative à la fenêtre principale.
 * - Une position visible sur aucun moniteur (écran débranché) est recentrée sur
 *   le premier moniteur.
 */
export function sanitizePopoutPositions(
  layout: SerializedDockview,
  monitors: MonitorBounds[],
  mainOrigin: { screenX: number; screenY: number },
): SerializedDockview {
  const groups = layout.popoutGroups;
  if (!groups || groups.length === 0) return layout;
  const primary = monitors[0] ?? { left: 0, top: 0, width: 1280, height: 720 };

  const next = groups.map((g) => {
    const pos = g.position;
    let abs: Box;
    if (isValidBox(pos) && !isBoxOffscreen(pos, monitors)) {
      abs = pos;
    } else {
      const width = Math.min(
        isFinitePositive(pos?.width) ? pos.width : 640,
        primary.width,
      );
      const height = Math.min(
        isFinitePositive(pos?.height) ? pos.height : 480,
        primary.height,
      );
      abs = { top: primary.top + 80, left: primary.left + 80, width, height };
    }
    return {
      ...g,
      position: {
        ...abs,
        left: abs.left - mainOrigin.screenX,
        top: abs.top - mainOrigin.screenY,
      },
      url: g.url ?? POPOUT_URL,
    };
  });

  return { ...layout, popoutGroups: next };
}

/** Le point écran est-il à l’intérieur de la fenêtre (cadre compris) ? */
export function isPointInWindow(
  point: { x: number; y: number },
  win: WindowRect,
): boolean {
  return (
    point.x >= win.screenX &&
    point.y >= win.screenY &&
    point.x < win.screenX + win.outerWidth &&
    point.y < win.screenY + win.outerHeight
  );
}

/**
 * Convertit un point écran en coordonnées client de la fenêtre (estimation :
 * bordures latérales égales, barre de titre en haut).
 */
export function screenToClient(
  point: { x: number; y: number },
  win: WindowRect,
): { x: number; y: number } {
  const border = Math.max(0, (win.outerWidth - win.innerWidth) / 2);
  const titleBar = Math.max(0, win.outerHeight - win.innerHeight - border);
  return {
    x: point.x - win.screenX - border,
    y: point.y - win.screenY - titleBar,
  };
}

/**
 * Boîte à passer à `addPopoutGroup` pour ouvrir la fenêtre sous le pointeur.
 * dockview ajoute `window.screenX/Y` : la boîte est relative à la fenêtre
 * principale.
 */
export function popoutBoxAtPoint(
  point: { x: number; y: number },
  size: { width: number; height: number },
  main: { screenX: number; screenY: number },
): Box {
  const width = Math.max(320, Math.round(size.width));
  const height = Math.max(240, Math.round(size.height));
  return {
    left: Math.round(point.x - 60 - main.screenX),
    top: Math.round(point.y - 16 - main.screenY),
    width,
    height,
  };
}
