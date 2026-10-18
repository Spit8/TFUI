import { findNode } from "../../model/treeOps";
import { countRuleTargets } from "../../preview/cascade";
import { useProjectStore } from "../../store/projectStore";
import { setSelectedStyleRuleId } from "../../store/styleSelectionStore";
import { addSharedClass } from "../sharedClasses";
import { registerCommands } from "./registry";
import type { Command } from "./types";
import { t } from "../../i18n";

function ruleId(ctx: { targetRuleId?: string | null }): string | null {
  return ctx.targetRuleId ?? null;
}

export function registerRuleCommands(): void {
  const cmds: Command[] = [
    {
      id: "rule.new",
      group: "rule",
      isEnabled: (ctx) => !!ctx.project,
      run: (ctx) => {
        if (!ctx.project) return;
        const id = addSharedClass(ctx.project);
        if (id) setSelectedStyleRuleId(id);
      },
    },
    {
      id: "rule.duplicate",
      group: "rule",
      isEnabled: (ctx) => !!ctx.project && !!ruleId(ctx),
      run: (ctx) => {
        const id = ruleId(ctx);
        const project = ctx.project;
        if (!id || !project) return;
        const rule = project.styleRules.find((r) => r.id === id);
        if (!rule) return;
        useProjectStore.getState().addStyleRule({
          selector: rule.selector,
          props: { ...rule.props },
          comment: rule.comment,
        });
      },
    },
    {
      id: "rule.selectTargets",
      group: "rule",
      isEnabled: (ctx) => {
        const id = ruleId(ctx);
        const rule = ctx.project?.styleRules.find((r) => r.id === id);
        return !!ctx.project && !!rule && countRuleTargets(ctx.project, rule).length > 0;
      },
      disabledReason: () => t("cmdReason.noElementWithClass"),
      run: (ctx) => {
        const id = ruleId(ctx);
        const project = ctx.project;
        const rule = project?.styleRules.find((r) => r.id === id);
        if (!project || !rule) return;
        const targets = countRuleTargets(project, rule);
        // Parcourt les éléments ciblés à chaque appel.
        const next =
          targets[(targets.indexOf(ctx.selectedNodeId ?? "") + 1) % targets.length];
        const loc = next ? findNode(project, next) : null;
        if (loc) useProjectStore.getState().setSelection(loc.screenId, loc.node.id);
      },
    },
    {
      id: "rule.delete",
      group: "rule",
      isEnabled: (ctx) => !!ctx.project && !!ruleId(ctx),
      run: (ctx) => {
        const id = ruleId(ctx);
        if (id) useProjectStore.getState().removeStyleRule(id);
      },
    },
    {
      id: "rule.moveUp",
      group: "rule",
      isEnabled: (ctx) => {
        const id = ruleId(ctx);
        const project = ctx.project;
        if (!id || !project) return false;
        const idx = project.styleRules.findIndex((r) => r.id === id);
        return idx > 0;
      },
      run: (ctx) => {
        const id = ruleId(ctx);
        const project = ctx.project;
        if (!id || !project) return;
        const idx = project.styleRules.findIndex((r) => r.id === id);
        if (idx > 0) {
          useProjectStore.getState().reorderStyleRules(idx, idx - 1);
        }
      },
    },
    {
      id: "rule.moveDown",
      group: "rule",
      isEnabled: (ctx) => {
        const id = ruleId(ctx);
        const project = ctx.project;
        if (!id || !project) return false;
        const idx = project.styleRules.findIndex((r) => r.id === id);
        return idx >= 0 && idx < project.styleRules.length - 1;
      },
      run: (ctx) => {
        const id = ruleId(ctx);
        const project = ctx.project;
        if (!id || !project) return;
        const idx = project.styleRules.findIndex((r) => r.id === id);
        if (idx >= 0 && idx < project.styleRules.length - 1) {
          useProjectStore.getState().reorderStyleRules(idx, idx + 1);
        }
      },
    },
  ];
  registerCommands(cmds);
}
