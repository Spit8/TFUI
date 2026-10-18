import {
  focusPanel,
  getDockApi,
  isPanelOpen,
  resetDockLayout,
  togglePanel,
} from "../dockApi";
import type { PanelId } from "../dockLayout";
import { PANEL_TITLES } from "../dockLayout";
import { applyDensity } from "../../settings/density";
import { loadSettings, saveSettings } from "../../settings/settingsStore";
import {
  previewFit,
  previewZoom100,
  previewZoomIn,
  previewZoomOut,
} from "../../store/previewCameraStore";
import { registerCommands } from "./registry";
import type { Command } from "./types";

async function persistDensity(d: "compact" | "normal"): Promise<void> {
  applyDensity(d);
  try {
    const s = await loadSettings();
    await saveSettings({ ...s, density: d });
  } catch {
    // hors Tauri
  }
}

const PANEL_IDS = Object.keys(PANEL_TITLES) as PanelId[];

export function registerViewCommands(): void {
  const panelCmds: Command[] = PANEL_IDS.map((id) => ({
    id: `view.togglePanel:${id}`,
    labelFor: () => PANEL_TITLES[id],
    group: "view" as const,
    isEnabled: () => true,
    run: () => {
      togglePanel(id);
      if (isPanelOpen(id)) focusPanel(id);
    },
  }));

  registerCommands([
    ...panelCmds,
    {
      id: "view.resetLayout",
      group: "view",
      isEnabled: () => true,
      run: () => resetDockLayout(),
    },
    {
      id: "view.density.compact",
      group: "view",
      isEnabled: () => true,
      run: (ctx) => {
        ctx.ui.setDensity("compact");
        void persistDensity("compact");
      },
    },
    {
      id: "view.density.normal",
      group: "view",
      isEnabled: () => true,
      run: (ctx) => {
        ctx.ui.setDensity("normal");
        void persistDensity("normal");
      },
    },
    {
      id: "view.focusProblems",
      group: "view",
      isEnabled: () => true,
      run: () => {
        if (!isPanelOpen("problems")) togglePanel("problems");
        focusPanel("problems");
      },
    },
    {
      id: "view.togglePreviewCode",
      shortcut: "mod+`",
      group: "view",
      isEnabled: () => true,
      run: () => {
        if (!isPanelOpen("code")) {
          togglePanel("code");
          focusPanel("code");
          return;
        }
        if (!isPanelOpen("preview")) {
          togglePanel("preview");
          focusPanel("preview");
          return;
        }
        const activeId = getDockApi()?.activePanel?.id;
        if (activeId === "code") {
          focusPanel("preview");
        } else {
          focusPanel("code");
        }
      },
    },
    {
      id: "preview.zoomIn",
      shortcut: "mod+=",
      group: "preview",
      isEnabled: () => true,
      run: () => previewZoomIn(),
    },
    {
      id: "preview.zoomOut",
      shortcut: "mod+-",
      group: "preview",
      isEnabled: () => true,
      run: () => previewZoomOut(),
    },
    {
      id: "preview.fit",
      shortcut: "mod+0",
      group: "preview",
      isEnabled: () => true,
      run: () => previewFit(),
    },
    {
      id: "preview.100",
      shortcut: "mod+1",
      group: "preview",
      isEnabled: () => true,
      run: () => previewZoom100(),
    },
    {
      id: "view.previewSettings",
      group: "preview",
      isEnabled: () => true,
      run: (ctx) => ctx.ui.openPreviewSettings(),
    },
  ]);
}
