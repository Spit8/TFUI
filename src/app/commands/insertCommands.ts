import {
  COMPONENT_OVERRIDES,
  WHITELIST_ORDER,
  resolveCategory,
} from "../../catalog/overrides";
import { getActiveCatalog } from "../../catalog/activeCatalog";
import { primaryInsertSlot } from "../../model/slots";
import { canPlaceType, findNode } from "../../model/treeOps";
import { useProjectStore } from "../../store/projectStore";
import { registerCommands } from "./registry";
import { effectiveNodeId, type Command } from "./types";
import { t } from "../../i18n";

function insertBeside(nodeId: string, type: string, after: boolean): void {
  const project = useProjectStore.getState().project;
  if (!project) return;
  const loc = findNode(project, nodeId);
  if (!loc?.parentId || loc.slot == null) return;
  const index = after ? loc.index + 1 : loc.index;
  useProjectStore.getState().insertChild(loc.parentId, type, loc.slot, index);
}

export function buildTypeMenuCommands(
  prefix:
    | "node.addChild"
    | "node.insertBefore"
    | "node.insertAfter"
    | "node.wrap",
): Command[] {
  const cmds: Command[] = [];
  for (const type of WHITELIST_ORDER) {
    const icon = COMPONENT_OVERRIDES[type]?.icon ?? type;
    cmds.push({
      id: `${prefix}:${type}`,
      label: type,
      icon,
      group: "node",
      isEnabled: (ctx) => {
        const project = ctx.project;
        const nodeId = effectiveNodeId(ctx);
        if (!project || !nodeId) return false;
        const loc = findNode(project, nodeId);
        if (!loc) return false;
        const catalog = getActiveCatalog();

        if (prefix === "node.wrap") {
          return true;
        }
        if (prefix === "node.addChild") {
          const slot = primaryInsertSlot(loc.node.type, catalog);
          if (!slot) return false;
          return canPlaceType(
            loc.node.type,
            slot,
            type,
            loc.node.slots,
            undefined,
            catalog,
          ).ok;
        }
        if (!loc.parentId || loc.slot == null) return false;
        const parent = findNode(project, loc.parentId);
        if (!parent) return false;
        return canPlaceType(
          parent.node.type,
          loc.slot,
          type,
          parent.node.slots,
          undefined,
          catalog,
        ).ok;
      },
      disabledReason: (ctx) => {
        const project = ctx.project;
        const nodeId = effectiveNodeId(ctx);
        if (!project || !nodeId) return t("cmdReason.noSelection");
        const loc = findNode(project, nodeId);
        if (!loc) return t("ops.nodeNotFound");
        const catalog = getActiveCatalog();
        if (prefix === "node.wrap") return undefined;
        if (prefix === "node.addChild") {
          const slot = primaryInsertSlot(loc.node.type, catalog);
          if (!slot) return t("cmdReason.noInsertSlot");
          const r = canPlaceType(
            loc.node.type,
            slot,
            type,
            loc.node.slots,
            undefined,
            catalog,
          );
          return r.ok ? undefined : r.reason;
        }
        if (!loc.parentId || loc.slot == null) {
          return t("ops.notBesideRoot");
        }
        const parent = findNode(project, loc.parentId);
        if (!parent) return t("ops.parentNotFound");
        const r = canPlaceType(
          parent.node.type,
          loc.slot,
          type,
          parent.node.slots,
          undefined,
          catalog,
        );
        return r.ok ? undefined : r.reason;
      },
      run: (ctx) => {
        const nodeId = effectiveNodeId(ctx);
        if (!nodeId) return;
        if (prefix === "node.addChild") {
          useProjectStore.getState().insertChild(nodeId, type);
          return;
        }
        if (prefix === "node.wrap") {
          const loc = ctx.project ? findNode(ctx.project, nodeId) : null;
          if (loc) {
            useProjectStore.getState().setSelection(loc.screenId, nodeId);
            useProjectStore.getState().wrapSelected(type);
          }
          return;
        }
        insertBeside(nodeId, type, prefix === "node.insertAfter");
      },
    });
  }
  return cmds;
}

export function typeCommandsByCategory(
  prefix:
    | "node.addChild"
    | "node.insertBefore"
    | "node.insertAfter"
    | "node.wrap",
): { category: string; ids: string[] }[] {
  const map = new Map<string, string[]>();
  for (const type of WHITELIST_ORDER) {
    const cat = resolveCategory(type);
    const list = map.get(cat) ?? [];
    list.push(`${prefix}:${type}`);
    map.set(cat, list);
  }
  return [...map.entries()].map(([category, ids]) => ({ category, ids }));
}

export function registerInsertCommands(): void {
  registerCommands([
    ...buildTypeMenuCommands("node.addChild"),
    ...buildTypeMenuCommands("node.insertBefore"),
    ...buildTypeMenuCommands("node.insertAfter"),
    ...buildTypeMenuCommands("node.wrap"),
  ]);
}
