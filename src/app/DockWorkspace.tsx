import { useCallback, useEffect, useRef } from "react";
import { useI18nStore } from "../i18n";
import {
  DockviewDefaultTab,
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanel,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
} from "dockview";
import "dockview/dist/styles/dockview.css";
import { CodePanel } from "../panels/CodePanel/CodePanel";
import { InspectorPanel } from "../panels/InspectorPanel/InspectorPanel";
import { PalettePanel } from "../panels/PalettePanel/PalettePanel";
import { PreviewPanel } from "../panels/PreviewPanel/PreviewPanel";
import { ProblemsPanel } from "../panels/ProblemsPanel/ProblemsPanel";
import { GameIconsPanel } from "../panels/GameIconsPanel/GameIconsPanel";
import { StylesPanel } from "../panels/StylesPanel/StylesPanel";
import { TreePanel } from "../panels/TreePanel/TreePanel";
import { pushToast } from "../store/toastStore";
import { ContextMenu } from "../ui/menu/ContextMenu";
import { useContextMenu } from "../ui/menu/useContextMenu";
import { cursorPosition } from "../tauri/commands";
import { withCommandTargets } from "./commands";
import { setDockApi } from "./dockApi";
import {
  addGameIconsPanel,
  backupBrokenLayout,
  buildDefaultLayout,
  getKnownMonitors,
  loadPersistedLayout,
  PANEL_TITLES,
  persistLayout,
} from "./dockLayout";
import { dockTabMenuItems } from "./menus/contextMenus";
import {
  isPointInWindow,
  popoutBoxAtPoint,
  POPOUT_URL,
  sanitizePopoutPositions,
  screenToClient,
  windowRectOf,
} from "./popoutLayout";
import {
  closePopoutGroup,
  disposePopoutInstrumentation,
  popoutWindowOf,
  syncPopoutWindows,
} from "./popoutWindows";
import { t } from "../i18n";

const components = {
  palette: (_props: IDockviewPanelProps) => <PalettePanel />,
  tree: (_props: IDockviewPanelProps) => <TreePanel />,
  preview: (_props: IDockviewPanelProps) => <PreviewPanel />,
  inspector: (_props: IDockviewPanelProps) => <InspectorPanel />,
  code: (_props: IDockviewPanelProps) => <CodePanel />,
  problems: (_props: IDockviewPanelProps) => <ProblemsPanel />,
  styles: (_props: IDockviewPanelProps) => <StylesPanel />,
  gameIcons: (_props: IDockviewPanelProps) => <GameIconsPanel />,
};

/** Pont module → composant : le menu d’onglet est ouvert depuis l’onglet. */
const tabMenuBridge: {
  open: ((e: React.MouseEvent, panelId: string) => void) | null;
} = { open: null };

/** Onglet par défaut + menu contextuel ; l’id du panneau vient de dockview (pas du titre). */
function DockTab(props: IDockviewPanelHeaderProps) {
  return (
    <DockviewDefaultTab
      {...props}
      data-panel-id={props.api.id}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        tabMenuBridge.open?.(e, props.api.id);
      }}
    />
  );
}

/** Point écran du lâcher : pointeur réel (Tauri), sinon coordonnées de l’événement. */
async function dropPoint(e: DragEvent): Promise<{ x: number; y: number } | null> {
  try {
    return await cursorPosition();
  } catch {
    if (e.screenX === 0 && e.screenY === 0) return null;
    return { x: e.screenX, y: e.screenY };
  }
}

/** Écoute la fin d’un glisser lancé depuis `source` (une seule fois). */
function onceDragEnd(source: EventTarget | null, handler: (e: DragEvent) => void) {
  const el = source as Element | null;
  const doc = el?.ownerDocument ?? document;
  let done = false;
  const fire = (e: Event) => {
    if (done) return;
    done = true;
    el?.removeEventListener("dragend", fire);
    doc.removeEventListener("dragend", fire, true);
    handler(e as DragEvent);
  };
  // Sur l’élément source (même s’il est retiré du DOM pendant le glisser)
  // et sur son document en capture.
  el?.addEventListener("dragend", fire);
  doc.addEventListener("dragend", fire, true);
}

async function handlePanelDragEnd(
  api: DockviewApi,
  panelId: string,
  e: DragEvent,
): Promise<void> {
  // Un dépôt accepté par une zone dockview a déjà été traité.
  const effect = e.dataTransfer?.dropEffect;
  if (effect && effect !== "none") return;
  const point = await dropPoint(e);
  if (!point) return;
  const panel = api.getPanel(panelId);
  if (!panel) return;
  const group = panel.group;
  const main = windowRectOf(window);
  const inMain = isPointInWindow(point, main);

  if (group.api.location.type !== "popout") {
    if (inMain) return; // lâché dans la fenêtre hors zone : rien à faire
    const rect = group.element.getBoundingClientRect();
    void api.addPopoutGroup(panel, {
      popoutUrl: POPOUT_URL,
      position: popoutBoxAtPoint(point, rect, main),
    });
    return;
  }

  // Glisser depuis une fenêtre détachée.
  const popWin = popoutWindowOf(group);
  if (inMain) {
    reattachAtPoint(api, panel, point);
    return;
  }
  if (popWin && isPointInWindow(point, windowRectOf(popWin))) return;
  // Hors de toute fenêtre : un onglet d’une popout à plusieurs onglets part
  // dans sa propre fenêtre.
  if (group.panels.length > 1) {
    const rect = group.element.getBoundingClientRect();
    void api.addPopoutGroup(panel, {
      popoutUrl: POPOUT_URL,
      position: popoutBoxAtPoint(point, rect, main),
    });
  }
}

