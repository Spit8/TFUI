import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { withCommandTargets } from "../../app/commands";
import { nodeContextMenuItems, treeBackgroundMenuItems } from "../../app/menus/contextMenus";
import { findNode } from "../../model/treeOps";
import { clampZoom, panBy, zoomAt } from "../../preview/camera";
import { PreviewNode } from "../../preview/renderers/PreviewNode";
import { previewTheme } from "../../preview/theme";
import {
  ensureCamera,
  previewFit,
  previewZoom100,
  previewZoomIn,
  previewZoomOut,
  setCamera,
  setMapMetrics,
  setMenuTargetNodeId,
  setShowBoxes,
  usePreviewCamera,
  usePreviewBackground,
  useShowBoxes,
} from "../../store/previewCameraStore";
import {
  setPreviewBackgroundMode,
  setPreviewBackgroundRatio,
  showPreviewBackgroundImage,
} from "../../app/previewBackground";
import { useCatalog } from "../../catalog/CatalogContext";
import {
  aspectLabel,
  FALLBACK_RESOLUTIONS,
  groupByAspect,
  type Resolution,
} from "../../preview/screenRatio";
import { setPreviewShowBoxes } from "../../settings/settingsStore";
import { useProjectStore } from "../../store/projectStore";
import { ComponentIcon } from "../../ui/icons";
import { ContextMenu } from "../../ui/menu/ContextMenu";
import { useContextMenu } from "../../ui/menu/useContextMenu";
import "./PreviewPanel.css";
import { t, useT } from "../../i18n";

const ZOOM_STEP = 1.1;
/** Distance (px) au-delà de laquelle un clic droit maintenu déplace la vue. */
const PAN_THRESHOLD_PX = 4;

