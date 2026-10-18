import { useSyncExternalStore } from "react";

/** Règle CSS sélectionnée depuis l’inspecteur (lien « Voir dans Styles »). */
let selectedStyleRuleId: string | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function getSelectedStyleRuleId(): string | null {
  return selectedStyleRuleId;
}

export function setSelectedStyleRuleId(id: string | null): void {
  selectedStyleRuleId = id;
  emit();
}

export function subscribeStyleSelection(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSelectedStyleRuleId(): string | null {
  return useSyncExternalStore(
    subscribeStyleSelection,
    getSelectedStyleRuleId,
    getSelectedStyleRuleId,
  );
}
