import { getCurrentWindow } from "@tauri-apps/api/window";
import { exportAll, exportCurrent } from "../previewExport";
import { t } from "../../i18n";
import { registerCommands } from "./registry";
import type { Command } from "./types";

const fileCommands: Command[] = [
  {
    id: "file.new",
    shortcut: "mod+n",
    group: "file",
    isEnabled: () => true,
    run: async (ctx) => {
      ctx.ui.newProject();
    },
  },
  {
    id: "file.newMod",
    group: "file",
    isEnabled: () => true,
    run: async (ctx) => {
      ctx.ui.newMod();
    },
  },
  {
    id: "file.open",
    shortcut: "mod+o",
    group: "file",
    isEnabled: () => true,
    run: async (ctx) => {
      await ctx.ui.open();
    },
  },
  {
    id: "file.openMod",
    group: "file",
    isEnabled: () => true,
    run: async (ctx) => {
      await ctx.ui.openMod();
    },
  },
  {
    id: "file.save",
    shortcut: "mod+s",
    group: "file",
    isEnabled: (ctx) => !!ctx.project,
    run: async (ctx) => ctx.ui.save(false),
  },
  {
    id: "file.saveAs",
    shortcut: "mod+shift+s",
    group: "file",
    isEnabled: (ctx) => !!ctx.project,
    run: async (ctx) => ctx.ui.save(true),
  },
  {
    id: "file.export.viewport",
    group: "file",
    isEnabled: (ctx) => !!ctx.project,
    run: (ctx) => (ctx.project ? exportCurrent(ctx.project, "viewport") : undefined),
  },
  {
    id: "file.export.ui",
    group: "file",
    isEnabled: (ctx) => !!ctx.project,
    run: (ctx) => (ctx.project ? exportCurrent(ctx.project, "ui") : undefined),
  },
  {
    id: "file.export.allViewports",
    group: "file",
    isEnabled: (ctx) => !!ctx.project,
    run: (ctx) => (ctx.project ? exportAll(ctx.project, ["viewport"]) : undefined),
  },
  {
    id: "file.export.allUis",
    group: "file",
    isEnabled: (ctx) => !!ctx.project,
    run: (ctx) => (ctx.project ? exportAll(ctx.project, ["ui"]) : undefined),
  },
  {
    id: "file.export.all",
    group: "file",
    isEnabled: (ctx) => !!ctx.project,
    run: (ctx) => (ctx.project ? exportAll(ctx.project, ["viewport", "ui"]) : undefined),
  },
  {
    id: "file.close",
    group: "file",
    isEnabled: (ctx) => !!ctx.project,
    run: async (ctx) => {
      if (ctx.dirty && !(await ctx.ui.confirmDiscard())) return;
      ctx.ui.closeProject();
    },
  },
  {
    id: "file.quit",
    shortcut: "mod+q",
    group: "file",
    isEnabled: () => true,
    run: async () => {
      try {
        await getCurrentWindow().close();
      } catch {
        window.close();
      }
    },
  },
];

let recentPaths: string[] = [];

export function setRecentProjectPaths(paths: string[]): void {
  recentPaths = paths.slice(0, 8);
}

export function getRecentCommandIds(): string[] {
  return recentPaths.map((_, i) => `file.openRecent:${i}`);
}

export function registerFileCommands(): void {
  registerCommands(fileCommands);
  for (let i = 0; i < 8; i++) {
    const index = i;
    registerCommands([
      {
        id: `file.openRecent:${index}`,
        labelFor: () => recentPaths[index] ?? t("cmd.file.recentN", { n: index + 1 }),
        group: "file",
        isEnabled: () => !!recentPaths[index],
        isVisible: () => !!recentPaths[index],
        run: async (ctx) => {
          const path = recentPaths[index];
          if (!path) return;
          await ctx.ui.openRecent(path);
        },
      },
    ]);
  }
}

/**
 * Ancien rafraîchissement des libellés des récents : ils sont désormais lus à
 * l’affichage (`labelFor`). Conservé pour les appelants existants.
 */
export function refreshRecentCommandLabels(): void {}
