import { join } from "../../tauri/pathUtil";
import { dirname } from "../../tauri/pathUtil";
import { loadSettings } from "../../settings/settingsStore";
import { useProjectStore } from "../../store/projectStore";
import { pushToast } from "../../store/toastStore";
import { launchGameForProject, refreshGameLog } from "../../verify/gameSession";
import { checkProjectRuntime } from "../../verify/runtimeCheck";
import { focusPanel, isPanelOpen, togglePanel } from "../dockApi";
import { registerCommands } from "./registry";
import { t } from "../../i18n";
import { errorMessage } from "../../i18n/backend";

function focusProblemsPanel(): void {
  if (!isPanelOpen("problems")) togglePanel("problems");
  focusPanel("problems");
}
import type { Command } from "./types";

const modCommands: Command[] = [
  {
    id: "mod.properties",
    group: "mod",
    isEnabled: (ctx) => !!ctx.project,
    run: (ctx) => ctx.ui.openModProperties(),
  },
  {
    id: "mod.writeGui",
    group: "mod",
    isEnabled: (ctx) => !!ctx.project,
    run: async (ctx) => ctx.ui.writeGui(),
  },
  {
    id: "mod.build",
    shortcut: "mod+b",
    icon: "Hammer",
    group: "mod",
    isEnabled: (ctx) => !!ctx.project,
    run: async (ctx) => ctx.ui.build(),
  },
  {
    id: "mod.install",
    shortcut: "f5",
    icon: "Download",
    group: "mod",
    isEnabled: (ctx) => !!ctx.project,
    run: async (ctx) => ctx.ui.install(),
  },
  {
    id: "mod.export",
    group: "mod",
    isEnabled: (ctx) => !!ctx.project,
    run: async (ctx) => ctx.ui.exportZip(),
  },
  {
    id: "mod.checkTeal",
    group: "mod",
    isEnabled: (ctx) => !!ctx.project,
    run: async (ctx) => ctx.ui.checkTeal(),
  },
  {
    id: "mod.openFolder",
    group: "mod",
    isEnabled: (ctx) => !!ctx.project && !!useProjectStore.getState().projectPath,
    run: async (ctx) => {
      const path = useProjectStore.getState().projectPath;
      const project = ctx.project;
      if (!path || !project) return;
      const modRoot = join(dirname(path), project.mod.modRoot);
      await ctx.ui.openPath(modRoot);
    },
  },
  {
    id: "mod.openStaging",
    group: "mod",
    isEnabled: (ctx) => !!ctx.project,
    run: async (ctx) => {
      const settings = await loadSettings();
      const project = ctx.project;
      if (!project) return;
      if (!settings.stagingArea.trim()) {
        pushToast(t("deploy.noStagingArea"), "error");
        return;
      }
      await ctx.ui.openPath(join(settings.stagingArea, project.mod.modId));
    },
  },
  {
    id: "mod.verifyRuntime",
    group: "mod",
    isEnabled: (ctx) => !!ctx.project,
    run: async (ctx) => {
      if (!ctx.project) return;
      const r = await checkProjectRuntime(ctx.project);
      if (!r.ran) pushToast(t("runtime.checkFailed", { reason: r.reason ?? "" }), "error");
      else if (r.errorCount > 0) {
        pushToast(t("runtime.errors", { n: r.errorCount }), "error");
        focusProblemsPanel();
      } else pushToast(t("runtime.ok"), "success");
    },
  },
  {
    id: "mod.launchGame",
    shortcut: "f6",
    icon: "Play",
    group: "mod",
    isEnabled: () => true,
    run: async () => {
      try {
        pushToast(await launchGameForProject(), "info");
      } catch (error) {
        pushToast(errorMessage(error), "error");
      }
    },
  },
  {
    id: "mod.readGameLog",
    group: "mod",
    isEnabled: (ctx) => !!ctx.project,
    run: async (ctx) => {
      if (!ctx.project) return;
      try {
        const errors = await refreshGameLog(ctx.project);
        pushToast(
          errors > 0 ? t("runtime.gameErrors", { n: errors }) : t("runtime.noGameErrors"),
          errors > 0 ? "error" : "success",
        );
        if (errors > 0) focusProblemsPanel();
      } catch (error) {
        pushToast(errorMessage(error), "error");
      }
    },
  },
  {
    id: "tools.settings",
    shortcut: "mod+,",
    group: "tools",
    isEnabled: () => true,
    run: (ctx) => ctx.ui.openSettings(),
  },
  {
    id: "tools.rescan",
    group: "tools",
    isEnabled: () => true,
    run: async (ctx) => ctx.ui.rescan(),
  },
  {
    id: "tools.linkGame",
    group: "tools",
    isEnabled: () => false,
    run: () => {},
  },
  {
    id: "tools.openModFolder",
    group: "tools",
    isEnabled: (ctx) => !!ctx.project && !!useProjectStore.getState().projectPath,
    run: async (ctx) => {
      const path = useProjectStore.getState().projectPath;
      const project = ctx.project;
      if (!path || !project) return;
      await ctx.ui.openPath(join(dirname(path), project.mod.modRoot));
    },
  },
  {
    id: "tools.openStaging",
    group: "tools",
    isEnabled: (ctx) => !!ctx.project,
    run: async (ctx) => {
      const settings = await loadSettings();
      const project = ctx.project;
      if (!project) return;
      if (!settings.stagingArea.trim()) {
        pushToast(t("deploy.noStagingArea"), "error");
        return;
      }
      await ctx.ui.openPath(join(settings.stagingArea, project.mod.modId));
    },
  },
];

export function registerModAndStubCommands(): void {
  registerCommands(modCommands);
}
