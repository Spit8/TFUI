import { useSyncExternalStore } from "react";
import { setGameFontScale, type GameFontScale } from "../gamestyle/matchBaseRule";
import {
  DEFAULT_PREVIEW_APPEARANCE,
  type PreviewAppearance,
  type PreviewFontScale,
} from "../settings/defaults";
import {
  clampZoom,
  fit,
  panBy,
  zoomAt,
  type CameraState,
} from "../preview/camera";

export type { CameraState };

const cameras = new Map<string, CameraState>();
let showBoxes = false;
/** Fond de l’écran simulé : uni (thème), masqué (transparent) ou image. */
export type PreviewBackground =
  | { mode: "solid" }
  | { mode: "hidden" }
  | {
      mode: "image";
      path: string;
      url: string | null;
      error?: string;
      /** Image d’un autre format, faute d’image pour le format courant. */
      fallback?: boolean;
    };
let background: PreviewBackground = { mode: "solid" };
/** Last map container size (for command-driven fit / zoom-at-center). */
let mapSize = { w: 800, h: 600 };
/** Last content (viewport) size for the active screen. */
let contentSize = { w: 1920, h: 1080 };
let activeScreenId: string | null = null;

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function subscribePreviewCamera(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCamera(screenId: string): CameraState | undefined {
  return cameras.get(screenId);
}

export function ensureCamera(
  screenId: string,
  mapW: number,
  mapH: number,
  contentW: number,
  contentH: number,
): CameraState {
  activeScreenId = screenId;
  mapSize = { w: mapW, h: mapH };
  contentSize = { w: contentW, h: contentH };
  let cam = cameras.get(screenId);
  if (!cam) {
    cam = fit(mapW, mapH, contentW, contentH);
    cameras.set(screenId, cam);
    emit();
  }
  return cam;
}

export function setCamera(screenId: string, cam: CameraState): void {
  cameras.set(screenId, {
    panX: cam.panX,
    panY: cam.panY,
    zoom: clampZoom(cam.zoom),
  });
  activeScreenId = screenId;
  emit();
}

export function setMapMetrics(
  screenId: string,
  mapW: number,
  mapH: number,
  contentW: number,
  contentH: number,
): void {
  activeScreenId = screenId;
  mapSize = { w: mapW, h: mapH };
  contentSize = { w: contentW, h: contentH };
}

let appearance: PreviewAppearance = DEFAULT_PREVIEW_APPEARANCE;
let fontScale: PreviewFontScale = "game";
/** Réglage du joueur lu dans `settings.lua` du jeu (null : inconnu). */
let playerFontScale: GameFontScale | null = null;

export function getPreviewFontScale(): PreviewFontScale {
  return fontScale;
}

export function getPlayerFontScale(): GameFontScale | null {
  return playerFontScale;
}

function applyFontScale(): void {
  setGameFontScale(fontScale === "game" ? (playerFontScale ?? "medium") : fontScale);
  emit();
}

/** Taille du texte du jeu simulée (Interface › Text Scaling). */
export function setPreviewFontScaleState(next: PreviewFontScale): void {
  fontScale = next;
  applyFontScale();
}

/** Taille du texte réglée par le joueur dans le jeu (`settings.lua`). */
export function setPlayerFontScale(next: GameFontScale | null): void {
  playerFontScale = next;
  applyFontScale();
}

export function usePreviewFontScale(): PreviewFontScale {
  return useSyncExternalStore(subscribePreviewCamera, getPreviewFontScale, getPreviewFontScale);
}

export function getPreviewAppearance(): PreviewAppearance {
  return appearance;
}

/** Couleurs du survol, des contours « Box » et de la sélection. */
export function setPreviewAppearanceState(next: PreviewAppearance): void {
  appearance = next;
  emit();
}

export function usePreviewAppearance(): PreviewAppearance {
  return useSyncExternalStore(subscribePreviewCamera, getPreviewAppearance, getPreviewAppearance);
}

export function getShowBoxes(): boolean {
  return showBoxes;
}

/** Contour de tous les éléments de l’aperçu (option « Box »). */
export function setShowBoxes(v: boolean): void {
  if (showBoxes === v) return;
  showBoxes = v;
  emit();
}

export function useShowBoxes(): boolean {
  return useSyncExternalStore(subscribePreviewCamera, getShowBoxes, getShowBoxes);
}

export function getPreviewBackground(): PreviewBackground {
  return background;
}

export function setPreviewBackgroundState(next: PreviewBackground): void {
  // L’URL d’objet de l’ancienne image n’est plus utilisée.
  if (
    background.mode === "image" &&
    background.url &&
    !(next.mode === "image" && next.url === background.url)
  ) {
    URL.revokeObjectURL(background.url);
  }
  background = next;
  emit();
}

export function usePreviewBackground(): PreviewBackground {
  return useSyncExternalStore(
    subscribePreviewCamera,
    getPreviewBackground,
    getPreviewBackground,
  );
}

/** Élément visé par le menu contextuel ouvert : reste surligné tant qu’il est ouvert. */
let menuTargetNodeId: string | null = null;

export function getMenuTargetNodeId(): string | null {
  return menuTargetNodeId;
}

export function setMenuTargetNodeId(id: string | null): void {
  if (menuTargetNodeId === id) return;
  menuTargetNodeId = id;
  emit();
}

export function useMenuTargetNodeId(): string | null {
  return useSyncExternalStore(
    subscribePreviewCamera,
    getMenuTargetNodeId,
    getMenuTargetNodeId,
  );
}

function activeCam(): { screenId: string; cam: CameraState } | null {
  if (!activeScreenId) return null;
  const cam = cameras.get(activeScreenId);
  if (!cam) return null;
  return { screenId: activeScreenId, cam };
}

export function previewZoomIn(): void {
  const a = activeCam();
  if (!a) return;
  const cx = mapSize.w / 2;
  const cy = mapSize.h / 2;
  setCamera(a.screenId, zoomAt(a.cam, a.cam.zoom * 1.1, cx, cy));
}

export function previewZoomOut(): void {
  const a = activeCam();
  if (!a) return;
  const cx = mapSize.w / 2;
  const cy = mapSize.h / 2;
  setCamera(a.screenId, zoomAt(a.cam, a.cam.zoom / 1.1, cx, cy));
}

export function previewFit(): void {
  if (!activeScreenId) return;
  setCamera(
    activeScreenId,
    fit(mapSize.w, mapSize.h, contentSize.w, contentSize.h),
  );
}

export function previewZoom100(): void {
  const a = activeCam();
  if (!a) return;
  const cx = mapSize.w / 2;
  const cy = mapSize.h / 2;
  setCamera(a.screenId, zoomAt(a.cam, 1, cx, cy));
}

export function previewPanBy(dx: number, dy: number): void {
  const a = activeCam();
  if (!a) return;
  setCamera(a.screenId, panBy(a.cam, dx, dy));
}

export function usePreviewCamera(screenId: string | null): CameraState | null {
  return useSyncExternalStore(
    subscribePreviewCamera,
    () => (screenId ? (cameras.get(screenId) ?? null) : null),
    () => (screenId ? (cameras.get(screenId) ?? null) : null),
  );
}

