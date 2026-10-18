import type { UiNode } from "./types";

/** Presse-papier interne (sous-arbres), pas le clipboard OS. */
let clipboardRoot: UiNode | null = null;

export function setClipboardNode(node: UiNode | null): void {
  clipboardRoot = node;
}

export function getClipboardNode(): UiNode | null {
  return clipboardRoot;
}

export function hasClipboardNode(): boolean {
  return clipboardRoot !== null;
}
