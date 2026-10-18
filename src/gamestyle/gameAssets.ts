import { useEffect, useState, useSyncExternalStore } from "react";
import { GAME_FONT_FILES, gameImageCandidates } from "../catalog/gameCache";
import { decodeTga, tintRgba, type DecodedTga } from "./tga";

/**
 * Ressources graphiques du jeu pour l’aperçu (images `.tga` de l’interface,
 * polices Lato), lues dans les archives de l’installation à l’exécution,
 * jamais copiées dans le dépôt ni dans le bundle.
 *
 * Le lecteur est posé par l’application (commande Tauri) ou par le banc de
 * rendu de développement ; sans lecteur, l’aperçu garde son rendu de repli.
 */
export type GameBytesReader = (zip: string, entry: string) => Promise<Uint8Array | null>;

let reader: GameBytesReader | null = null;
/**
 * Copie locale des images converties (PNG RGBA, chemin relatif à
 * `game-cache`) ; lue avant les `.tga` du jeu.
 */
let pngReader: ((rel: string) => Promise<Uint8Array | null>) | null = null;

export function setGamePngReader(next: ((rel: string) => Promise<Uint8Array | null>) | null): void {
  pngReader = next;
  decoded.clear();
  tinted.clear();
  emit();
}

/** `gui/builtin/x@2x.tga` → `images/gui/builtin/x@2x.png` (arborescence de l’import). */
export function importedPngRel(entry: string): string {
  return `images/${entry.replace(/\.tga$/i, "")}.png`;
}

/** PNG → RGBA (masques déjà convertis : blanc + opacité). */
async function decodePng(bytes: Uint8Array): Promise<DecodedTga | null> {
  if (typeof createImageBitmap === "undefined" || typeof document === "undefined") return null;
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  return { width: bitmap.width, height: bitmap.height, gray: false, rgba: data };
}
/** Lecteur vérifié par une lecture d’essai (sinon : rendu de repli). */
let ready = false;
let version = 0;
const listeners = new Set<() => void>();

function emit(): void {
  version++;
  for (const l of listeners) l();
}

/** Fichier lu pour vérifier l’accès aux archives du jeu. */
const PROBE = { zip: "gui.zip", entry: "gui/builtin/window/icons/symbol_close_18@2x.tga" };

/**
 * Pose le lecteur ; la promesse se résout une fois l’accès vérifié et les
 * polices chargées (ou l’accès refusé : rendu de repli).
 */
export function setGameAssetReader(next: GameBytesReader | null): Promise<void> {
  reader = next;
  ready = false;
  fontsLoaded = false;
  fontBytes.clear();
  fontCss = null;
  decoded.clear();
  tinted.clear();
  emit();
  if (!next) return Promise.resolve();
  // N’utilise les images du jeu qu’une fois l’accès vérifié (commande
  // indisponible, jeu non lié… : l’aperçu garde son rendu de repli).
  return next(PROBE.zip, PROBE.entry)
    .then(async (bytes) => {
      if (reader !== next || !bytes || bytes.length === 0) return;
      ready = true;
      emit();
      await loadGameFonts();
    })
    .catch(() => undefined);
}

/**
 * Lit d’avance toutes les ressources que l’éditeur utilise (polices, images
 * des styles, icônes du moteur) : avec un lecteur à cache, cela remplit la
 * copie permanente. `onProgress(n, total)` suit l’avancement.
 */
export async function prefetchGameAssets(
  imageFiles: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const read = reader;
  if (!read) return;
  const total = GAME_FONT_FILES.length + imageFiles.length;
  let done = 0;
  for (const f of GAME_FONT_FILES) {
    await read(f.file.zip, f.file.entry).catch(() => null);
    onProgress?.(++done, total);
  }
  for (const fileName of imageFiles) {
    for (const c of gameImageCandidates(fileName)) {
      const bytes = await read(c.zip, c.entry).catch(() => null);
      if (bytes && bytes.length > 0) break;
    }
    onProgress?.(++done, total);
  }
}

export function hasGameAssets(): boolean {
  return ready;
}

/** Change quand le lecteur ou les polices changent (pour re-rendre). */
export function useGameAssetsVersion(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => version,
  );
}

// ── Images ─────────────────────────────────────────────────────────────

export interface GameImage {
  url: string;
  /** Taille à l’échelle 1 (les fichiers `@2x` sont deux fois plus grands). */
  width: number;
  height: number;
  /** Pixels de l’image par pixel d’interface (2 pour `@2x`). */
  scale: number;
}

