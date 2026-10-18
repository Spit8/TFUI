import { useSyncExternalStore } from "react";

export interface Toast {
  id: string;
  message: string;
  tone?: "info" | "success" | "error";
}

let toasts: Toast[] = [];
const listeners = new Set<() => void>();
let seq = 0;

function emit(): void {
  for (const l of listeners) l();
}

export function pushToast(
  message: string,
  tone: Toast["tone"] = "info",
  ms = 4000,
): void {
  const id = `t${++seq}`;
  toasts = [...toasts, { id, message, tone }];
  emit();
  window.setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, ms);
}

export function getToasts(): Toast[] {
  return toasts;
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getToasts,
    getToasts,
  );
}
