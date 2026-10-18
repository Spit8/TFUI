import { useProjectStore } from "../../store/projectStore";
import { registerCommands } from "./registry";
import type { Command } from "./types";

let pendingProblemMessage: string | null = null;
let pendingProblemNode: { screenId: string | null; nodeId: string | null } | null =
  null;

export function setPendingProblemTarget(
  message: string,
  screenId: string | null,
  nodeId: string | null,
): void {
  pendingProblemMessage = message;
  pendingProblemNode = { screenId, nodeId };
}

export function registerMiscCommands(): void {
  const cmds: Command[] = [
    {
      id: "problems.goToNode",
      group: "view",
      isEnabled: () => !!pendingProblemNode?.nodeId || !!pendingProblemNode?.screenId,
      run: () => {
        if (!pendingProblemNode) return;
        useProjectStore
          .getState()
          .setSelection(
            pendingProblemNode.screenId,
            pendingProblemNode.nodeId,
          );
      },
    },
    {
      id: "problems.copyMessage",
      group: "view",
      isEnabled: () => !!pendingProblemMessage,
      run: async () => {
        if (pendingProblemMessage) {
          await navigator.clipboard.writeText(pendingProblemMessage);
        }
      },
    },
    {
      id: "code.copy",
      group: "view",
      isEnabled: () => true,
      run: async () => {
        const sel = window.getSelection()?.toString();
        if (sel) await navigator.clipboard.writeText(sel);
      },
    },
  ];
  registerCommands(cmds);
}
