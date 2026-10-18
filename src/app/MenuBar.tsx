import { Check, Download, Hammer } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDeployStatus, type DeployButtonState } from "../store/deployStatusStore";
import { useProjectStore } from "../store/projectStore";
import { MenuList } from "../ui/menu/MenuList";
import type { MenuItem } from "../ui/menu/types";
import {
  getCommandContext,
  runCommand,
  type CommandContext,
} from "./commands";
import {
  editMenuItems,
  fileMenuItems,
  helpMenuItems,
  insertMenuItems,
  modMenuItems,
  toolsMenuItems,
  viewMenuItems,
} from "./menus/menubarMenus";
import "./MenuBar.css";
import { t, useI18nStore } from "../i18n";
import { APP_NAME, APP_SHORT_NAME } from "./appName";

interface MenuDef {
  id: string;
  label: string;
  items: () => MenuItem[];
}

function stateClass(s: DeployButtonState): string {
  return `deploy-${s}`;
}

export function MenuBar({
  recentCommandIds,
  errorCount,
  onFocusProblems,
}: {
  recentCommandIds: string[];
  errorCount: number;
  onFocusProblems: () => void;
}) {
  const project = useProjectStore((s) => s.project);
  const dirty = useProjectStore((s) => s.dirty);
  const projectPath = useProjectStore((s) => s.projectPath);
  // Re-rendu au changement de langue (libellés des menus).
  const language = useI18nStore((s) => s.language);
  const deploy = useDeployStatus();
  const [openId, setOpenId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const hoverArmed = openId !== null;

  // Bref retour visuel (vert) juste après un enregistrement.
  const [justSaved, setJustSaved] = useState(false);
  const wasDirty = useRef(dirty);
  useEffect(() => {
    const saved = wasDirty.current && !dirty && project !== null;
    wasDirty.current = dirty;
    if (!saved) return;
    setJustSaved(true);
    const timer = window.setTimeout(() => setJustSaved(false), 1500);
    return () => window.clearTimeout(timer);
  }, [dirty, project]);

  const menus: MenuDef[] = useMemo(
    () => [
      { id: "file", label: t("menu.file"), items: () => fileMenuItems(recentCommandIds) },
      { id: "edit", label: t("menu.edit"), items: editMenuItems },
      { id: "insert", label: t("menu.insert"), items: insertMenuItems },
      { id: "view", label: t("menu.view"), items: viewMenuItems },
      { id: "mod", label: t("menu.mod"), items: modMenuItems },
      { id: "tools", label: t("menu.tools"), items: toolsMenuItems },
      { id: "help", label: t("menu.help"), items: helpMenuItems },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- libellés relus au changement de langue
    [recentCommandIds, language],
  );

  const openMenu = useCallback((id: string, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setOpenId(id);
    setAnchor({ x: rect.left, y: rect.bottom });
  }, []);

  const close = useCallback(() => {
    setOpenId(null);
    setAnchor(null);
  }, []);

  useEffect(() => {
    if (!openId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const idx = menus.findIndex((m) => m.id === openId);
        if (idx < 0) return;
        const next =
          e.key === "ArrowRight"
            ? menus[(idx + 1) % menus.length]!
            : menus[(idx - 1 + menus.length) % menus.length]!;
        const btn = barRef.current?.querySelector<HTMLElement>(
          `[data-menu="${next.id}"]`,
        );
        if (btn) openMenu(next.id, btn);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, menus, close, openMenu]);

  const ctx: CommandContext = getCommandContext();
  const openDef = menus.find((m) => m.id === openId);
  const fileName = projectPath
    ? projectPath.split(/[/\\]/).pop()
    : project
      ? t("menubar.untitled")
      : t("menubar.noProject");

  return (
    <header className="app-menubar menubar-root" ref={barRef}>
      <div className="menubar-left">
        <div className="brand" title={APP_NAME}>
          <img src="/icon.png" alt="" className="brand-icon" />
          {APP_SHORT_NAME}
        </div>
        <nav className="menubar-menus" role="menubar">
          {menus.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`menubar-trigger${openId === m.id ? " open" : ""}`}
              data-menu={m.id}
              role="menuitem"
              aria-haspopup
              aria-expanded={openId === m.id}
              onClick={(e) => {
                if (openId === m.id) close();
                else openMenu(m.id, e.currentTarget);
              }}
              onMouseEnter={(e) => {
                if (hoverArmed) openMenu(m.id, e.currentTarget);
              }}
            >
              {m.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="menubar-right">
        <div className="menubar-status" title={projectPath ?? undefined}>
          <span className="status-file">{fileName}</span>
          {project ? (
            <button
              type="button"
              className={`save-state ${
                dirty ? "is-dirty" : justSaved ? "is-saved flash" : "is-saved"
              }`}
              title={
                dirty
                  ? t("menubar.dirtyHint")
                  : t("menubar.savedHint")
              }
              onClick={() => {
                if (dirty) void runCommand("file.save", ctx);
              }}
            >
              {dirty ? (
                <>
                  <span className="save-dot" aria-hidden />
                  {t("menubar.dirty")}
                </>
              ) : (
                <>
                  <Check size={12} aria-hidden />
                  {t("menubar.saved")}
                </>
              )}
            </button>
          ) : null}
          {errorCount > 0 ? (
            <button
              type="button"
              className="status-errors"
              onClick={onFocusProblems}
            >
              {t("menubar.errors", { n: errorCount })}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className={`deploy-btn ${stateClass(deploy.build)}`}
          title={deploy.buildTooltip}
          disabled={!project || deploy.build === "blocked" || deploy.running === "build"}
          onClick={() => void runCommand("mod.build", ctx)}
        >
          <Hammer size={14} aria-hidden />
          {t("menubar.build")}
        </button>
        <button
          type="button"
          className={`deploy-btn primary ${stateClass(deploy.install)}`}
          title={deploy.installTooltip}
          disabled={
            !project ||
            deploy.install === "blocked" ||
            deploy.running === "install"
          }
          onClick={() => void runCommand("mod.install", ctx)}
        >
          <Download size={14} aria-hidden />
          {t("menubar.install")}
        </button>
      </div>
      {openDef && anchor ? (
        <MenuList
          items={openDef.items()}
          anchor={anchor}
          ctx={ctx}
          onClose={close}
          mode="bar"
        />
      ) : null}
    </header>
  );
}
