import { registerCommands } from "./registry";
import type { Command } from "./types";

const WIKI = "https://wiki.transportfever3.com/doku.php?id=modding:start&redirect=1";
const API_DOC = "https://tf3-docs.transportfever.net/en/index.html";

export function registerHelpCommands(): void {
  const cmds: Command[] = [
    {
      id: "help.shortcuts",
      group: "help",
      isEnabled: () => true,
      run: (ctx) => ctx.ui.showShortcuts(),
    },
    {
      id: "help.wiki",
      group: "help",
      isEnabled: () => true,
      run: (ctx) => ctx.ui.openExternal(WIKI),
    },
    {
      id: "help.api",
      group: "help",
      isEnabled: () => true,
      run: (ctx) => ctx.ui.openExternal(API_DOC),
    },
    {
      id: "help.about",
      group: "help",
      isEnabled: () => true,
      run: (ctx) => ctx.ui.showAbout(),
    },
  ];
  registerCommands(cmds);
}
