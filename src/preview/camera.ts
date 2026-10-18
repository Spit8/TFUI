/** Pure pan/zoom math for the preview map (§3.5 / R11). */

export interface CameraState {
  panX: number;
  panY: number;
  /** Absolute scale factor (1 = 100 %). */
  zoom: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** Pan by screen-space deltas (already in map pixels). */
export function panBy(cam: CameraState, dx: number, dy: number): CameraState {
  return { ...cam, panX: cam.panX + dx, panY: cam.panY + dy };
}

/**
 * Zoom so the content point under (cursorX, cursorY) in map space stays fixed.
 * Cursor coords are relative to the map element’s top-left.
 */
export function zoomAt(
  cam: CameraState,
  nextZoom: number,
  cursorX: number,
  cursorY: number,
): CameraState {
  const z = clampZoom(nextZoom);
  if (z === cam.zoom) return { ...cam, zoom: z };
  const ratio = z / cam.zoom;
  return {
    zoom: z,
    panX: cursorX - (cursorX - cam.panX) * ratio,
    panY: cursorY - (cursorY - cam.panY) * ratio,
  };
}

/** Fit content into the map viewport with uniform padding. */
export function fit(
  mapW: number,
  mapH: number,
  contentW: number,
  contentH: number,
  padding = 24,
): CameraState {
  if (mapW <= 0 || mapH <= 0 || contentW <= 0 || contentH <= 0) {
    return { panX: 0, panY: 0, zoom: 1 };
  }
  const availW = Math.max(1, mapW - padding * 2);
  const availH = Math.max(1, mapH - padding * 2);
  const zoom = clampZoom(Math.min(availW / contentW, availH / contentH));
  const panX = (mapW - contentW * zoom) / 2;
  const panY = (mapH - contentH * zoom) / 2;
  return { panX, panY, zoom };
}
