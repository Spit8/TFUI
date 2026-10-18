import type { DockviewApi } from "dockview";
import {
  PANEL_TITLES,
  type PanelId,
  buildDefaultLayout,
  resetPersistedLayout,
} from "./dockLayout";
import { POPOUT_URL } from "./popoutLayout";
import { closePopoutGroup, popoutGroups } from "./popoutWindows";

let api: DockviewApi | null = null;

export function setDockApi(next: DockviewApi | null): void {
  api = next;
}

export function getDockApi(): DockviewApi | null {
  return api;
}

export function isPanelOpen(id: PanelId): boolean {
  return Boolean(api?.getPanel(id));
}

export function togglePanel(id: PanelId): void {
  if (!api) return;
  const existing = api.getPanel(id);
  if (existing) {
    // Panneau présent mais invisible (groupe masqué) : on le montre au lieu
    // de le fermer.
    if (!existing.group.api.isVisible) {
      existing.group.api.setVisible(true);
      existing.api.setActive();
      return;
    }
    existing.api.close();
    return;
  }
  api.addPanel({
    id,
    component: id,
    title: PANEL_TITLES[id],
  });
}

export function focusPanel(id: PanelId): void {
  api?.getPanel(id)?.api.setActive();
}

export function closePanel(id: string): void {
  api?.getPanel(id)?.api.close();
}

export function closeOtherPanels(keepId: string): void {
  if (!api) return;
  const keep = api.getPanel(keepId);
  for (const p of [...api.panels]) {
    // Seulement les panneaux du même groupe : fermer les autres ne doit pas
    // fermer les fenêtres détachées.
    if (p.id !== keepId && p.group === keep?.group) p.api.close();
  }
}

export function isPanelPoppedOut(id: string): boolean {
  const panel = api?.getPanel(id);
  return panel?.api.location.type === "popout";
}

export function detachPanel(id: string): void {
  if (!api) return;
  const panel = api.getPanel(id);
  if (!panel) return;
  if (panel.api.location.type === "popout") return;
  void api.addPopoutGroup(panel, { popoutUrl: POPOUT_URL });
}

/** Ferme la fenêtre OS : dockview rattache le groupe au layout principal. */
export function reattachPanel(id: string): void {
  if (!api) return;
  const panel = api.getPanel(id);
  if (!panel) return;
  if (panel.api.location.type !== "popout") return;
  closePopoutGroup(api, panel.group);
}

export function resetDockLayout(): void {
  resetPersistedLayout();
  if (!api) {
    window.location.reload();
    return;
  }
  for (const g of popoutGroups(api)) closePopoutGroup(api, g);
  api.clear();
  buildDefaultLayout(api);
}
