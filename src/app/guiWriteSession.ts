let guiWriteDiffSeen = false;

export function hasSeenGuiWriteDiff(): boolean {
  return guiWriteDiffSeen;
}

export function markGuiWriteDiffSeen(): void {
  guiWriteDiffSeen = true;
}

export function resetGuiWriteDiffSession(): void {
  guiWriteDiffSeen = false;
}
