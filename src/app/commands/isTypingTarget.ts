type TagLike = {
  tagName?: string;
  isContentEditable?: boolean;
  classList?: { contains: (c: string) => boolean };
  closest?: (sel: string) => unknown;
};

/** True si le focus est dans un champ éditable (raccourcis projet à ignorer). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as TagLike;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  if (el.closest?.(".monaco-editor")) return true;
  if (el.classList?.contains("inputarea")) return true;
  return false;
}

/** Ctrl/Cmd+S reste actif même dans un champ (Sumend R3). */
export function shouldIgnoreShortcut(
  e: Pick<KeyboardEvent, "target">,
  isSaveShortcut: boolean,
): boolean {
  if (isSaveShortcut) return false;
  return isTypingTarget(e.target);
}
