import type { MenuItem } from "../../ui/menu/types";
import { typeSubmenu } from "./typeSubmenus";
import { t } from "../../i18n";

export function nodeContextMenuItems(opts?: {
  warnings?: string[];
}): MenuItem[] {
  const head: MenuItem[] = (opts?.warnings ?? []).map((text) => ({
    type: "label" as const,
    text: `⚠ ${text}`,
    danger: true,
  }));
  if (head.length) head.push({ type: "separator" });
  return [
    ...head,
    { type: "command", id: "node.rename" },
    { type: "command", id: "node.duplicate" },
    { type: "command", id: "edit.cut" },
    { type: "command", id: "edit.copy" },
    { type: "command", id: "edit.paste" },
    { type: "command", id: "node.delete" },
    { type: "separator" },
    {
      type: "submenu",
      label: t("menu.addChild"),
      children: typeSubmenu("node.addChild"),
    },
    {
      type: "submenu",
      label: t("menu.insertBefore"),
      children: typeSubmenu("node.insertBefore"),
    },
    {
      type: "submenu",
      label: t("menu.insertAfter"),
      children: typeSubmenu("node.insertAfter"),
    },
    {
      type: "submenu",
      label: t("menu.addParent"),
      children: typeSubmenu("node.wrap"),
    },
    { type: "command", id: "node.unwrap" },
    { type: "separator" },
    { type: "command", id: "node.moveUp" },
    { type: "command", id: "node.moveDown" },
    { type: "command", id: "node.outdent" },
    { type: "separator" },
    { type: "command", id: "node.selectParent" },
    { type: "command", id: "node.toggleHidden" },
    { type: "command", id: "node.toggleLocked" },
    { type: "command", id: "node.revealInCode" },
  ];
}

export function screenHeaderMenuItems(): MenuItem[] {
  return [
    { type: "command", id: "screen.rename" },
    { type: "command", id: "screen.duplicate" },
    { type: "command", id: "screen.delete" },
    { type: "separator" },
    {
      type: "submenu",
      label: t("menu.newScreen"),
      children: [
        { type: "command", id: "screen.new:window" },
        { type: "command", id: "screen.new:recipe" },
        { type: "command", id: "screen.new:plugin" },
      ],
    },
  ];
}

export function treeBackgroundMenuItems(): MenuItem[] {
  return [
    {
      type: "submenu",
      label: t("menu.newScreen"),
      children: [
        { type: "command", id: "screen.new:window" },
        { type: "command", id: "screen.new:recipe" },
        { type: "command", id: "screen.new:plugin" },
      ],
    },
    { type: "command", id: "edit.paste" },
  ];
}

export function styleRuleMenuItems(): MenuItem[] {
  return [
    { type: "command", id: "rule.selectTargets" },
    { type: "separator" },
    { type: "command", id: "rule.duplicate" },
    { type: "command", id: "rule.delete" },
    { type: "command", id: "rule.moveUp" },
    { type: "command", id: "rule.moveDown" },
  ];
}

export function problemsRowMenuItems(): MenuItem[] {
  return [
    { type: "command", id: "problems.goToNode" },
    { type: "command", id: "problems.copyMessage" },
  ];
}

export function codePanelMenuItems(): MenuItem[] {
  return [
    { type: "command", id: "code.copy" },
    { type: "command", id: "node.revealInCode" },
    { type: "command", id: "mod.openFolder" },
  ];
}

export function dockTabMenuItems(): MenuItem[] {
  return [
    { type: "command", id: "dock.tab.close" },
    { type: "command", id: "dock.tab.closeOthers" },
    { type: "separator" },
    { type: "command", id: "dock.tab.detach" },
    { type: "command", id: "dock.tab.reattach" },
  ];
}