/** Rattache un panneau détaché au groupe de la fenêtre principale sous le pointeur. */
function reattachAtPoint(
  api: DockviewApi,
  panel: IDockviewPanel,
  point: { x: number; y: number },
): void {
  const client = screenToClient(point, windowRectOf(window));
  const el = document.elementFromPoint(client.x, client.y);
  const target = el
    ? api.groups.find(
        (g) => g.api.location.type === "grid" && g.element.contains(el),
      )
    : undefined;
  const source = panel.group;
  if (source.panels.length === 1) {
    // La fenêtre ne contient que ce panneau : on la ferme (dockview remet le
    // groupe à sa place d’origine), puis on le déplace sous le pointeur.
    closePopoutGroup(api, source);
    if (target && panel.group !== target) {
      panel.api.moveTo({ group: target, position: "center" });
    }
    return;
  }
  const dest =
    target ?? api.groups.find((g) => g.api.location.type === "grid");
  if (dest) panel.api.moveTo({ group: dest, position: "center" });
}

/** Restaure la disposition enregistrée ; sinon disposition par défaut. */
function restoreLayout(api: DockviewApi): void {
  const saved = loadPersistedLayout();
  let restored = false;
  if (saved) {
    try {
      api.fromJSON(
        sanitizePopoutPositions(saved, getKnownMonitors(), {
          screenX: window.screenX,
          screenY: window.screenY,
        }),
      );
      restored = api.panels.length > 0;
    } catch (error) {
      console.error("Disposition illisible, retour au défaut :", error);
      backupBrokenLayout(saved);
      pushToast(t("dock.layoutReset"), "info", 6000);
      restored = false;
    }
  }
  if (!restored) {
    api.clear();
    buildDefaultLayout(api);
  }
  // Disposition enregistrée avant l’arrivée du panneau : on l’ajoute.
  addGameIconsPanel(api);
  // Les titres sont enregistrés avec la disposition : on applique les actuels.
  for (const [id, title] of Object.entries(PANEL_TITLES)) {
    api.getPanel(id)?.api.setTitle(title);
  }
}

/** Branche la persistance, le glisser d’onglets et la surveillance des popouts. */
function wireDock(api: DockviewApi): () => void {
  let persistTimer: number | null = null;
  const schedulePersist = () => {
    if (persistTimer !== null) window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      persistTimer = null;
      persistLayout(api);
    }, 250);
  };

  const disposables = [
    api.onDidLayoutChange(() => {
      schedulePersist();
      syncPopoutWindows(api);
    }),
    api.onDidOpenPopoutWindowFail(() => {
      pushToast(t("dock.popoutFailed"), "error");
      schedulePersist();
    }),
    api.onWillDragPanel(({ nativeEvent, panel }) => {
      const panelId = panel.id;
      onceDragEnd(nativeEvent.target, (e) => {
        void handlePanelDragEnd(api, panelId, e);
      });
    }),
  ];
  const interval = window.setInterval(() => syncPopoutWindows(api), 1000);
  // Changement de langue : titres des onglets traduits à chaud.
  const unsubscribeLanguage = useI18nStore.subscribe((s, prev) => {
    if (s.language === prev.language && s.messages === prev.messages) return;
    for (const [id, title] of Object.entries(PANEL_TITLES)) {
      api.getPanel(id)?.api.setTitle(title);
    }
  });

  return () => {
    unsubscribeLanguage();
    for (const d of disposables) d.dispose();
    window.clearInterval(interval);
    if (persistTimer !== null) window.clearTimeout(persistTimer);
    disposePopoutInstrumentation();
  };
}

export function DockWorkspace() {
  const ctxMenu = useContextMenu();
  const tabTargetRef = useRef<string | null>(null);
  const apiRef = useRef<DockviewApi | null>(null);
  const unwireRef = useRef<(() => void) | null>(null);

  const openTabMenu = ctxMenu.open;
  useEffect(() => {
    tabMenuBridge.open = (e, panelId) => {
      tabTargetRef.current = panelId;
      openTabMenu(e, dockTabMenuItems());
    };
    return () => {
      tabMenuBridge.open = null;
    };
  }, [openTabMenu]);

  useEffect(() => {
    return () => {
      unwireRef.current?.();
      unwireRef.current = null;
    };
  }, []);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const { api } = event;
    apiRef.current = api;
    setDockApi(api);
    // Sous StrictMode, dockview crée une première instance aussitôt détruite :
    // on attend un tour pour ne restaurer (et rouvrir les popouts) que sur
    // l’instance qui reste.
    window.setTimeout(() => {
      if (apiRef.current !== api) return;
      unwireRef.current?.();
      restoreLayout(api);
      unwireRef.current = wireDock(api);
    }, 0);
  }, []);

  return (
    <div className="dock-workspace">
      <DockviewReact
        className="dockview-theme-dark"
        components={components}
        defaultTabComponent={DockTab}
        popoutUrl={POPOUT_URL}
        onReady={onReady}
      />
      {ctxMenu.menu ? (
        <ContextMenu
          x={ctxMenu.menu.x}
          y={ctxMenu.menu.y}
          doc={ctxMenu.menu.doc}
          items={ctxMenu.menu.items}
          ctx={withCommandTargets({
            targetPanelId: tabTargetRef.current,
          })}
          onClose={ctxMenu.close}
        />
      ) : null}
    </div>
  );
}
