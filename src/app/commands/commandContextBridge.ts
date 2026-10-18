import type { CommandContext } from "./types";

let getter: (() => CommandContext) | null = null;

export function setCommandContextGetter(fn: () => CommandContext): void {
  getter = fn;
}

export function getCommandContext(): CommandContext {
  if (!getter) {
    throw new Error("CommandContext non initialisé.");
  }
  return getter();
}

/** Contexte avec cibles optionnelles (menus contextuels). */
export function withCommandTargets(targets: {
  targetNodeId?: string | null;
  targetScreenId?: string | null;
  targetRuleId?: string | null;
  targetPanelId?: string | null;
}): CommandContext {
  return { ...getCommandContext(), ...targets };
}
