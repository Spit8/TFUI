import type { Command, CommandContext } from "./types";

const commands = new Map<string, Command>();

export function registerCommand(command: Command): void {
  commands.set(command.id, command);
}

export function registerCommands(list: Command[]): void {
  for (const c of list) registerCommand(c);
}

export function getCommand(id: string): Command | undefined {
  return commands.get(id);
}

export function listCommands(): Command[] {
  return [...commands.values()];
}

export function findCommandByShortcut(
  e: KeyboardEvent,
): Command | undefined {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  for (const cmd of commands.values()) {
    if (!cmd.shortcut) continue;
    if (matchShortcut(cmd.shortcut, mod, e.altKey, e.shiftKey, key, e.key)) {
      return cmd;
    }
  }
  return undefined;
}

function matchShortcut(
  shortcut: string,
  mod: boolean,
  alt: boolean,
  shift: boolean,
  keyLower: string,
  keyRaw: string,
): boolean {
  const parts = shortcut.toLowerCase().split("+");
  const wantMod = parts.includes("mod") || parts.includes("ctrl") || parts.includes("cmd");
  const wantAlt = parts.includes("alt");
  const wantShift = parts.includes("shift");
  const main = parts[parts.length - 1];
  if (wantMod !== mod || wantAlt !== alt || wantShift !== shift) return false;
  if (main === "delete" || main === "del") {
    return keyRaw === "Delete" || keyRaw === "Backspace";
  }
  if (main === "up") return keyRaw === "ArrowUp";
  if (main === "down") return keyRaw === "ArrowDown";
  if (main === "f2") return keyRaw === "F2";
  if (main === "f5") return keyRaw === "F5";
  if (main.length === 1) return keyLower === main;
  return keyRaw.toLowerCase() === main || keyLower.toLowerCase() === main;
}

export async function runCommand(
  id: string,
  ctx: CommandContext,
): Promise<boolean> {
  const cmd = commands.get(id);
  if (!cmd) return false;
  if (!cmd.isEnabled(ctx)) return false;
  await cmd.run(ctx);
  return true;
}