const decoded = new Map<string, Promise<{ tga: DecodedTga; scale: number } | null>>();
const tinted = new Map<string, Promise<GameImage | null>>();

function decodeImage(fileName: string): Promise<{ tga: DecodedTga; scale: number } | null> {
  let p = decoded.get(fileName);
  if (!p) {
    p = (async () => {
      // Copie locale convertie d’abord, puis les `.tga` du jeu.
      const png = pngReader;
      if (png) {
        for (const c of gameImageCandidates(fileName)) {
          const bytes = await png(importedPngRel(c.entry)).catch(() => null);
          if (!bytes || bytes.length === 0) continue;
          const img = await decodePng(bytes).catch(() => null);
          if (img) return { tga: img, scale: c.scale };
        }
      }
      const read = reader;
      if (!read) return null;
      for (const c of gameImageCandidates(fileName)) {
        const bytes = await read(c.zip, c.entry).catch(() => null);
        if (bytes && bytes.length > 0) return { tga: decodeTga(bytes), scale: c.scale };
      }
      return null;
    })().catch(() => null);
    decoded.set(fileName, p);
  }
  return p;
}

/** Image du jeu teintée par une couleur RGBA 0..1 (URL de données mise en cache). */
export function loadTintedImage(fileName: string, color: number[]): Promise<GameImage | null> {
  const key = `${fileName}|${color.map((n) => n.toFixed(4)).join(",")}`;
  let p = tinted.get(key);
  if (!p) {
    p = decodeImage(fileName).then((d) => {
      if (!d || typeof document === "undefined") return null;
      const canvas = document.createElement("canvas");
      canvas.width = d.tga.width;
      canvas.height = d.tga.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.putImageData(new ImageData(tintRgba(d.tga.rgba, color), d.tga.width, d.tga.height), 0, 0);
      return {
        url: canvas.toDataURL("image/png"),
        width: d.tga.width / d.scale,
        height: d.tga.height / d.scale,
        scale: d.scale,
      };
    });
    tinted.set(key, p);
  }
  return p;
}

/** Image teintée, ou null tant qu’elle n’est pas prête / indisponible. */
export function useTintedImage(fileName: string | undefined, color: number[] | undefined): GameImage | null {
  const v = useGameAssetsVersion();
  const [img, setImg] = useState<GameImage | null>(null);
  const key = fileName && color ? `${fileName}|${color.join(",")}|${v}` : "";
  useEffect(() => {
    let alive = true;
    setImg(null);
    if (!fileName || !color || !hasGameAssets()) return;
    void loadTintedImage(fileName, color).then((r) => {
      if (alive) setImg(r);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clé composite
  }, [key]);
  return img;
}

// ── Polices ────────────────────────────────────────────────────────────

/** Famille CSS des polices du jeu (Lato, `locale.zip`, fontMap de `*.lang.lua`). */
export const GAME_FONT_FAMILY = "TF3 Lato";

let fontsLoaded = false;
/** Octets des polices chargées (pour les intégrer à un export PNG). */
const fontBytes = new Map<string, Uint8Array>();

async function loadGameFonts(): Promise<void> {
  const read = reader;
  if (!read || fontsLoaded || typeof document === "undefined" || !("fonts" in document)) return;
  let any = false;
  for (const f of GAME_FONT_FILES) {
    const bytes = await read(f.file.zip, f.file.entry).catch(() => null);
    if (!bytes) continue;
    try {
      const face = new FontFace(GAME_FONT_FAMILY, bytes, { weight: f.weight });
      await face.load();
      document.fonts.add(face);
      fontBytes.set(f.weight, bytes);
      any = true;
    } catch {
      // police illisible : repli sur la police du thème
    }
  }
  if (any) {
    fontsLoaded = true;
    emit();
  }
}

export function gameFontsLoaded(): boolean {
  return fontsLoaded;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

let fontCss: string | null = null;

/** Règles `@font-face` des polices du jeu en données intégrées (export PNG). */
export function gameFontFaceCss(): string {
  if (fontCss !== null && fontsLoaded) return fontCss;
  fontCss = [...fontBytes.entries()]
    .map(
      ([weight, bytes]) =>
        `@font-face{font-family:"${GAME_FONT_FAMILY}";font-weight:${weight};src:url(data:font/ttf;base64,${toBase64(bytes)}) format("truetype");}`,
    )
    .join("\n");
  return fontCss;
}
