import { appDataDir } from "@tauri-apps/api/path";
import { useSyncExternalStore } from "react";
import { hashText } from "../catalog/hash";
import type { GeneratedFile } from "../codegen";
import {
  modSourceHash,
  readBuildState,
  writeBuildState,
  type BuildStateEntry,
} from "../tauri/commands";
import { dirname } from "../tauri/pathUtil";
import { getGeneratedFilesSnapshot } from "./generatedFilesStore";
import { useProjectStore } from "./projectStore";
import { t, useI18nStore } from "../i18n";
import { errorMessage } from "../i18n/backend";

export type DeployButtonState =
  | "never"
  | "current"
  | "stale"
  | "running"
  | "error"
  | "blocked";

export interface DeployStatus {
  build: DeployButtonState;
  install: DeployButtonState;
  buildTooltip: string;
  installTooltip: string;
  lastError: string | null;
  running: null | "build" | "install";
  fingerprint: string | null;
  lastBuild: BuildStateEntry | null;
}

let status: DeployStatus = {
  build: "never",
  install: "never",
  get buildTooltip() { return t("deploy.neverBuilt"); },
  get installTooltip() { return t("deploy.neverInstalled"); },
  lastError: null,
  running: null,
  fingerprint: null,
  lastBuild: null,
};

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let focusBound = false;

function emit(): void {
  for (const l of listeners) l();
}

function setStatus(patch: Partial<DeployStatus>): void {
  status = { ...status, ...patch };
  emit();
}

export function getDeployStatus(): DeployStatus {
  return status;
}

export function subscribeDeployStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDeployStatus(): DeployStatus {
  return useSyncExternalStore(
    subscribeDeployStatus,
    getDeployStatus,
    getDeployStatus,
  );
}

export function setDeployRunning(kind: null | "build" | "install"): void {
  if (kind === null) {
    setStatus({ running: null });
    return;
  }
  setStatus({
    running: kind,
    build: kind === "build" ? "running" : status.build,
    install: kind === "install" ? "running" : status.install,
    lastError: null,
  });
}

export function setDeployError(message: string): void {
  setStatus({
    running: null,
    build: "error",
    install: status.install === "running" ? "error" : status.install,
    lastError: message,
    buildTooltip: message,
  });
}

function guiHashFromFiles(files: GeneratedFile[]): string {
  const joined = files
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => `${f.path}\n${f.content}`)
    .join("\n--\n");
  return hashText(joined);
}

function combineFingerprint(guiHash: string, sourceHash: string): string {
  return hashText(`${guiHash}|${sourceHash}`);
}

function installFpKey(projectPath: string): string {
  return `tfui.installFp:${projectPath}`;
}

export async function refreshDeployStatus(opts?: {
  errorCount?: number;
}): Promise<void> {
  const project = useProjectStore.getState().project;
  const projectPath = useProjectStore.getState().projectPath;
  const errorCount =
    opts?.errorCount ??
    useProjectStore
      .getState()
      .validationIssues()
      .filter((i) => i.severity === "error").length;

  if (!project || !projectPath) {
    setStatus({
      build: "never",
      install: "never",
      buildTooltip: t("deploy.noProject"),
      installTooltip: t("deploy.noProject"),
      fingerprint: null,
      lastBuild: null,
      running: null,
    });
    return;
  }

  if (errorCount > 0) {
    setStatus({
      build: "blocked",
      install: "blocked",
      buildTooltip: t("deploy.fixErrors"),
      installTooltip: t("deploy.fixErrors"),
      running: null,
    });
    return;
  }

  if (status.running) return;

  try {
    const files = getGeneratedFilesSnapshot().files;
    const guiHash = guiHashFromFiles(files);
    const projectDir = dirname(projectPath);
    let sourceHash = "";
    try {
      sourceHash = await modSourceHash(projectDir, project.mod.modRoot);
    } catch {
      sourceHash = "unavailable";
    }
    const fingerprint = combineFingerprint(guiHash, sourceHash);
    const dataDir = await appDataDir();
    const lastBuild = await readBuildState(dataDir, projectPath);
    let installFp: string | null = null;
    try {
      installFp = localStorage.getItem(installFpKey(projectPath));
    } catch {
      installFp = null;
    }

    let build: DeployButtonState = "never";
    let buildTooltip = t("deploy.neverBuilt");
    if (lastBuild) {
      if (lastBuild.fingerprint === fingerprint) {
        build = "current";
        buildTooltip = t("deploy.lastBuild", { date: lastBuild.builtAt });
      } else {
        build = "stale";
        buildTooltip = t("deploy.staleBuild");
      }
    }

    let install: DeployButtonState = "never";
    let installTooltip = t("deploy.neverInstalled");
    if (!lastBuild) {
      install = "never";
    } else if (!installFp) {
      install = "stale";
      installTooltip = t("deploy.buildReady");
    } else if (installFp === fingerprint && build === "current") {
      install = "current";
      installTooltip = t("deploy.installCurrent");
    } else {
      install = "stale";
      installTooltip = t("deploy.installStale");
    }

    if (build === "stale" && install !== "never") {
      install = "stale";
    }

    setStatus({
      build,
      install,
      buildTooltip,
      installTooltip,
      fingerprint,
      lastBuild,
      lastError: null,
    });
  } catch (e) {
    setStatus({
      lastError: errorMessage(e),
    });
  }
}

export async function recordSuccessfulBuild(): Promise<void> {
  const project = useProjectStore.getState().project;
  const projectPath = useProjectStore.getState().projectPath;
  if (!project || !projectPath) {
    setStatus({ running: null });
    await refreshDeployStatus();
    return;
  }
  const files = getGeneratedFilesSnapshot().files;
  const guiHash = guiHashFromFiles(files);
  const projectDir = dirname(projectPath);
  const sourceHash = await modSourceHash(projectDir, project.mod.modRoot);
  const fingerprint = combineFingerprint(guiHash, sourceHash);
  const entry: BuildStateEntry = {
    guiHash,
    sourceHash,
    fingerprint,
    builtAt: new Date().toISOString(),
  };
  const dataDir = await appDataDir();
  await writeBuildState(dataDir, projectPath, entry);
  setStatus({ running: null, lastBuild: entry, fingerprint });
  await refreshDeployStatus();
}

export async function recordSuccessfulInstall(): Promise<void> {
  const projectPath = useProjectStore.getState().projectPath;
  const fp = status.fingerprint ?? status.lastBuild?.fingerprint;
  if (projectPath && fp) {
    try {
      localStorage.setItem(installFpKey(projectPath), fp);
    } catch {
      // ignore
    }
  }
  setStatus({ running: null });
  await refreshDeployStatus();
}

export function scheduleDeployStatusRefresh(errorCount?: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void refreshDeployStatus({ errorCount });
  }, 350);
}

export function ensureDeployStatusSubscriptions(): void {
  if (focusBound) return;
  focusBound = true;
  window.addEventListener("focus", () => {
    scheduleDeployStatusRefresh();
  });
  useProjectStore.subscribe(() => {
    scheduleDeployStatusRefresh();
  });
  // Infobulles des boutons Build / Installer dans la nouvelle langue.
  useI18nStore.subscribe(() => {
    scheduleDeployStatusRefresh();
  });
}
