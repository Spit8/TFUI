import { DndContext } from "@dnd-kit/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { toBlob } from "html-to-image";
import { createRoot } from "react-dom/client";
import { getActiveCatalog } from "../catalog/activeCatalog";
import { CatalogProvider } from "../catalog/CatalogContext";
import { getActiveBaseStyles } from "../gamestyle/activeBaseStyles";
import { gameFontFaceCss } from "../gamestyle/gameAssets";
import type { Screen, TfuiProject } from "../model/types";
import { PreviewExportContext } from "../preview/renderers/layoutContext";
import { PreviewNode } from "../preview/renderers/PreviewNode";
import { aspectLabel } from "../preview/screenRatio";
import { previewTheme } from "../preview/theme";
import { useProjectStore } from "../store/projectStore";
import { pushToast } from "../store/toastStore";
import { writeBinaryFile } from "../tauri/commands";
import {
  backgroundImageDataUrl,
  backgroundImagePathFor,
  getPreviewBackgroundMode,
} from "./previewBackground";
import { t } from "../i18n";
import { errorMessage } from "../i18n/backend";

/**
 * Export PNG de l’aperçu (Fichier › Exporter), à l’échelle 1 :
 * - viewport : l’écran simulé entier, fond compris (uni, image ou masqué →
 *   transparent), avec l’interface ouverte ;
 * - UI : l’interface seule, rognée à sa boîte, fond transparent.
 * Rendu hors écran, sans aides de l’éditeur (sélection, survol, contours).
 */
export type ExportPart = "viewport" | "ui";

export function exportFileName(screen: Screen, part: ExportPart): string {
  const base = (screen.fileBase || screen.recipeName).replace(/[^\w.-]+/g, "_");
  const { w, h } = screen.previewViewport;
  return part === "viewport" ? `${base}_viewport_${w}x${h}.png` : `${base}_ui.png`;
}

/**
 * Prochaine image, ou 50 ms au plus : `requestAnimationFrame` ne se déclenche
 * pas tant que la fenêtre n’est pas redessinée (réduite, masquée), ce qui
 * bloquait l’export indéfiniment.
 */
