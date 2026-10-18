import { useSyncExternalStore } from "react";

export interface CodeRevealRequest {
  path?: string;
  line: number;
  nodeId: string;
}

let pending: CodeRevealRequest | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function subscribeCodeReveal(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPendingCodeReveal(): CodeRevealRequest | null {
  return pending;
}

export function requestCodeReveal(req: CodeRevealRequest): void {
  pending = req;
  emit();
}

/** Consume and clear the pending reveal (CodePanel). */
export function takePendingCodeReveal(): CodeRevealRequest | null {
  const cur = pending;
  if (cur) {
    pending = null;
    emit();
  }
  return cur;
}

export function usePendingCodeReveal(): CodeRevealRequest | null {
  return useSyncExternalStore(
    subscribeCodeReveal,
    getPendingCodeReveal,
    getPendingCodeReveal,
  );
}
