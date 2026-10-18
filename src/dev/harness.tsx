/**
 * Banc de rendu de développement (voir vite.harness.config.ts) : affiche un
 * écran d’un projet avec les styles, polices et images du jeu, à l’échelle 1,
 * pour comparer l’aperçu à une capture en jeu. Ne fait pas partie de l’app.
 *
 * Paramètres : project=<chemin .tfui.json>, screen=<n° d’écran>,
 * fontScale=small|medium|large, boxes=1, vw=<largeur>&vh=<hauteur> (écran
 * simulé, défaut : celui de l’écran du projet), full=1 (zone visible = écran
 * entier au lieu de 40 % × 60 %).
 */
import { DndContext } from "@dnd-kit/core";
import React from "react";
import ReactDOM from "react-dom/client";
import glueWasmUrl from "wasmoon/dist/glue.wasm?url";
import { setActiveCatalog } from "../catalog/activeCatalog";
import catalogJson from "../catalog/catalog.generated.json";
import { CatalogProvider } from "../catalog/CatalogContext";
import { buildManualHelperComponents } from "../catalog/overrides";
import { mergeHelperComponents } from "../catalog/parseTealDefs";
import type { Catalog } from "../catalog/types";
import { setActiveBaseStyles } from "../gamestyle/activeBaseStyles";
import { extractBaseStyles } from "../gamestyle/extractBaseStyles";
import { setGameAssetReader } from "../gamestyle/gameAssets";
import type { BaseStyles } from "../gamestyle/types";
import type { TfuiProject } from "../model/types";
import { renderScreen } from "../app/previewExport";
import { WorkspaceDndProvider } from "../app/WorkspaceDnd";
import { TreePanel } from "../panels/TreePanel/TreePanel";
import { useProjectStore } from "../store/projectStore";
import "../app/app.css";
import { PreviewNode } from "../preview/renderers/PreviewNode";
import type { PreviewFontScale } from "../settings/defaults";
import { setPreviewFontScaleState, setShowBoxes } from "../store/previewCameraStore";

const params = new URLSearchParams(location.search);
const MARGIN = 48;

async function readBytes(zip: string, entry: string): Promise<Uint8Array | null> {
  const r = await fetch(`/__tfui-dev/zip?zip=${encodeURIComponent(zip)}&entry=${encodeURIComponent(entry)}`);
  return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
}

// eslint-disable-next-line react-refresh/only-export-components -- point d’entrée du banc, pas un module
function Harness({ project, catalog, styles }: { project: TfuiProject; catalog: Catalog; styles: BaseStyles }) {
  const screen = project.screens[Number(params.get("screen") ?? 0)] ?? project.screens[0]!;
  const w = Number(params.get("vw")) || screen.previewViewport.w;
  const h = Number(params.get("vh")) || screen.previewViewport.h;
  const full = params.get("full") === "1";
  const ix = screen.root.props.initialX?.kind === "literal" ? Number(screen.root.props.initialX.value) : 0.1;
  const iy = screen.root.props.initialY?.kind === "literal" ? Number(screen.root.props.initialY.value) : 0.1;
  return (
    <CatalogProvider catalog={catalog} vocabulary={null} baseStyles={styles}>
      <DndContext>
        {/* Écran simulé décalé : la fenêtre apparaît à (MARGIN, MARGIN). */}
        <div style={{ position: "relative", overflow: "hidden", width: full ? w : w * 0.4, height: full ? h : h * 0.6 }}>
          <div
            id="screen"
            style={{
              position: "absolute",
              width: w,
              height: h,
              left: MARGIN - ix * w,
              top: MARGIN - iy * h,
            }}
          >
            <PreviewNode project={project} screen={screen} node={screen.root} stateSim={undefined} />
          </div>
        </div>
        <button
          id="test-export"
          type="button"
          onClick={() =>
            void renderScreen(project, screen, ["viewport", "ui"]).then((b) => {
              const out = document.getElementById("export-out")!;
              out.innerHTML = "";
              for (const [part, blob] of Object.entries(b)) {
                const img = document.createElement("img");
                img.src = URL.createObjectURL(blob);
                img.dataset.part = part;
                img.style.cssText = "display:block;outline:1px dashed #f0f;margin:8px";
                out.append(img);
              }
            })
          }
        >
          Tester l’export PNG
        </button>
        <div id="export-out" />
      </DndContext>
    </CatalogProvider>
  );
}

async function boot(): Promise<void> {
  const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
  const path = params.get("project") ?? "";
  const project = (await (await fetch(`/__tfui-dev/project?path=${encodeURIComponent(path)}`)).json()) as TfuiProject;
  const catalog = mergeHelperComponents(catalogJson as unknown as Catalog, buildManualHelperComponents());
  setActiveCatalog(catalog);
  const styles = await extractBaseStyles(async (zip, entry) => {
    const b = await readBytes(zip, entry);
    return b ? new TextDecoder().decode(b) : null;
  }, glueWasmUrl);
  setActiveBaseStyles(styles);
  setPreviewFontScaleState((params.get("fontScale") ?? "small") as PreviewFontScale);
  setShowBoxes(params.get("boxes") === "1");
  setGameAssetReader(readBytes);
  if (params.get("panel") === "tree") {
    // Arbre multi-projets : le projet demandé + un nouveau projet.
    useProjectStore.getState().setProject(project, path);
    useProjectStore.getState().newProject("");
    const first = useProjectStore.getState().sessions[0];
    if (first) useProjectStore.getState().switchProject(first.id);
    root.render(
      <CatalogProvider catalog={catalog} vocabulary={null} baseStyles={styles}>
        <WorkspaceDndProvider>
          <div style={{ width: 340, height: 700, background: "#1e232b", color: "#e8eef4" }}>
            <TreePanel />
          </div>
        </WorkspaceDndProvider>
      </CatalogProvider>,
    );
    return;
  }
  root.render(
    <React.StrictMode>
      <Harness project={project} catalog={catalog} styles={styles} />
    </React.StrictMode>,
  );
}

void boot().catch((e) => {
  document.body.textContent = `Échec du banc : ${e instanceof Error ? e.stack : String(e)}`;
});