function nextFrame(): Promise<void> {
  return new Promise((r) => {
    const timer = setTimeout(r, 50);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      r();
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Attend polices, images et surfaces du jeu (calculées en différé). */
async function settle(host: HTMLElement): Promise<void> {
  await nextFrame();
  await document.fonts.ready;
  for (let i = 0; i < 50; i++) {
    await sleep(60);
    const imgs = [...host.querySelectorAll("img")];
    await Promise.all(imgs.map((img) => (img.complete ? null : img.decode().catch(() => null))));
    const pending = host.querySelectorAll('[data-ninepatch="pending"]').length;
    // Deux passages sans surface en attente : rendu stable.
    if (pending === 0 && i >= 2) break;
  }
  await nextFrame();
}

/** Écran avec son interface placée en (0, 0) : rognage de l’UI à sa boîte. */
function withRootAtOrigin(screen: Screen): Screen {
  const zero = { kind: "literal" as const, value: 0 };
  return { ...screen, root: { ...screen.root, props: { ...screen.root.props, initialX: zero, initialY: zero } } };
}

/** Rend un écran hors écran (échelle 1) puis appelle `capture`. */
async function withOffscreenScreen<T>(
  project: TfuiProject,
  screen: Screen,
  background: { mode: "solid" | "hidden" | "image"; url: string | null },
  capture: (viewport: HTMLElement) => Promise<T>,
): Promise<T> {
  const { w, h } = screen.previewViewport;
  const stateSim = useProjectStore.getState().stateSim[screen.id];
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-30000px;top:0;pointer-events:none;";
  document.body.append(host);
  const root = createRoot(host);
  try {
    root.render(
      <CatalogProvider catalog={getActiveCatalog()} vocabulary={null} baseStyles={getActiveBaseStyles()}>
        <PreviewExportContext.Provider value>
          <DndContext>
            <div
              data-export-viewport=""
              style={{
                position: "relative",
                width: w,
                height: h,
                overflow: "hidden",
                background: background.mode === "solid" ? previewTheme.bg : "transparent",
              }}
            >
              {background.url ? (
                // Comme l’aperçu : hauteur de l’écran, centrée, proportions conservées.
                <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
                  <img
                    src={background.url}
                    alt=""
                    style={{
                      position: "absolute",
                      top: 0,
                      left: "50%",
                      height: "100%",
                      width: "auto",
                      maxWidth: "none",
                      transform: "translateX(-50%)",
                    }}
                  />
                </div>
              ) : null}
              <PreviewNode project={project} screen={screen} node={screen.root} stateSim={stateSim} />
            </div>
          </DndContext>
        </PreviewExportContext.Provider>
      </CatalogProvider>,
    );
    await settle(host);
    const viewport = host.querySelector<HTMLElement>("[data-export-viewport]");
    if (!viewport) throw new Error(t("export.renderNotFound"));
    return await capture(viewport);
  } finally {
    root.unmount();
    host.remove();
  }
}

/** Rend un écran hors écran et produit les PNG demandés. */
export async function renderScreen(
  project: TfuiProject,
  screen: Screen,
  parts: ExportPart[],
): Promise<Partial<Record<ExportPart, Blob>>> {
  const { w, h } = screen.previewViewport;
  const mode = getPreviewBackgroundMode();
  const imagePath = mode === "image" ? backgroundImagePathFor(aspectLabel(w, h)) : null;
  const url = imagePath ? await backgroundImageDataUrl(imagePath).catch(() => null) : null;
  const fontEmbedCSS = gameFontFaceCss();
  const out: Partial<Record<ExportPart, Blob>> = {};
  if (parts.includes("viewport")) {
    const blob = await withOffscreenScreen(project, screen, { mode, url }, (vp) =>
      toBlob(vp, { width: w, height: h, pixelRatio: 1, fontEmbedCSS }),
    );
    if (blob) out.viewport = blob;
  }
  if (parts.includes("ui")) {
    // Interface seule, fond transparent, placée en (0, 0) puis rognée à sa boîte.
    const moved = withRootAtOrigin(screen);
    const blob = await withOffscreenScreen(project, moved, { mode: "hidden", url: null }, (vp) => {
      const el = vp.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(screen.root.id)}"]`);
      if (!el) return Promise.resolve(null);
      return toBlob(vp, { width: el.offsetWidth, height: el.offsetHeight, pixelRatio: 1, fontEmbedCSS });
    });
    if (blob) out.ui = blob;
  }
  return out;
}

async function writeBlob(path: string, blob: Blob): Promise<void> {
  await writeBinaryFile(path, new Uint8Array(await blob.arrayBuffer()));
}

function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return `${dir.replace(/[\\/]+$/, "")}${sep}${name}`;
}

/** Écran affiché dans l’aperçu (sélectionné, sinon le premier). */
function currentScreen(project: TfuiProject): Screen | null {
  const id = useProjectStore.getState().selectedScreenId;
  return project.screens.find((s) => s.id === id) ?? project.screens[0] ?? null;
}

/** Export d’un seul PNG de l’écran courant (boîte « Enregistrer sous »). */
export async function exportCurrent(project: TfuiProject, part: ExportPart): Promise<void> {
  const screen = currentScreen(project);
  if (!screen) return;
  const path = await save({
    defaultPath: exportFileName(screen, part),
    filters: [{ name: "Image PNG", extensions: ["png"] }],
  });
  if (!path) return;
  try {
    const blob = (await renderScreen(project, screen, [part]))[part];
    if (!blob) throw new Error(t("export.renderEmpty"));
    await writeBlob(path, blob);
    pushToast(t("export.done", { path }), "success");
  } catch (e) {
    pushToast(t("export.failed", { message: errorMessage(e) }), "error", 8000);
  }
}

/** Export de tous les écrans dans un dossier choisi. */
export async function exportAll(project: TfuiProject, parts: ExportPart[]): Promise<void> {
  const dir = await open({ directory: true, multiple: false, title: t("export.pickFolder") });
  if (!dir || Array.isArray(dir)) return;
  let written = 0;
  try {
    for (const screen of project.screens) {
      const blobs = await renderScreen(project, screen, parts);
      for (const part of parts) {
        const blob = blobs[part];
        if (!blob) continue;
        await writeBlob(joinPath(dir, exportFileName(screen, part)), blob);
        written++;
      }
    }
    pushToast(t("export.doneMany", { n: written, dir }), "success");
  } catch (e) {
    pushToast(t("export.interrupted", { n: written, message: errorMessage(e) }), "error", 8000);
  }
}