export function PreviewPanel() {
  useT();
  const project = useProjectStore((s) => s.project);
  const selectedScreenId = useProjectStore((s) => s.selectedScreenId);
  const selectedNodeId = useProjectStore((s) => s.selectedNodeId);
  const stateSim = useProjectStore((s) => s.stateSim);
  const setStateSim = useProjectStore((s) => s.setStateSim);
  const updateScreenMeta = useProjectStore((s) => s.updateScreenMeta);

  const screen = useMemo(() => {
    if (!project) return null;
    return project.screens.find((s) => s.id === selectedScreenId) ?? project.screens[0] ?? null;
  }, [project, selectedScreenId]);

  const vw = screen?.previewViewport.w ?? 1920;
  const vh = screen?.previewViewport.h ?? 1080;
  const ratio = aspectLabel(vw, vh);

  // Résolutions du menu Options du jeu (extraites au re-scan), groupées par
  // format ; la résolution courante reste choisissable même hors liste.
  const { baseStyles } = useCatalog();
  const resolutionGroups = useMemo(() => {
    const list: Resolution[] = [...(baseStyles?.resolutions ?? FALLBACK_RESOLUTIONS)];
    if (!list.some((r) => r.w === vw && r.h === vh)) list.push({ w: vw, h: vh });
    return groupByAspect(list);
  }, [baseStyles, vw, vh]);

  // L’image de fond suit le format d’écran.
  useEffect(() => setPreviewBackgroundRatio(ratio), [ratio]);

  const mapRef = useRef<HTMLDivElement>(null);
  const camera = usePreviewCamera(screen?.id ?? null);
  const showBoxes = useShowBoxes();
  const background = usePreviewBackground();
  const [zoomInput, setZoomInput] = useState("50");
  const spaceDown = useRef(false);
  const panDrag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    active: boolean;
  } | null>(null);
  const suppressContextMenu = useRef(false);
  const [isPanning, setIsPanning] = useState(false);
  const ctxMenu = useContextMenu();
  const [menuNodeId, setMenuNodeId] = useState<string | null>(null);
  const validationIssues = useProjectStore((s) => s.validationIssues);

  // Fit on first open / sync metrics when screen or size changes.
  useLayoutEffect(() => {
    if (!screen || !mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    ensureCamera(screen.id, rect.width, rect.height, vw, vh);
    setMapMetrics(screen.id, rect.width, rect.height, vw, vh);
  }, [screen, vw, vh]);

  useEffect(() => {
    if (!screen || !mapRef.current) return;
    const el = mapRef.current;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setMapMetrics(screen.id, rect.width, rect.height, vw, vh);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [screen, vw, vh]);

  useEffect(() => {
    if (camera) setZoomInput(String(Math.round(camera.zoom * 100)));
  }, [camera]);

  // Molette = défilement, Ctrl+molette = zoom (écouteur non passif).
  // Déplacement : clic droit maintenu + glisser (voir startPan).
  useEffect(() => {
    const el = mapRef.current;
    if (!el || !screen) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = ensureCamera(screen.id, el.clientWidth, el.clientHeight, vw, vh);
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
        setCamera(screen.id, zoomAt(cam, cam.zoom * factor, cx, cy));
        return;
      }
      if (e.shiftKey) {
        setCamera(screen.id, panBy(cam, -e.deltaY, 0));
        return;
      }
      setCamera(screen.id, panBy(cam, -e.deltaX, -e.deltaY));
    };

    // Pas de défilement automatique Windows au clic molette.
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };

    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    el.addEventListener("mousedown", onMouseDown);
    return () => {
      el.removeEventListener("wheel", onWheel, true);
      el.removeEventListener("mousedown", onMouseDown);
    };
  }, [screen, vw, vh]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
          return;
        }
        spaceDown.current = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDown.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  if (!project || !screen) {
    return (
      <div className="preview-panel">
        <div className="preview-empty">{t("preview.noProject")}</div>
      </div>
    );
  }

  const sim = stateSim[screen.id];
  const cam = camera ?? { panX: 0, panY: 0, zoom: 0.5 };
  const selectedLoc = selectedNodeId && project ? findNode(project, selectedNodeId) : null;
  const selectedNode = selectedLoc?.node ?? null;

  const applyZoomPercent = (raw: string) => {
    const n = Number(raw.replace("%", "").trim());
    if (!Number.isFinite(n)) {
      setZoomInput(String(Math.round(cam.zoom * 100)));
      return;
    }
    const el = mapRef.current;
    const cx = el ? el.clientWidth / 2 : 0;
    const cy = el ? el.clientHeight / 2 : 0;
    setCamera(screen.id, zoomAt(cam, clampZoom(n / 100), cx, cy));
  };

  /**
   * Déplacement de la vue : clic droit maintenu + glisser (ou Espace + clic
   * gauche). Un clic droit sans mouvement ouvre toujours le menu contextuel.
   */
  const startPan = (e: ReactPointerEvent) => {
    const rightDrag = e.button === 2;
    const spaceDrag = e.button === 0 && spaceDown.current;
    if (!rightDrag && !spaceDrag) return;
    if (spaceDrag) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    // Clic droit : pas de capture avant le seuil de déplacement, pour que le
    // survol continue de montrer l’élément sous le pointeur.
    panDrag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      // Le clic droit ne déplace qu’au-delà d’un petit seuil (sinon : menu).
      active: spaceDrag,
    };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const drag = panDrag.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (!drag.active) {
      const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (dist < PAN_THRESHOLD_PX) return;
      drag.active = true;
      setIsPanning(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    const cur = ensureCamera(
      screen.id,
      mapRef.current?.clientWidth ?? 800,
      mapRef.current?.clientHeight ?? 600,
      vw,
      vh,
    );
    setCamera(screen.id, panBy(cur, dx, dy));
  };

  const endPan = (e: ReactPointerEvent) => {
    if (panDrag.current?.pointerId === e.pointerId) {
      // Sous Windows le menu contextuel arrive au relâchement : après un
      // déplacement, on l’ignore une fois.
      if (panDrag.current.active && e.button === 2) {
        suppressContextMenu.current = true;
        window.setTimeout(() => {
          suppressContextMenu.current = false;
        }, 300);
      }
      panDrag.current = null;
      setIsPanning(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // already released
      }
    }
  };

  return (
    <div className="preview-panel">
      <div className="preview-disclaimer">
        {t("preview.disclaimer")}
      </div>
      <div className="preview-toolbar">
        <label>
          {t("preview.viewport")}
          <select
            value={`${vw}x${vh}`}
            title={
              baseStyles?.resolutions
                ? t("preview.resolutionsHint")
                : t("preview.resolutionsReduced")
            }
            onChange={(e) => {
              const [w, h] = e.target.value.split("x").map(Number);
              if (w && h) {
                updateScreenMeta(screen.id, { previewViewport: { w, h } });
              }
            }}
          >
            {resolutionGroups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map((r) => (
                  <option key={`${r.w}x${r.h}`} value={`${r.w}x${r.h}`}>
                    {r.w}×{r.h} ({g.label})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label
          title={
            background.mode === "image" && background.fallback
              ? t("preview.backgroundFallback", { ratio })
              : t("preview.backgroundHint")
          }
        >
          {t("preview.background")}
          <select
            value={background.mode}
            onChange={(e) => {
              const mode = e.target.value;
              if (mode === "image") void showPreviewBackgroundImage();
              else if (mode === "solid" || mode === "hidden") {
                setPreviewBackgroundMode(mode);
              }
            }}
          >
            <option value="solid">{t("preview.bgSolid")}</option>
            <option value="hidden">{t("preview.bgHidden")}</option>
            <option value="image">{t("preview.bgImage")}</option>
          </select>
        </label>
        <div className="preview-zoom-controls">
          <button type="button" title={t("preview.zoomOut")} onClick={() => previewZoomOut()}>
            −
          </button>
          <input
            className="preview-zoom-input"
            value={zoomInput}
            onChange={(e) => setZoomInput(e.target.value)}
            onBlur={() => applyZoomPercent(zoomInput)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                applyZoomPercent(zoomInput);
                (e.target as HTMLInputElement).blur();
              }
            }}
            aria-label={t("preview.zoomPercent")}
          />
          <span className="preview-zoom-suffix">%</span>
          <button type="button" title={t("preview.zoomIn")} onClick={() => previewZoomIn()}>
            +
          </button>
          <button type="button" title={t("preview.fitHint")} onClick={() => previewFit()}>
            {t("preview.fit")}
          </button>
          <button type="button" title={t("preview.actualSizeHint")} onClick={() => previewZoom100()}>
            {t("preview.actualSize")}
          </button>
        </div>
        <label
          className="preview-check"
          title={t("preview.boxesHint")}
        >
          <input
            type="checkbox"
            checked={showBoxes}
            onChange={(e) => {
              setShowBoxes(e.target.checked);
              void setPreviewShowBoxes(e.target.checked).catch(() => undefined);
            }}
          />
          {t("preview.boxes")}
        </label>
        {selectedNode ? (
          <span className="preview-selection" title={selectedNode.type}>
            <ComponentIcon
              type={selectedNode.type}
              orientation={selectedNode.props.orientation}
              size={14}
              className="preview-selection-icon"
            />
            {selectedNode.type}
            {selectedNode.name && selectedNode.name !== selectedNode.type
              ? ` · ${selectedNode.name}`
              : ""}
          </span>
        ) : null}
      </div>
      {screen.state.length > 0 ? (
        <div className="preview-state-bar">
          <span style={{ color: "var(--muted)" }}>{t("preview.stateSim")}</span>
          {screen.state.map((st) => (
            <label key={st.name}>
              {st.name}
              <input
                type="text"
                value={
                  sim && st.name in sim
                    ? String(sim[st.name] ?? "")
                    : st.initial === null
                      ? ""
                      : String(st.initial)
                }
                onChange={(e) => {
                  const raw = e.target.value;
                  let value: string | number | boolean | null = raw;
                  if (raw === "true") value = true;
                  else if (raw === "false") value = false;
                  else if (raw === "null") value = null;
                  else if (raw !== "" && !Number.isNaN(Number(raw))) {
                    value = Number(raw);
                  }
                  setStateSim(screen.id, st.name, value);
                }}
                style={{ width: 90, marginLeft: 4 }}
              />
            </label>
          ))}
        </div>
      ) : null}
      <div
        ref={mapRef}
        className={`preview-map${isPanning ? " panning" : ""}`}
        onContextMenu={(e) => {
          if ((e.target as Element).closest("[data-node-id]")) return;
          setMenuNodeId(null);
          setMenuTargetNodeId(null);
          ctxMenu.open(e, treeBackgroundMenuItems());
        }}
        onContextMenuCapture={(e) => {
          if (suppressContextMenu.current) {
            suppressContextMenu.current = false;
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onClick={(e) => {
          // Clic sur le fond (hors élément) : tout désélectionner, inspecteur vide.
          if (e.button !== 0 || spaceDown.current) return;
          if ((e.target as Element).closest("[data-node-id]")) return;
          useProjectStore.getState().clearSelection();
        }}
        onPointerDown={startPan}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        tabIndex={0}
      >
        <div
          className={`preview-viewport${background.mode === "hidden" ? " hidden-bg" : ""}`}
          style={{
            width: vw,
            height: vh,
            transform: `translate(${cam.panX}px, ${cam.panY}px) scale(${cam.zoom})`,
            background: background.mode === "solid" ? previewTheme.bg : "transparent",
          }}
        >
          {background.mode === "image" && background.url ? (
            // Capture du jeu ajustée à la hauteur de l’écran simulé, centrée,
            // proportions conservées (rognée ou avec bandes si le format
            // diffère).
            <div className="preview-viewport-image-frame">
              <img
                className="preview-viewport-image"
                src={background.url}
                alt=""
                draggable={false}
              />
            </div>
          ) : null}
          <PreviewNode
            project={project}
            screen={screen}
            node={screen.root}
            stateSim={sim}
            onNodeContextMenu={(e, nodeId) => {
              setMenuNodeId(nodeId);
              setMenuTargetNodeId(nodeId);
              const warnings = validationIssues()
                .filter((i) => i.nodeId === nodeId)
                .map((i) => i.message);
              ctxMenu.open(e, nodeContextMenuItems({ warnings }));
            }}
          />
        </div>
      </div>
      {ctxMenu.menu ? (
        <ContextMenu
          x={ctxMenu.menu.x}
          y={ctxMenu.menu.y}
          doc={ctxMenu.menu.doc}
          items={ctxMenu.menu.items}
          ctx={withCommandTargets({
            targetNodeId: menuNodeId,
            targetScreenId: screen.id,
          })}
          onClose={() => {
            setMenuTargetNodeId(null);
            ctxMenu.close();
          }}
        />
      ) : null}
    </div>
  );
}
