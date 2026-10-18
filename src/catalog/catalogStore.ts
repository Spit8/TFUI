import { LazyStore } from "@tauri-apps/plugin-store";
import type { BaseStyles } from "../gamestyle/types";
import type { Catalog, StyleVocabulary } from "./types";

const STORE_FILE = "catalog-cache.json";

export interface CatalogCache {
  catalog: Catalog | null;
  vocabulary: StyleVocabulary | null;
  baseStyles: BaseStyles | null;
  scannedAt: string | null;
}

let storePromise: Promise<LazyStore> | null = null;

function getStore(): Promise<LazyStore> {
  if (!storePromise) {
    storePromise = Promise.resolve(new LazyStore(STORE_FILE));
  }
  return storePromise;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function loadCatalogCache(): Promise<CatalogCache> {
  if (!isTauriRuntime()) {
    return { catalog: null, vocabulary: null, baseStyles: null, scannedAt: null };
  }
  try {
    const store = await getStore();
    const catalog = (await store.get<Catalog>("catalog")) ?? null;
    const vocabulary =
      (await store.get<StyleVocabulary>("vocabulary")) ?? null;
    const baseStyles = (await store.get<BaseStyles>("baseStyles")) ?? null;
    const scannedAt = (await store.get<string>("scannedAt")) ?? null;
    return { catalog, vocabulary, baseStyles, scannedAt };
  } catch {
    return { catalog: null, vocabulary: null, baseStyles: null, scannedAt: null };
  }
}

export async function saveCatalogCache(
  catalog: Catalog,
  vocabulary: StyleVocabulary,
  baseStyles: BaseStyles | null,
): Promise<void> {
  if (!isTauriRuntime()) return;
  const store = await getStore();
  const scannedAt = new Date().toISOString();
  await store.set("catalog", catalog);
  await store.set("vocabulary", vocabulary);
  if (baseStyles) await store.set("baseStyles", baseStyles);
  await store.set("scannedAt", scannedAt);
  await store.save();
}

/** Met à jour le catalogue et/ou le vocabulaire (reconstruits après un changement du parseur ou de l’extracteur). */
export async function saveCatalogOnlyCache(catalog: Catalog | null, vocabulary?: StyleVocabulary | null): Promise<void> {
  if (!isTauriRuntime()) return;
  const store = await getStore();
  if (catalog) await store.set("catalog", catalog);
  if (vocabulary) await store.set("vocabulary", vocabulary);
  await store.save();
}

/** Met à jour seulement les styles de base (extraction différée au démarrage). */
export async function saveBaseStylesCache(baseStyles: BaseStyles): Promise<void> {
  if (!isTauriRuntime()) return;
  const store = await getStore();
  await store.set("baseStyles", baseStyles);
  await store.save();
}

/** Empreinte de version du jeu au moment du dernier scan (voir gameCache.ts). */
export async function loadGameFingerprint(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  try {
    return (await (await getStore()).get<string>("gameFingerprint")) ?? null;
  } catch {
    return null;
  }
}

export async function saveGameFingerprint(key: string): Promise<void> {
  if (!isTauriRuntime()) return;
  const store = await getStore();
  await store.set("gameFingerprint", key);
  await store.save();
}
