import { findNode } from "../../model/treeOps";
import { useProjectStore } from "../../store/projectStore";
import { registerCommands } from "./registry";
import { effectiveNodeId, type Command } from "./types";
import { t } from "../../i18n";

const editCommands: Command[] = [
  {
    id: "edit.undo",
    shortcut: "mod+z",
    group: "edit",
    isEnabled: () => useProjectStore.getState().canUndo(),
    run: () => useProjectStore.getState().undo(),
  },
  {
    id: "edit.redo",
    shortcut: "mod+y",
    group: "edit",
    isEnabled: () => useProjectStore.getState().canRedo(),
    run: () => useProjectStore.getState().redo(),
  },
  {
    id: "edit.redoAlt",
    shortcut: "mod+shift+z",
    group: "edit",
    isEnabled: () => useProjectStore.getState().canRedo(),
    run: () => useProjectStore.getState().redo(),
  },
  {
    id: "edit.copy",
    shortcut: "mod+c",
    group: "edit",
    isEnabled: (ctx) => !!ctx.project && !!effectiveNodeId(ctx),
    run: (ctx) => {
      const id = effectiveNodeId(ctx);
      if (!id || !ctx.project) return;
      const loc = findNode(ctx.project, id);
      if (loc) {
        useProjectStore.getState().setSelection(loc.screenId, id);
        useProjectStore.getState().copySelected();
      }
    },
  },
  {
    id: "edit.paste",
    shortcut: "mod+v",
    group: "edit",
    isEnabled: (ctx) => !!ctx.project && !!effectiveNodeId(ctx),
    run: (ctx) => {
      const id = effectiveNodeId(ctx);
      if (!id || !ctx.project) return;
      const loc = findNode(ctx.project, id);
      if (loc) {
        useProjectStore.getState().setSelection(loc.screenId, id);
        useProjectStore.getState().pasteAtSelection();
      }
    },
  },
  {
    id: "edit.cut",
    shortcut: "mod+x",
    group: "edit",
    isEnabled: (ctx) => {
      const id = effectiveNodeId(ctx);
      if (!ctx.project || !id) return false;
      const loc = findNode(ctx.project, id);
      return !!loc && loc.parentId !== null;
    },
    disabledReason: (ctx) => {
      const id = effectiveNodeId(ctx);
      if (!id) return t("cmdReason.noSelection");
      const loc = ctx.project ? findNode(ctx.project, id) : null;
      if (loc && loc.parentId === null) return t("cmdReason.rootCannotBeCut");
      return undefined;
    },
    run: (ctx) => {
      const id = effectiveNodeId(ctx);
      if (!id || !ctx.project) return;
      const loc = findNode(ctx.project, id);
      if (!loc || loc.parentId === null) return;
      useProjectStore.getState().setSelection(loc.screenId, id);
      useProjectStore.getState().copySelected();
      useProjectStore.getState().deleteSelected();
    },
  },
];

export function registerEditCommands(): void {
  registerCommands(editCommands);
}
