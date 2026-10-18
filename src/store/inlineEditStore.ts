import { useSyncExternalStore } from "react";
import type { InlineEditTarget } from "../model/inlineEdit";

/** Édition en place dans l’aperçu (double-clic) : texte affiché ou nom. */
let current: InlineEditTarget | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function startInlineEdit(target: InlineEditTarget): void {
  current = target;
  emit();
}

export function stopInlineEdit(): void {
  if (!current) return;
  current = null;
  emit();
}

export function getInlineEdit(): InlineEditTarget | null {
  return current;
}

export function useInlineEdit(): InlineEditTarget | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getInlineEdit,
    getInlineEdit,
  );
}
