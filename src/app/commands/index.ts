import { registerEditCommands } from "./editCommands";
import { registerFileCommands } from "./fileCommands";
import { registerHelpCommands } from "./helpCommands";
import { registerInsertCommands } from "./insertCommands";
import { registerMiscCommands } from "./miscCommands";
import { registerModAndStubCommands } from "./modCommands";
import { registerNodeCommands } from "./nodeCommands";
import { registerRuleCommands } from "./ruleCommands";
import { registerScreenCommands } from "./screenCommands";
import { registerViewCommands } from "./viewCommands";

let registered = false;

export function ensureCommandsRegistered(): void {
  if (registered) return;
  registerFileCommands();
  registerEditCommands();
  registerNodeCommands();
  registerInsertCommands();
  registerScreenCommands();
  registerRuleCommands();
  registerViewCommands();
  registerModAndStubCommands();
  registerHelpCommands();
  registerMiscCommands();
  registered = true;
}

export { findCommandByShortcut, getCommand, listCommands, runCommand } from "./registry";
export {
  getCommandContext,
  setCommandContextGetter,
  withCommandTargets,
} from "./commandContextBridge";
export { isTypingTarget, shouldIgnoreShortcut } from "./isTypingTarget";
export type { Command, CommandContext, CommandUiHandlers } from "./types";
export { typeCommandsByCategory } from "./insertCommands";
export {
  getRecentCommandIds,
  refreshRecentCommandLabels,
  setRecentProjectPaths,
} from "./fileCommands";
