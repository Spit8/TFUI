/** Lecture / écriture de l’état ouvert des sections CollapsibleSection. */

export type SectionOpenMap = Record<string, boolean>;

export function readSectionMap(storageKey: string): SectionOpenMap {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: SectionOpenMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "boolean") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeSectionMap(
  storageKey: string,
  map: SectionOpenMap,
): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    // quota / private mode
  }
}

export function getSectionOpen(
  storageKey: string,
  id: string,
  defaultOpen: boolean,
): boolean {
  const map = readSectionMap(storageKey);
  if (id in map) return map[id]!;
  return defaultOpen;
}

export function setSectionOpen(
  storageKey: string,
  id: string,
  open: boolean,
): void {
  const map = readSectionMap(storageKey);
  map[id] = open;
  writeSectionMap(storageKey, map);
}

/** Alt+clic : bascule toutes les sections connues du même storageKey. */
export function toggleAllSections(
  storageKey: string,
  knownIds: string[],
  open: boolean,
): void {
  const map = readSectionMap(storageKey);
  for (const id of knownIds) {
    map[id] = open;
  }
  writeSectionMap(storageKey, map);
}

const listeners = new Map<string, Set<() => void>>();

export function subscribeSectionStorage(
  storageKey: string,
  listener: () => void,
): () => void {
  let set = listeners.get(storageKey);
  if (!set) {
    set = new Set();
    listeners.set(storageKey, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
  };
}

export function notifySectionStorage(storageKey: string): void {
  const set = listeners.get(storageKey);
  if (!set) return;
  for (const l of set) l();
}
