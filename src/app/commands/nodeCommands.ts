import { findLineForNode } from "../../codegen";
import { findNode } from "../../model/treeOps";
import { requestCodeReveal } from "../../store/codeRevealStore";
import { getGeneratedFilesSnapshot } from "../../store/generatedFilesStore";
import { useProjectStore } from "../../store/projectStore";
import {
  detachPanel,
  focusPanel,
  getDockApi,
  isPanelOpen,
  isPanelPoppedOut,
  reattachPanel,
  togglePanel,
} from "../dockApi";
import { requestInlineRename } from "./inlineRenameBridge";
import { registerCommands } from "./registry";
import { effectiveNodeId, type Command, type CommandContext } from "./types";
import { t } from "../../i18n";

function hasSelection(ctx: CommandContext) {
  return !!ctx.project && !!effectiveNodeId(ctx);
}

function selectTarget(ctx: CommandContext): string | null {
  const id = effectiveNodeId(ctx);
  if (!id || !ctx.project) return null;
  const loc = findNode(ctx.project, id);
  if (loc) useProjectStore.getState().setSelection(loc.screenId, id);
  return id;
}

const nodeCommands: Command[] = [
  {
    id: "node.duplicate",
    shortcut: "mod+d",
    group: "node",
    isEnabled: hasSelection,
    run: (ctx) => {
      if (selectTarget(ctx)) useProjectStore.getState().duplicateSelected();
    },
  },
  {
    id: "node.delete",
    shortcut: "delete",
    group: "node",
    isEnabled: (ctx) => {
      const id = effectiveNodeId(ctx);
      if (!ctx.project || !id) return false;
      const loc = findNode(ctx.project, id);
      return !!loc && loc.parentId !== null;
    },
    disabledReason: (ctx) => {
      const id = effectiveNodeId(ctx);
      const loc = id && ctx.project ? findNode(ctx.project, id) : null;
      if (loc && loc.parentId === null) {
        return t("cmdReason.rootCannotBeDeleted");
      }
      return undefined;
    },
    run: (ctx) => {
      if (selectTarget(ctx)) useProjectStore.getState().deleteSelected();
    },
  },
  {
    id: "node.moveUp",
    shortcut: "alt+up",
    group: "node",
    isEnabled: (ctx) => {
      const id = effectiveNodeId(ctx);
      if (!ctx.project || !id) return false;
      const loc = findNode(ctx.project, id);
      return !!loc && loc.parentId !== null;
    },
    run: (ctx) => {
      if (selectTarget(ctx)) useProjectStore.getState().moveSelectedUp();
    },
  },
  {
    id: "node.moveDown",
    shortcut: "alt+down",
    group: "node",
    isEnabled: (ctx) => {
      const id = effectiveNodeId(ctx);
      if (!ctx.project || !id) return false;
      const loc = findNode(ctx.project, id);
      return !!loc && loc.parentId !== null;
    },
    run: (ctx) => {
      if (selectTarget(ctx)) useProjectStore.getState().moveSelectedDown();
    },
  },
  {
    id: "node.outdent",
    shortcut: "mod+[",
    group: "node",
    isEnabled: hasSelection,
    run: (ctx) => {
      if (selectTarget(ctx)) useProjectStore.getState().outdentSelected();
    },
  },
  {
    id: "node.unwrap",
    group: "node",
    isEnabled: hasSelection,
    run: (ctx) => {
      if (selectTarget(ctx)) useProjectStore.getState().unwrapSelected();
    },
  },
  {
    id: "node.rename",
    shortcut: "f2",
    group: "node",
    isEnabled: hasSelection,
    run: (ctx) => {
      const id = selectTarget(ctx);
      if (id) requestInlineRename(id);
    },
  },
  {
    id: "node.selectParent",
    group: "node",
    isEnabled: (ctx) => {
      const id = effectiveNodeId(ctx);
      if (!ctx.project || !id) return false;
      const loc = findNode(ctx.project, id);
      return !!loc?.parentId;
    },
    run: (ctx) => {
      const id = effectiveNodeId(ctx);
      if (!id || !ctx.project) return;
      const loc = findNode(ctx.project, id);
      if (loc?.parentId) {
        useProjectStore.getState().setSelection(loc.screenId, loc.parentId);
      }
    },
  },
  {
    id: "node.toggleHidden",
    group: "node",
    isEnabled: hasSelection,
    run: (ctx) => {
      const id = selectTarget(ctx);
      if (id) useProjectStore.getState().toggleNodeHidden(id);
    },
  },
  {
    id: "node.toggleLocked",
    group: "node",
    isEnabled: hasSelection,
    run: (ctx) => {
      const id = selectTarget(ctx);
      if (id) useProjectStore.getState().toggleNodeLocked(id);
    },
  },
  {
    id: "node.revealInCode",
    group: "node",
    isEnabled: hasSelection,
    run: (ctx) => {
      const id = selectTarget(ctx);
      if (!id) return;
      const files = getGeneratedFilesSnapshot().files;
      const hit = files.find((f) =>
        f.sourceMap.some((e) => e.nodeId === id),
      );
      const line = hit ? findLineForNode(hit.sourceMap, id) : null;
      if (line != null) {
        requestCodeReveal({
          path: hit?.path,
          line,
          nodeId: id,
        });
      }
      if (!isPanelOpen("code")) togglePanel("code");
      focusPanel("code");
    },
  },
  {
    id: "dock.tab.close",
    group: "view",
    isEnabled: () => true,
    run: (ctx) => {
      if (ctx.targetPanelId) {
        void import("../dockApi").then((m) => m.closePanel(ctx.targetPanelId!));
      }
    },
  },
  {
    id: "dock.tab.closeOthers",
    group: "view",
    isEnabled: () => true,
    run: (ctx) => {
      if (ctx.targetPanelId) {
        void import("../dockApi").then((m) =>
          m.closeOtherPanels(ctx.targetPanelId!),
        );
      }
    },
  },
  {
    id: "dock.tab.detach",
    group: "view",
    isEnabled: (ctx) => {
      const id = ctx.targetPanelId;
      if (!id) return false;
      return Boolean(getDockApi()?.getPanel(id)) && !isPanelPoppedOut(id);
    },
    run: (ctx) => {
      if (ctx.targetPanelId) detachPanel(ctx.targetPanelId);
    },
  },
  {
    id: "dock.tab.reattach",
    group: "view",
    isEnabled: (ctx) => {
      const id = ctx.targetPanelId;
      if (!id) return false;
      return isPanelPoppedOut(id);
    },
    run: (ctx) => {
      if (ctx.targetPanelId) reattachPanel(ctx.targetPanelId);
    },
  },
];

export function registerNodeCommands(): void {
  registerCommands(nodeCommands);
}
