import { isPanelOpen } from "../dockApi";
import type { PanelId } from "../dockLayout";
import { PANEL_TITLES } from "../dockLayout";
import type { MenuItem } from "../../ui/menu/types";
import { typeSubmenu } from "./typeSubmenus";
import { t } from "../../i18n";

const PANEL_IDS = Object.keys(PANEL_TITLES) as PanelId[];

export function fileMenuItems(recentIds: string[]): MenuItem[] {
  const recent: MenuItem[] =
    recentIds.length === 0
      ? [{ type: "label", text: t("menu.none") }]
      : recentIds.map((id) => ({ type: "command" as const, id }));
  return [
    { type: "command", id: "file.new" },
    { type: "command", id: "file.newMod" },
    { type: "command", id: "file.open" },
    { type: "command", id: "file.openMod" },
    { type: "submenu", label: t("menu.recent"), children: recent },
    { type: "separator" },
    { type: "command", id: "file.save" },
    { type: "command", id: "file.saveAs" },
    {
      type: "submenu",
      label: t("menu.export"),
      children: [
        { type: "command", id: "file.export.viewport" },
        { type: "command", id: "file.export.ui" },
        { type: "separator" },
        { type: "command", id: "file.export.allViewports" },
        { type: "command", id: "file.export.allUis" },
        { type: "command", id: "file.export.all" },
      ],
    },
    { type: "separator" },
    { type: "command", id: "file.close" },
    { type: "separator" },
    { type: "command", id: "file.quit" },
  ];
}

export function editMenuItems(): MenuItem[] {
  return [
    { type: "command", id: "edit.undo" },
    { type: "command", id: "edit.redo" },
    { type: "separator" },
    { type: "command", id: "edit.cut" },
    { type: "command", id: "edit.copy" },
    { type: "command", id: "edit.paste" },
    { type: "command", id: "node.duplicate" },
    { type: "command", id: "node.delete" },
    { type: "separator" },
    { type: "command", id: "node.rename" },
    { type: "command", id: "node.moveUp" },
    { type: "command", id: "node.moveDown" },
    { type: "command", id: "node.outdent" },
    { type: "command", id: "node.selectParent" },
  ];
}

export function insertMenuItems(): MenuItem[] {
  return [
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
      label: t("menu.wrap"),
      children: typeSubmenu("node.wrap"),
    },
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
    { type: "command", id: "rule.new" },
  ];
}

export function viewMenuItems(): MenuItem[] {
  return [
    {
      type: "submenu",
      label: t("menu.panels"),
      children: PANEL_IDS.map((id) => ({
        type: "checkbox" as const,
        id: `view.togglePanel:${id}`,
        checked: isPanelOpen(id),
        label: PANEL_TITLES[id],
      })),
    },
    { type: "separator" },
    { type: "command", id: "preview.zoomIn" },
    { type: "command", id: "preview.zoomOut" },
    { type: "command", id: "preview.fit" },
    { type: "command", id: "preview.100" },
    { type: "command", id: "view.previewSettings" },
    { type: "separator" },
    {
      type: "submenu",
      label: t("menu.textSize"),
      children: [
        { type: "command", id: "view.density.compact" },
        { type: "command", id: "view.density.normal" },
      ],
    },
    { type: "command", id: "view.resetLayout" },
  ];
}

export function modMenuItems(): MenuItem[] {
  return [
    { type: "command", id: "mod.properties" },
    { type: "separator" },
    { type: "command", id: "mod.writeGui" },
    { type: "command", id: "mod.build" },
    { type: "command", id: "mod.install" },
    { type: "command", id: "mod.export" },
    { type: "separator" },
    { type: "command", id: "mod.verifyRuntime" },
    { type: "command", id: "mod.launchGame" },
    { type: "command", id: "mod.readGameLog" },
    { type: "separator" },
    { type: "command", id: "mod.openFolder" },
    { type: "command", id: "mod.openStaging" },
  ];
}

export function toolsMenuItems(): MenuItem[] {
  return [
    { type: "command", id: "tools.settings" },
    { type: "command", id: "tools.linkGame" },
    { type: "command", id: "tools.rescan" },
    { type: "separator" },
    { type: "command", id: "mod.checkTeal" },
  ];
}

export function helpMenuItems(): MenuItem[] {
  return [
    { type: "command", id: "help.shortcuts" },
    { type: "command", id: "help.wiki" },
    { type: "command", id: "help.api" },
    { type: "command", id: "help.about" },
  ];
}
