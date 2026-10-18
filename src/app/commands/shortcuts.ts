import {
  ensureCommandsRegistered,
  findCommandByShortcut,
  shouldIgnoreShortcut,
} from "./index";
import type { CommandContext } from "./types";

/** `target` : fenêtre principale par défaut, ou une fenêtre détachée. */
export function installCommandShortcuts(
  getContext: () => CommandContext,
  target: Window = window,
): () => void {
  ensureCommandsRegistered();

  function onKeyDown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    const isSave = mod && e.key.toLowerCase() === "s";
    if (shouldIgnoreShortcut(e, isSave)) return;

    // Ne pas voler Ctrl+C/V natifs dans les champs (déjà filtrés) ;
    // hors champs : nos commandes arbre.
    const cmd = findCommandByShortcut(e);
    if (!cmd) return;
    const ctx = getContext();
    if (!cmd.isEnabled(ctx)) return;
    e.preventDefault();
    void cmd.run(ctx);
  }

  target.addEventListener("keydown", onKeyDown);
  return () => target.removeEventListener("keydown", onKeyDown);
}
