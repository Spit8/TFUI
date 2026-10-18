import { open } from "@tauri-apps/plugin-dialog";
import type { PreviewBackgroundMode } from "../settings/defaults";
import { setPreviewBackground } from "../settings/settingsStore";
import { getPreviewBackground, setPreviewBackgroundState } from "../store/previewCameraStore";
import { readImageFile } from "../tauri/commands";
import { errorMessage } from "../i18n/backend";

/**
 * Fond de l’écran simulé : une capture du jeu par format d’écran (« 16:9 »,
 * « 21:9 »…). Sans image pour le format courant, la dernière image choisie
 * sert de repli (signalé dans la barre d’outils).
 */
let mode: PreviewBackgroundMode = "solid";
/** Dernière image choisie (repli). */
let lastImagePath: string | null = null;
/** Image par format d’écran. */
let images: Record<string, string> = {};
/** Format de l’écran affiché, posé par l’aperçu. */
let currentRatio = "16:9";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "bmp"];

function mimeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "bmp") return "image/bmp";
  return "image/png";
}

/** Image à afficher pour le format courant, et si c’est un repli. */
function imageForCurrentRatio(): { path: string; fallback: boolean } | null {
  const own = images[currentRatio];
  if (own) return { path: own, fallback: false };
  return lastImagePath ? { path: lastImagePath, fallback: true } : null;
}

async function loadImage(path: string, fallback: boolean): Promise<void> {
  const cur = getPreviewBackground();
  // Même image déjà chargée : seul l’indicateur de repli change.
  if (cur.mode === "image" && cur.path === path && cur.url) {
    setPreviewBackgroundState({ ...cur, fallback });
    return;
  }
  setPreviewBackgroundState({ mode: "image", path, url: null, fallback });
  try {
    const bytes = await readImageFile(path);
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeFor(path) }));
    // Un autre choix a pu arriver pendant la lecture.
    const now = getPreviewBackground();
    if (now.mode !== "image" || now.path !== path) {
      URL.revokeObjectURL(url);
      return;
    }
    setPreviewBackgroundState({ mode: "image", path, url, fallback });
  } catch (e) {
    setPreviewBackgroundState({
      mode: "image",
      path,
      url: null,
      fallback,
      error: errorMessage(e),
    });
  }
}

/** Applique le mode courant au format courant. */
async function refresh(): Promise<void> {
  if (mode !== "image") {
    setPreviewBackgroundState({ mode });
    return;
  }
  const pick = imageForCurrentRatio();
  if (pick) await loadImage(pick.path, pick.fallback);
  else setPreviewBackgroundState({ mode: "solid" });
}

async function persist(): Promise<void> {
  await setPreviewBackground(mode, lastImagePath, images).catch(() => undefined);
}

/** Rétablit le fond mémorisé au démarrage. */
export async function restorePreviewBackground(
  savedMode: PreviewBackgroundMode,
  image: string | null,
  savedImages: Record<string, string>,
): Promise<void> {
  mode = savedMode;
  lastImagePath = image;
  images = { ...savedImages };
  await refresh();
}

/** L’aperçu change de résolution : l’image suit le format d’écran. */
export function setPreviewBackgroundRatio(ratio: string): void {
  if (ratio === currentRatio) return;
  currentRatio = ratio;
  if (mode === "image") void refresh();
}

/** Fond uni ou masqué ; les images restent mémorisées pour y revenir. */
export function setPreviewBackgroundMode(next: "solid" | "hidden"): void {
  mode = next;
  void refresh();
  void persist();
}

/** Revient aux images, ou en demande une pour le format courant. */
export async function showPreviewBackgroundImage(): Promise<void> {
  if (imageForCurrentRatio()) {
    mode = "image";
    await refresh();
    await persist();
    return;
  }
  await pickPreviewBackgroundImage();
}

/** Choisit la capture du jeu pour un format d’écran (par défaut le format affiché). */
export async function pickPreviewBackgroundImage(ratio = currentRatio): Promise<boolean> {
  const picked = await open({
    multiple: false,
    filters: [{ name: "Image", extensions: IMAGE_EXTENSIONS }],
  });
  if (!picked || Array.isArray(picked)) return false;
  images = { ...images, [ratio]: picked };
  lastImagePath = picked;
  // Choisir l’image du format affiché l’affiche aussitôt.
  if (ratio === currentRatio) mode = "image";
  await refresh();
  await persist();
  return true;
}

/** Oublie l’image d’un format (le repli reprend la main). */
export async function clearPreviewBackgroundImage(ratio = currentRatio): Promise<void> {
  if (!images[ratio]) return;
  const { [ratio]: removed, ...rest } = images;
  images = rest;
  if (lastImagePath === removed) lastImagePath = Object.values(rest)[0] ?? null;
  await refresh();
  await persist();
}

/** Image par format d’écran (copie). */
export function getPreviewBackgroundImages(): Record<string, string> {
  return { ...images };
}

/** Format de l’écran affiché dans l’aperçu. */
export function getPreviewBackgroundRatio(): string {
  return currentRatio;
}

/** Mode de fond courant (uni, masqué, image). */
export function getPreviewBackgroundMode(): PreviewBackgroundMode {
  return mode;
}

/** Image affichée pour un format d’écran (la sienne, sinon la dernière choisie). */
export function backgroundImagePathFor(ratio: string): string | null {
  return images[ratio] ?? lastImagePath;
}

/** Image de fond lue en URL de données (export PNG). */
export async function backgroundImageDataUrl(path: string): Promise<string> {
  const bytes = new Uint8Array(await readImageFile(path));
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mimeFor(path)};base64,${btoa(bin)}`;
}
