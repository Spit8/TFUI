/** Pont TreePanel ↔ commande node.rename (édition en place, sans window.prompt). */

type RenameHandler = (nodeId: string) => void;

let handler: RenameHandler | null = null;

export function setInlineRenameHandler(fn: RenameHandler | null): void {
  handler = fn;
}

export function requestInlineRename(nodeId: string): void {
  handler?.(nodeId);
}
