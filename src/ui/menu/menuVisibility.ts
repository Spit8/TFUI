import { getCommand, type CommandContext } from "../../app/commands";
import type { MenuItem } from "./types";

/** Une ligne de menu sera-t-elle affichée ? (commande connue et visible) */
export function isMenuItemShown(item: MenuItem, ctx: CommandContext): boolean {
  if (item.type === "command") {
    const cmd = getCommand(item.id);
    return Boolean(cmd && (!cmd.isVisible || cmd.isVisible(ctx)));
  }
  if (item.type === "submenu") {
    return item.children.some((c) => isMenuItemShown(c, ctx));
  }
  return item.type !== "separator";
}
