import { getCurrentWindow } from "@tauri-apps/api/window";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useMemo, useRef, useState } from "react";
import { setActiveCatalog } from "../catalog/activeCatalog";
import { setActiveVocabulary } from "../catalog/activeVocabulary";
import { CatalogProvider } from "../catalog/CatalogContext";
import {
  loadCatalogCache,
  loadGameFingerprint,
  saveCatalogCache,
  saveCatalogOnlyCache,
  saveGameFingerprint,
} from "../catalog/catalogStore";
import { buildManualHelperComponents } from "../catalog/overrides";
import { isCatalogOutdated, mergeHelperComponents } from "../catalog/parseTealDefs";
import { rescanCatalog, rescanGame, rescanVocabulary } from "../catalog/rescanGame";
import { isVocabularyOutdated } from "../catalog/extractStyleVocabulary";
import type { Catalog, StyleVocabulary } from "../catalog/types";
import { setActiveBaseStyles } from "../gamestyle/activeBaseStyles";
import {
  attachGameCopy,
  currentGameFingerprint,
  importCounts,
  importGameContent,
  loadImageIndex,
} from "./gameCacheIo";
import { GameImportDialog } from "./GameImportDialog";
import { ImportProgress } from "./ImportProgress";
import type { ImportProgressState } from "./importProgressModel";
import type { GameImportMode } from "../settings/defaults";
import { setGameImportModeSetting } from "../settings/settingsStore";
import { reloadGameIcons } from "../store/gameIconsStore";
import {
  setPreviewAppearanceState,
  setPlayerFontScale,
  setPreviewFontScaleState,
  setShowBoxes,
} from "../store/previewCameraStore";
import { gameSettingsPath, parseGameFontScale } from "../settings/gameUserSettings";
import { PreviewSettingsDialog } from "../settings/PreviewSettingsDialog";
import { restorePreviewBackground } from "./previewBackground";
import type { BaseStyles } from "../gamestyle/types";
import glueWasmUrl from "wasmoon/dist/glue.wasm?url";
import { createModScaffoldProject } from "../model/modProject";
import { SettingsDialog } from "../settings/SettingsDialog";
import { applyDensity } from "../settings/density";
import { loadOpenProjects, loadSettings, setOpenProjects } from "../settings/settingsStore";
import { stopInlineEdit } from "../store/inlineEditStore";
import {
  ensureDeployStatusSubscriptions,
  scheduleDeployStatusRefresh,
} from "../store/deployStatusStore";
import { useProjectStore } from "../store/projectStore";
import { useTealIssuesStore } from "../store/tealIssuesStore";
import { pushToast } from "../store/toastStore";
import {
  checkTeal,
  createModScaffold,
  listContentZips,
  listZip,
  readGameFile,
  readZipEntries,
  readModMetadata,
  readTextFile,
  readZipEntry,
  verifyGameRoot,
  writeTextFile,
} from "../tauri/commands";
import { basename, dirname, join } from "../tauri/pathUtil";
import { ModDialog } from "../panels/ModPanel/ModDialog";
import { NewModDialog } from "../panels/ModPanel/NewModDialog";
import {
  ensureCommandsRegistered,
  getRecentCommandIds,
  refreshRecentCommandLabels,
  setCommandContextGetter,
  setRecentProjectPaths,
  type CommandContext,
} from "./commands";
import { installCommandShortcuts } from "./commands/shortcuts";
import { focusPanel, getDockApi, isPanelOpen, togglePanel } from "./dockApi";
import { refreshGameLog } from "../verify/gameSession";
import { DockWorkspace } from "./DockWorkspace";
import { flushLayoutAndSuspend, preloadDockLayout } from "./dockLayout";
import {
  closePopoutGroup,
  onAnyPopoutFocus,
  popoutGroups,
  popoutWindowOf,
} from "./popoutWindows";
import { GuiDiffDialog } from "./GuiDiffDialog";
import { resetGuiWriteDiffSession } from "./guiWriteSession";
import { LinkGameScreen } from "./LinkGameScreen";
import { MenuBar } from "./MenuBar";
import { ToastHost } from "./ToastHost";
import { pickModFolder } from "./modDeploy";
import {
  forgetRecent,
  openProjectFile,
  rememberRecent,
  saveProjectFile,
} from "./projectIo";
import { confirmDiscardAllDirty, confirmDiscardIfDirty } from "./unsavedChanges";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import type { GuiWritePlan } from "./writeGui";
import {
  resumeDeploy,
  startDeploy,
  type DeployNext,
  type DeployUi,
} from "./workflows/deploy";
import { WorkspaceDndProvider } from "./WorkspaceDnd";
import "./app.css";
import { t, useT } from "../i18n";
import { backendMessage, errorMessage } from "../i18n/backend";
import { APP_NAME, APP_SHORT_NAME } from "./appName";

