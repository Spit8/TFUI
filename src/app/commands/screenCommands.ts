import { useProjectStore } from "../../store/projectStore";
import { registerCommands } from "./registry";
import { effectiveScreenId, type Command } from "./types";
import { t } from "../../i18n";

export function registerScreenCommands(): void {
  const cmds: Command[] = [
    {
      id: "screen.new:window",
      group: "screen",
      isEnabled: (ctx) => !!ctx.project,
      run: () => useProjectStore.getState().addScreen("window"),
    },
    {
      id: "screen.new:recipe",
      group: "screen",
      isEnabled: (ctx) => !!ctx.project,
      run: () => useProjectStore.getState().addScreen("recipe"),
    },
    {
      id: "screen.new:plugin",
      group: "screen",
      isEnabled: (ctx) => !!ctx.project,
      run: () => useProjectStore.getState().addScreen("plugin"),
    },
    {
      id: "screen.duplicate",
      group: "screen",
      isEnabled: (ctx) => !!ctx.project && !!effectiveScreenId(ctx),
      run: (ctx) =>
        useProjectStore.getState().duplicateScreen(effectiveScreenId(ctx)),
    },
    {
      id: "screen.delete",
      group: "screen",
      isEnabled: (ctx) => {
        const p = ctx.project;
        return !!p && p.screens.length > 1 && !!effectiveScreenId(ctx);
      },
      disabledReason: (ctx) =>
        ctx.project && ctx.project.screens.length <= 1
          ? t("ops.cannotDeleteLastScreen")
          : undefined,
      run: (ctx) =>
        useProjectStore.getState().deleteScreen(effectiveScreenId(ctx)),
    },
    {
      id: "screen.rename",
      group: "screen",
      isEnabled: (ctx) => !!ctx.project && !!effectiveScreenId(ctx),
      run: (ctx) => {
        const id = effectiveScreenId(ctx);
        const screen = ctx.project?.screens.find((s) => s.id === id);
        if (!id || !screen) return;
        const name = window.prompt(t("cmdReason.recipeNamePrompt"), screen.recipeName);
        if (name && name.trim()) {
          useProjectStore
            .getState()
            .updateScreenMeta(id, { recipeName: name.trim() });
        }
      },
    },
  ];
  registerCommands(cmds);
}
