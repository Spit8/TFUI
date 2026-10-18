import { typeCommandsByCategory } from "../commands/insertCommands";
import type { MenuItem } from "../../ui/menu/types";
import { categoryLabel } from "../../catalog/overrides";

export function typeSubmenu(
  prefix:
    | "node.addChild"
    | "node.insertBefore"
    | "node.insertAfter"
    | "node.wrap",
): MenuItem[] {
  return typeCommandsByCategory(prefix).map(({ category, ids }) => ({
    type: "submenu" as const,
    label: categoryLabel(category),
    children: ids.map((id) => ({ type: "command" as const, id })),
  }));
}