type LinkState = "checking" | "unlinked" | "linked";

export function App() {
  // Re-rendu au changement de langue.
  useT();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewSettingsOpen, setPreviewSettingsOpen] = useState(false);
  const [linkState, setLinkState] = useState<LinkState>("checking");
  const [tf3Root, setTf3Root] = useState("");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [vocabulary, setVocabularyState] = useState<StyleVocabulary | null>(null);
  // Posés ensemble : le modèle (propriétés autorisées, validateur) le lit hors React.
  const setVocabulary = (v: StyleVocabulary | null) => {
    setActiveVocabulary(v);
    setVocabularyState(v);
  };
  const [baseStyles, setBaseStylesState] = useState<BaseStyles | null>(null);
  // Posés ensemble : la cascade (hors React) lit les styles actifs dès le rendu.
  const setBaseStyles = (styles: BaseStyles | null) => {
    setActiveBaseStyles(styles);
    setBaseStylesState(styles);
  };
  // Démarrage : l’espace de travail (aperçu…) n’apparaît qu’une fois prêt.
  const [booted, setBooted] = useState(false);
  const [bootStep, setBootStep] = useState(() => t("boot.starting"));
  // Choix du contenu à importer (installation, mise à jour, demande) : rien
  // n’est importé sans ce choix.
  const [importOffer, setImportOffer] = useState<{
    title: string;
    message: string;
    laterLabel?: string;
    counts: Record<GameImportMode, number> | null;
    defaultMode: GameImportMode;
    resolve: (mode: GameImportMode | null) => void;
  } | null>(null);
  // Import en cours : barre de chargement globale.
  const [importProgress, setImportProgress] = useState<ImportProgressState | null>(null);
  const [updatePostponed, setUpdatePostponed] = useState(false);
  const [rescanStatus, setRescanStatus] = useState("");
  const [ioError, setIoError] = useState<string | null>(null);
  const [newModOpen, setNewModOpen] = useState(false);
  const [modDialogOpen, setModDialogOpen] = useState(false);
  const [diffPlans, setDiffPlans] = useState<GuiWritePlan[] | null>(null);
  const [pendingAfterWrite, setPendingAfterWrite] = useState<DeployNext | null>(
    null,
  );
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [density, setDensityState] = useState<"compact" | "normal">("compact");

  const project = useProjectStore((s) => s.project);
  const projectPath = useProjectStore((s) => s.projectPath);
  const lastDropError = useProjectStore((s) => s.lastDropError);
  const validationIssues = useProjectStore((s) => s.validationIssues);
  const newProject = useProjectStore((s) => s.newProject);
  const setProject = useProjectStore((s) => s.setProject);
  const closeProject = useProjectStore((s) => s.closeProject);
  const setTealLines = useTealIssuesStore((s) => s.setLines);

  const catalogHashRef = useRef("");
  catalogHashRef.current = catalog?.sourceHash ?? "";
  const densityRef = useRef(density);
  densityRef.current = density;

  const issues = useMemo(
    () => (project ? validationIssues() : []),
    [project, validationIssues],
  );
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const errorCountRef = useRef(0);
  errorCountRef.current = errorCount;

  const deployUi = useMemo<DeployUi>(
    () => ({
      setBanner: (msg) => {
        if (msg) pushToast(msg, "info");
      },
      setError: setIoError,
      requestDiff: (plans, next) => {
        setDiffPlans(plans);
        setPendingAfterWrite(next);
      },
      getErrorCount: () => errorCountRef.current,
      focusProblems: () => runFocusProblems(),
    }),
    [],
  );

  useEffect(() => {
    if (!catalog) {
      setActiveCatalog(null);
      return;
    }
    setActiveCatalog(
      mergeHelperComponents(catalog, buildManualHelperComponents()),
    );
  }, [catalog]);

  useEffect(() => {
    ensureDeployStatusSubscriptions();
    // Retour dans l’éditeur après une session de jeu : relit le journal du
    // jeu s’il a changé (erreurs du mod dans Problèmes).
    const onFocus = () => {
      const p = useProjectStore.getState().project;
      if (p && "__TAURI_INTERNALS__" in window) {
        void refreshGameLog(p, true).catch(() => undefined);
      }
    };
    window.addEventListener("focus", onFocus);
    const offPopout = onAnyPopoutFocus(() => scheduleDeployStatusRefresh());
    return () => {
      window.removeEventListener("focus", onFocus);
      offPopout();
    };
  }, []);

  useEffect(() => {
    scheduleDeployStatusRefresh(errorCount);
  }, [errorCount, project, projectPath]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [settings] = await Promise.all([
        loadSettings(),
        preloadDockLayout(),
      ]);
      if (cancelled) return;
      applyDensity(settings.density);
      setShowBoxes(settings.previewShowBoxes);
      setPreviewAppearanceState(settings.previewAppearance);
      setPreviewFontScaleState(settings.previewTextScale);
      // Taille du texte choisie par le joueur dans le jeu (settings.lua).
      const gameSettings = gameSettingsPath(settings.stagingArea);
      if (gameSettings) {
        void readTextFile(gameSettings)
          .then((text) => setPlayerFontScale(parseGameFontScale(text)))
          .catch(() => undefined);
      }
      void restorePreviewBackground(
        settings.previewBackground,
        settings.previewBackgroundImage,
        settings.previewBackgroundImages,
      );
      setDensityState(settings.density);
      setTf3Root(settings.tf3Root);
      setRecentProjectPaths(settings.recentProjects);
      refreshRecentCommandLabels();
      setRecentIds(getRecentCommandIds().filter((_, i) => settings.recentProjects[i]));
      try {
        const check = await verifyGameRoot(settings.tf3Root);
        if (cancelled) return;
        if (check.ok) {
          setLinkState("linked");
          setTf3Root(check.tf3Root);
          const root = check.tf3Root;
          setBootStep(t("boot.readingCatalog"));
          const cache = await loadCatalogCache();
          // Cache produit par un parseur / extracteur plus ancien : seule la
          // partie périmée est relue (`builtin.d.tl` ; feuilles `.css.lua` des
          // archives) ; les styles de base restent valables.
          if (cache.catalog && isCatalogOutdated(cache.catalog)) {
            try {
              cache.catalog = await rescanCatalog({ readGameFile: (rel) => readGameFile(root, rel) });
              await saveCatalogOnlyCache(cache.catalog);
            } catch {
              // Lecture impossible : l’ancien catalogue reste utilisé.
            }
            if (cancelled) return;
          }
          if (cache.vocabulary && isVocabularyOutdated(cache.vocabulary)) {
            try {
              cache.vocabulary = await rescanVocabulary({
                listContentZips: () => listContentZips(root),
                listZip: (zip, suffix) => listZip(root, zip, suffix),
                readZipEntry: (zip, entry) => readZipEntry(root, zip, entry),
                readZipEntries: (zip, suffix) => readZipEntries(root, zip, suffix),
              });
              await saveCatalogOnlyCache(null, cache.vocabulary);
            } catch {
              // Lecture impossible : l’ancien vocabulaire reste utilisé.
            }
            if (cancelled) return;
          }
          if (cache.catalog) {
            setCatalog(
              mergeHelperComponents(
                cache.catalog,
                buildManualHelperComponents(),
              ),
            );
          }
          if (cache.vocabulary) {
            setVocabulary(cache.vocabulary);
          }
          if (cache.baseStyles) setBaseStyles(cache.baseStyles);
          let styles = cache.baseStyles;

          // Version du jeu : empreinte (taille + date de fichiers clés).
          // Aucun import sans l’accord de l’utilisateur.
          const fingerprint = await currentGameFingerprint(root).catch(() => null);
          const savedFingerprint = await loadGameFingerprint();
          const hasCatalog = !!cache.catalog && !!cache.baseStyles?.palette && !!cache.baseStyles.resolutions;
          const hasImages = (await loadImageIndex()) !== null;
          let mode: GameImportMode | null = null;
          if (!hasCatalog) {
            setBootStep(t("boot.firstUse"));
            mode = await askImport(root, styles, "install");
          } else if (fingerprint && savedFingerprint && savedFingerprint !== fingerprint) {
            setBootStep(t("boot.newGameVersion"));
            mode = await askImport(root, styles, "update");
            if (!mode) setUpdatePostponed(true);
          } else if (!hasImages) {
            setBootStep(t("boot.imagesMissing"));
            mode = await askImport(root, styles, "missing");
          }
          if (cancelled) return;
          if (mode) {
            styles = (await runGameImport(root, mode)) ?? styles;
          } else {
            setBootStep(t("boot.preparing"));
            await attachGameCopy(root);
            await reloadGameIcons();
            if (fingerprint && !savedFingerprint && hasCatalog) await saveGameFingerprint(fingerprint);
          }
          if (cancelled) return;
          await reopenProjects(setBootStep);
          if (!cancelled) setRecentIds(getRecentCommandIds());
          if (!cancelled) setBooted(true);
        } else {
          setLinkState("unlinked");
        }
      } catch {
        if (!cancelled) setLinkState("unlinked");
      }
    })();
    return () => {
      cancelled = true;
    };
    // Démarrage unique ; askImport / runGameImport ne dépendent que de setters stables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buildCommandContext(): CommandContext {
    const s = useProjectStore.getState();
    return {
      project: s.project,
      selectedNodeId: s.selectedNodeId,
      selectedScreenId: s.selectedScreenId,
      dirty: s.dirty,
      ui: {
        save: async (saveAs) => {
          setIoError(null);
          try {
            const path = await saveProjectFile(saveAs);
            if (path) pushToast(t("app.projectSaved"), "success", 2000);
            setRecentIds(getRecentCommandIds());
          } catch (error) {
            setIoError(
              error instanceof Error
                ? backendMessage(error.message)
                : t("app.saveFailed"),
            );
          }
        },
        open: async () => {
          setIoError(null);
          try {
            await openProjectFile();
            resetGuiWriteDiffSession();
            setRecentIds(getRecentCommandIds());
          } catch (error) {
            setIoError(
              error instanceof Error ? backendMessage(error.message) : t("app.openFailed"),
            );
          }
        },
        openMod: () => handleOpenMod(true),
        openRecent: async (path) => {
          setIoError(null);
          try {
            await openProjectFile(path);
            resetGuiWriteDiffSession();
            setRecentIds(getRecentCommandIds());
          } catch (error) {
            setIoError(
              error instanceof Error ? backendMessage(error.message) : t("app.openFailed"),
            );
          }
        },
        newProject: () => {
          newProject(catalogHashRef.current);
          resetGuiWriteDiffSession();
          setIoError(null);
        },
        newMod: () => setNewModOpen(true),
        closeProject: () => {
          closeProject();
          resetGuiWriteDiffSession();
          setIoError(null);
        },
        writeGui: async () => {
          setIoError(null);
          try {
            await startDeploy("writeGui", deployUi);
          } catch (error) {
            setIoError(
              error instanceof Error ? backendMessage(error.message) : t("app.writeGuiFailed"),
            );
          }
        },
        build: async () => {
          setIoError(null);
          try {
            await startDeploy("build", deployUi);
          } catch (error) {
            setIoError(
              error instanceof Error ? backendMessage(error.message) : t("app.buildFailed"),
            );
          }
        },
        install: async () => {
          setIoError(null);
          try {
            await startDeploy("install", deployUi);
          } catch (error) {
            setIoError(
              error instanceof Error ? backendMessage(error.message) : t("app.installFailed"),
            );
          }
        },
        exportZip: async () => {
          setIoError(null);
          try {
            await startDeploy("export", deployUi);
          } catch (error) {
            setIoError(
              error instanceof Error ? backendMessage(error.message) : t("app.exportFailed"),
            );
          }
        },
        checkTeal: () => handleTealCheck(),
        openSettings: () => setSettingsOpen(true),
        openPreviewSettings: () => setPreviewSettingsOpen(true),
        openModProperties: () => setModDialogOpen(true),
        rescan: () => requestGameImport(),
        confirmDiscard: () => confirmDiscardIfDirty(),
        setDensity: (d) => {
          setDensityState(d);
          densityRef.current = d;
        },
        getDensity: () => densityRef.current,
        showShortcuts: () => setShortcutsOpen(true),
        showAbout: () => setAboutOpen(true),
        openExternal: (url) => {
          void openUrl(url).catch(() => window.open(url, "_blank"));
        },
        openPath: async (path) => {
          await openPath(path);
        },
      },
    };
  }

  ensureCommandsRegistered();
  setCommandContextGetter(() => buildCommandContext());

  // Titre de fenêtre : « ● projet — TFUI » quand il y a des
  // modifications non enregistrées (aussi sur les fenêtres détachées).
  const dirty = useProjectStore((s) => s.dirty);
  useEffect(() => {
    const name = project
      ? projectPath
        ? (projectPath.split(/[/\\]/).pop() ?? "")
        : t("menubar.untitled")
      : null;
    const title = name ? `${dirty ? "● " : ""}${name} — ${APP_SHORT_NAME}` : APP_NAME;
    document.title = title;
    const api = getDockApi();
    if (api) {
      for (const g of popoutGroups(api)) {
        const w = popoutWindowOf(g);
        try {
          if (w && !w.closed) w.document.title = title;
        } catch {
          // fenêtre en cours de fermeture
        }
      }
    }
    if ("__TAURI_INTERNALS__" in window) {
      void getCurrentWindow()
        .setTitle(title)
        .catch(() => undefined);
    }
  }, [project, projectPath, dirty]);

  // Projets ouverts (multi-projets) et projet actif : rouverts au prochain
  // démarrage. Changement de projet actif : état d’écriture et édition en
  // place propres au projet précédent abandonnés.
  useEffect(() => {
    const openPaths = (s: ReturnType<typeof useProjectStore.getState>) =>
      s.sessions
        .map((x) => (x.id === s.activeSessionId ? s.projectPath : x.projectPath))
        .filter((p): p is string => !!p);
    return useProjectStore.subscribe((s, prev) => {
      const paths = openPaths(s);
      const active = s.project ? s.projectPath : null;
      const prevActive = prev.project ? prev.projectPath : null;
      if (active !== prevActive || paths.join("\n") !== openPaths(prev).join("\n")) {
        void setOpenProjects(paths, active).catch(() => undefined);
      }
      if (s.activeSessionId !== prev.activeSessionId) {
        resetGuiWriteDiffSession();
        stopInlineEdit();
      }
    });
  }, []);

  // Fermeture de la fenêtre (croix, Alt+F4, Fichier › Quitter).
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        if (!(await confirmDiscardAllDirty(t("unsaved.beforeQuit")))) {
          event.preventDefault();
          return;
        }
        // Disposition enregistrée popouts comprises, puis fermeture des
        // fenêtres détachées (sinon l’app resterait ouverte).
        const api = getDockApi();
        await flushLayoutAndSuspend(api);
        if (api) for (const g of popoutGroups(api)) closePopoutGroup(api, g);
      })
      .then((u) => {
        if (disposed) u();
        else unlisten = u;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    return installCommandShortcuts(() => buildCommandContext());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers via refs/closures
  }, []);

  /**
   * Demande quel contenu importer (installation, mise à jour, demande) ;
   * null si l’utilisateur reporte.
   */
  async function askImport(
    root: string,
    styles: BaseStyles | null,
    kind: "install" | "update" | "missing" | "manual",
  ): Promise<GameImportMode | null> {
    const settings = await loadSettings();
    const texts = {
      install: {
        title: t("import.install.title"),
        message: t("import.install.message"),
        laterLabel: undefined,
      },
      update: {
        title: t("import.update.title"),
        message: t("import.update.message"),
        laterLabel: t("import.later"),
      },
      missing: {
        title: t("import.missing.title"),
        message: t("import.missing.message"),
        laterLabel: t("import.later"),
      },
      manual: {
        title: t("import.manual.title"),
        message: t("import.manual.message"),
        laterLabel: t("common.cancel"),
      },
    }[kind];
    return new Promise<GameImportMode | null>((resolve) => {
      setImportOffer({ ...texts, counts: null, defaultMode: settings.gameImportMode, resolve });
      void importCounts(root, styles)
        .then((counts) => setImportOffer((o) => (o && o.resolve === resolve ? { ...o, counts } : o)))
        .catch(() => undefined);
    }).finally(() => setImportOffer(null));
  }

  /**
   * Import complet : catalogue et styles (re-scan), polices et images selon
   * le mode, puis empreinte de version. Barre de chargement globale.
   */
  async function runGameImport(root: string, mode: GameImportMode): Promise<BaseStyles | null> {
    setRescanStatus(t("import.inProgress"));
    setImportProgress({ phase: "catalog", phaseRatio: 0, detail: t("import.readingDefinitions") });
    try {
      const result = await rescanGame({
        readGameFile: (rel) => readGameFile(root, rel),
        listContentZips: () => listContentZips(root),
        listZip: (zip, suffix) => listZip(root, zip, suffix),
        readZipEntry: (zip, entry) => readZipEntry(root, zip, entry),
        readZipEntries: (zip, suffix) => readZipEntries(root, zip, suffix),
        wasmUrl: glueWasmUrl,
      });
      await saveCatalogCache(result.catalog, result.vocabulary, result.baseStyles);
      setCatalog(result.catalog);
      setVocabulary(result.vocabulary);
      // Aucune feuille lue : les propriétés par type seraient réduites au socle.
      if (result.vocabulary.scannedFiles === 0) pushToast(t("import.noStyleSheets"), "error");
      if (result.baseStyles) setBaseStyles(result.baseStyles);
      setImportProgress({ phase: "catalog", phaseRatio: 1, detail: t("import.catalogSaved") });
      const summary = await importGameContent(root, result.baseStyles, mode, setImportProgress);
      await attachGameCopy(root);
      await reloadGameIcons();
      const fingerprint = await currentGameFingerprint(root).catch(() => null);
      if (fingerprint) await saveGameFingerprint(fingerprint);
      await setGameImportModeSetting(mode).catch(() => undefined);
      setUpdatePostponed(false);
      const errors = summary.errors.length ? t("import.unreadableImages", { n: summary.errors.length }) : "";
      setRescanStatus(
        t("import.doneStatus", { components: result.catalog.components.length, images: summary.converted, errors }),
      );
      pushToast(t("import.doneToast", { images: summary.converted, errors }), "success");
      return result.baseStyles;
    } catch (error) {
      const message = errorMessage(error);
      setRescanStatus(t("import.failed", { message }));
      pushToast(t("import.failed", { message }), "error", 8000);
      return null;
    } finally {
      setImportProgress(null);
    }
  }

  /** Outils › Importer le contenu du jeu… (choix du mode, puis import). */
  async function requestGameImport(): Promise<void> {
    const mode = await askImport(tf3Root, baseStyles, "manual");
    if (mode) await runGameImport(tf3Root, mode);
  }

  async function handleCreateMod(opts: {
    parentDir: string;
    modId: string;
    displayName: string;
  }) {
    setIoError(null);
    try {
      const scaffold = await createModScaffold(
        opts.parentDir,
        opts.modId,
        opts.displayName,
      );
      const projectData = createModScaffoldProject({
        modId: opts.modId,
        displayName: opts.displayName,
        catalogHash: catalog?.sourceHash ?? "",
      });
      const json = `${JSON.stringify(projectData, null, 2)}\n`;
      await writeTextFile(scaffold.tfuiPath, json);
      setProject(projectData, scaffold.tfuiPath);
      resetGuiWriteDiffSession();
      await rememberRecent(scaffold.tfuiPath);
      setRecentIds(getRecentCommandIds());
      setNewModOpen(false);
      pushToast(t("app.modCreated", { path: scaffold.projectDir }), "success");
      // L’éditeur ne garde pas de sauvegardes : le versionnement est conseillé.
      pushToast(t("app.gitAdvice"), "info");
    } catch (error) {
      setIoError(error instanceof Error ? backendMessage(error.message) : t("app.createFailed"));
    }
  }

  async function handleOpenMod(skipDirtyCheck = false) {
    if (!skipDirtyCheck && !(await confirmDiscardIfDirty())) return;
    setIoError(null);
    try {
      const folder = await pickModFolder();
      if (!folder) return;
      let modJsonText: string;
      try {
        modJsonText = await readTextFile(join(folder, "mod.json"));
      } catch {
        setIoError(t("app.noModJson"));
        return;
      }
      const modJson = JSON.parse(modJsonText) as { modId?: string };
      const modId = modJson.modId ?? basename(folder);
      const projectDir = dirname(folder);
      const modRootName = basename(folder);
      const tfuiCandidate = join(projectDir, `${modId}.tfui.json`);
      let existing: string | null = null;
      try {
        existing = await readTextFile(tfuiCandidate);
      } catch {
        existing = null;
      }
      if (existing != null) {
        const result = useProjectStore
          .getState()
          .loadFromJson(existing, tfuiCandidate);
        if (!result.ok) throw new Error(result.error);
      } else {
        const create = window.confirm(
          t("app.createProjectForMod", { file: `${modId}.tfui.json` }),
        );
        if (!create) return;
        const meta = await readModMetadata(folder);
        const name = String(meta.modinfo.name ?? modId);
        const projectData = createModScaffoldProject({
          modId,
          displayName: name,
          catalogHash: catalog?.sourceHash ?? "",
        });
        projectData.mod.modRoot = modRootName;
        const json = `${JSON.stringify(projectData, null, 2)}\n`;
        await writeTextFile(tfuiCandidate, json);
        setProject(projectData, tfuiCandidate);
      }
      resetGuiWriteDiffSession();
      await rememberRecent(tfuiCandidate);
      setRecentIds(getRecentCommandIds());
      pushToast(t("app.modOpened", { path: folder }), "success");
    } catch (error) {
      setIoError(
        error instanceof Error ? backendMessage(error.message) : t("app.openModFailed"),
      );
    }
  }

  async function handleTealCheck() {
    if (!project || !projectPath) return;
    setIoError(null);
    try {
      const modRoot = join(dirname(projectPath), project.mod.modRoot);
      const lines = await checkTeal(modRoot, project.mod.guiDir);
      setTealLines(lines);
      pushToast(t("app.tealDone"), "info");
      if (!isPanelOpen("problems")) togglePanel("problems");
      focusPanel("problems");
    } catch (error) {
      setIoError(error instanceof Error ? backendMessage(error.message) : t("app.tealFailed"));
    }
  }

  if (linkState === "checking") {
    return (
      <div className="link-game-screen">
        <p>{t("boot.checkingInstall")}</p>
      </div>
    );
  }

  if (linkState === "unlinked") {
    return (
      <LinkGameScreen
        initialRoot={tf3Root}
        onLinked={(root) => {
          setTf3Root(root);
          setLinkState("linked");
          setBootStep(t("boot.importing"));
          void (async () => {
            const mode = await askImport(root, null, "install");
            if (mode) await runGameImport(root, mode);
            await reopenProjects(setBootStep);
            setRecentIds(getRecentCommandIds());
            setBooted(true);
          })();
        }}
      />
    );
  }

  // Choix d’import et barre de chargement (démarrage comme dans l’app).
  const importDialogs = (
    <>
      {importOffer ? (
        <GameImportDialog
          title={importOffer.title}
          message={importOffer.message}
          counts={importOffer.counts}
          defaultMode={importOffer.defaultMode}
          laterLabel={importOffer.laterLabel}
          onChoose={(mode) => importOffer.resolve(mode)}
          onLater={importOffer.laterLabel ? () => importOffer.resolve(null) : undefined}
        />
      ) : null}
      {importProgress ? <ImportProgress state={importProgress} /> : null}
    </>
  );

  if (!booted) {
    return (
      <div className="link-game-screen">
        <p>{bootStep}</p>
        {importDialogs}
      </div>
    );
  }

  const projectDir = projectPath ? dirname(projectPath) : null;

  return (
    <div className="app-shell">
      <MenuBar
        recentCommandIds={recentIds}
        errorCount={errorCount}
        onFocusProblems={() => {
          void runFocusProblems();
        }}
      />
      {updatePostponed ? (
        <div className="app-banner" role="status">
          {t("app.gameUpdatedBanner")}
        </div>
      ) : null}
      {ioError || lastDropError ? (
        <div className="app-banner app-banner-error" role="alert">
          {ioError ?? lastDropError}
        </div>
      ) : null}
      <CatalogProvider catalog={catalog} vocabulary={vocabulary} baseStyles={baseStyles}>
        <WorkspaceDndProvider>
          <DockWorkspace />
        </WorkspaceDndProvider>
        {previewSettingsOpen ? (
          <PreviewSettingsDialog onClose={() => setPreviewSettingsOpen(false)} />
        ) : null}
      </CatalogProvider>
      {importDialogs}
      <ToastHost />
      <UnsavedChangesDialog />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onRescan={() => void requestGameImport()}
        rescanStatus={rescanStatus}
      />
      {newModOpen ? (
        <NewModDialog
          onCancel={() => setNewModOpen(false)}
          onCreate={(opts) => void handleCreateMod(opts)}
        />
      ) : null}
      {modDialogOpen && project && projectDir ? (
        <ModDialog
          projectDir={projectDir}
          modRootRel={project.mod.modRoot}
          modId={project.mod.modId}
          onClose={() => setModDialogOpen(false)}
          onModIdChange={(modId) => {
            useProjectStore.getState().setModInfo({ modId });
          }}
        />
      ) : null}
      {diffPlans ? (
        <GuiDiffDialog
          plans={diffPlans}
          onCancel={() => {
            setDiffPlans(null);
            setPendingAfterWrite(null);
          }}
          onConfirm={() => {
            const plans = diffPlans;
            const next = pendingAfterWrite ?? "writeGui";
            setDiffPlans(null);
            setPendingAfterWrite(null);
            void resumeDeploy(next, deployUi, plans).catch((error: unknown) => {
              setIoError(
                error instanceof Error
                  ? backendMessage(error.message)
                  : t("app.deployFailed"),
              );
            });
          }}
        />
      ) : null}
      {shortcutsOpen ? (
        <div className="modal-backdrop" role="dialog">
          <div className="modal">
            <h2>{t("shortcuts.title")}</h2>
            <ul className="shortcuts-list">
              <li>{t("shortcuts.new")}</li>
              <li>{t("shortcuts.open")}</li>
              <li>{t("shortcuts.save")}</li>
              <li>{t("shortcuts.build")}</li>
              <li>{t("shortcuts.install")}</li>
              <li>{t("shortcuts.undo")}</li>
              <li>{t("shortcuts.delete")}</li>
            </ul>
            <div className="modal-actions">
              <button type="button" onClick={() => setShortcutsOpen(false)}>
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {aboutOpen ? (
        <div className="modal-backdrop" role="dialog">
          <div className="modal">
            <h2>{t("about.title")}</h2>
            <p>{t("about.text")}</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setAboutOpen(false)}>
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Rouvre les projets laissés ouverts à la dernière fermeture, puis réactive
 * celui qui était actif.
 */
async function reopenProjects(onStep: (text: string) => void): Promise<void> {
  const { paths, active } = await loadOpenProjects();
  const all = [...new Set([...paths, ...(active ? [active] : [])])];
  for (const path of all) {
    onStep(t("boot.opening", { name: path.split(/[/\\]/).pop() ?? path }));
    try {
      await openProjectFile(path);
    } catch {
      pushToast(t("boot.projectNotFound", { path }), "info", 6000);
      await forgetRecent(path);
    }
  }
  if (active) {
    const st = useProjectStore.getState();
    const session = st.sessions.find((x) => x.projectPath === active);
    if (session) st.switchProject(session.id);
  }
  resetGuiWriteDiffSession();
}

function runFocusProblems(): void {
  if (!isPanelOpen("problems")) togglePanel("problems");
  focusPanel("problems");
}

export default App;
