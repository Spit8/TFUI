export interface RectSize {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface ClampedPosition {
  x: number;
  y: number;
  maxHeight: number;
  /** true si ouvert vers le haut (ancre = bas du menu). */
  flipY: boolean;
  /** true si ouvert vers la gauche. */
  flipX: boolean;
}

const MARGIN = 4;

/** Positionne un menu pour rester dans le viewport (§3.3). */
export function clampMenuPosition(
  anchor: { x: number; y: number },
  size: RectSize,
  viewport: Viewport,
  opts?: { preferFlipX?: boolean },
): ClampedPosition {
  const maxHeight = Math.max(80, viewport.height - MARGIN * 2);
  const h = Math.min(size.height, maxHeight);
  const w = size.width;

  let flipY = false;
  let y = anchor.y;
  if (y + h > viewport.height - MARGIN) {
    const up = anchor.y - h;
    if (up >= MARGIN) {
      y = up;
      flipY = true;
    } else {
      y = MARGIN;
    }
  }
  if (y < MARGIN) y = MARGIN;

  let flipX = Boolean(opts?.preferFlipX);
  let x = flipX ? anchor.x - w : anchor.x;
  if (x + w > viewport.width - MARGIN) {
    x = anchor.x - w;
    flipX = true;
  }
  if (x < MARGIN) {
    x = MARGIN;
    flipX = false;
  }

  return { x, y, maxHeight, flipY, flipX };
}

/** Position d’un sous-menu relativement à son item parent. */
export function clampSubmenuPosition(
  parentRect: { left: number; top: number; right: number; bottom: number },
  size: RectSize,
  viewport: Viewport,
): ClampedPosition {
  const preferLeft = parentRect.right + size.width > viewport.width - MARGIN;
  const anchorX = preferLeft ? parentRect.left : parentRect.right;
  const anchorY = parentRect.top;
  return clampMenuPosition(
    { x: anchorX, y: anchorY },
    size,
    viewport,
    { preferFlipX: preferLeft },
  );
}
