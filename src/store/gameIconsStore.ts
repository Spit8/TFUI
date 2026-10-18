import { useSyncExternalStore } from "react";
import { loadImageIndex, readGameCacheFile } from "../app/gameCacheIo";
import { buildGameIcons, type GameIcon } from "../catalog/gameIcons";

/** Icônes du jeu importées (copie locale) : null tant que l’index n’est pas lu. */
let icons: GameIcon[] | null = null;
const listeners = new Set<() => void>();
const urls = new Map<string, Promise<string | null>>();

function emit(): void {
  for (const l of listeners) l();
}

/** (Re)lit l’index de la copie locale (après un import). */
export async function reloadGameIcons(): Promise<void> {
  const index = await loadImageIndex();
  for (const p of urls.values()) void p.then((u) => u && URL.revokeObjectURL(u));
  urls.clear();
  icons = index ? buildGameIcons(index) : [];
  emit();
}

export function getGameIcons(): GameIcon[] | null {
  return icons;
}

export function useGameIcons(): GameIcon[] | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getGameIcons,
    getGameIcons,
  );
}

/** URL affichable d’un PNG importé (mise en cache). */
export function iconUrl(png: string): Promise<string | null> {
  let p = urls.get(png);
  if (!p) {
    p = readGameCacheFile(png).then((bytes) =>
      bytes ? URL.createObjectURL(new Blob([bytes], { type: "image/png" })) : null,
    );
    urls.set(png, p);
  }
  return p;
}
