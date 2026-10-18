import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, EyeOff, FileJson, Lock } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { setInlineRenameHandler } from "../../app/commands/inlineRenameBridge";
import { withCommandTargets } from "../../app/commands";
import {
  nodeContextMenuItems,
  screenHeaderMenuItems,
  treeBackgroundMenuItems,
} from "../../app/menus/contextMenus";
import { useWorkspaceDnd, type TreeDragData } from "../../app/WorkspaceDnd";
import type { TfuiProject } from "../../model/types";
import { useProjectStore } from "../../store/projectStore";
import { ComponentIcon } from "../../ui/icons";
import { ContextMenu } from "../../ui/menu/ContextMenu";
import { useContextMenu } from "../../ui/menu/useContextMenu";
import { ancestorIds, filterCollapsedRows, flattenScreen, projectLabel, type FlatRow } from "./treeRows";
import "./TreePanel.css";
import { t, useT } from "../../i18n";

/** Nœuds repliés, mémorisés entre les sessions (préférence locale). */
const COLLAPSED_KEY = "tfui.tree.collapsed.v1";
/** Projets repliés (par chemin), mémorisés. */
const PROJECTS_COLLAPSED_KEY = "tfui.tree.projectsCollapsed.v1";

function loadSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveSet(key: string, set: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // préférence locale : ignorée si indisponible
  }
}

function NodeRow({
  row,
  selected,
  collapsed,
  renaming,
  onSelect,
  onToggleCollapse,
  onContextMenu,
  onCommitRename,
  onCancelRename,
}: {
  row: FlatRow;
  selected: boolean;
  collapsed: boolean;
  renaming: boolean;
  onSelect: () => void;
  onToggleCollapse: () => void;
  onContextMenu: (e: MouseEvent) => void;
  onCommitRename: (name: string) => void;
  onCancelRename: () => void;
}) {
  const { overId, overKind, overValid } = useWorkspaceDnd();
  const highlighted = useProjectStore((s) => s.highlightedNodeIds.includes(row.id));
  const dragData: TreeDragData = { source: "tree", nodeId: row.id };
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: row.id,
    disabled: row.parentId === null || !!row.node.locked,
    data: dragData,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${row.id}`,
    data: { row },
    disabled: !!row.node.locked,
  });

  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [renaming]);

  const dropClass =
    overId === row.id && overKind
      ? `drop-${overKind}${overValid ? "" : " drop-invalid"}`
      : isOver
        ? "drop-into"
        : "";

  const flags = (
    <>
      {row.node.hidden ? <EyeOff size={12} className="tree-node-flag" aria-label={t("tree.hidden")} /> : null}
      {row.node.locked ? <Lock size={12} className="tree-node-flag" aria-label={t("tree.locked")} /> : null}
    </>
  );

  return (
    <div
      ref={(el) => {
        setDragRef(el);
        setDropRef(el);
      }}
      className={`tree-node ${selected ? "selected" : ""} ${highlighted ? "highlighted" : ""} ${isDragging ? "dragging" : ""} ${row.node.hidden ? "hidden-node" : ""} ${row.node.locked ? "locked-node" : ""} ${dropClass}`}
      style={{ ["--depth" as string]: row.depth }}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      {...(renaming ? {} : listeners)}
      {...(renaming ? {} : attributes)}
    >
      {row.hasChildren ? (
        <button
          type="button"
          className="tree-node-chevron-btn"
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("tree.expand") : t("tree.collapse")}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
        >
          <ChevronRight size={12} className={`tree-slot-chevron${collapsed ? "" : " open"}`} aria-hidden />
        </button>
      ) : (
        <span className="tree-node-chevron-spacer" aria-hidden />
      )}
      {row.slotBadge ? (
        <span className="tree-slot-badge" title={t("tree.slotBadge", { slot: row.slotBadge })}>
          {row.slotBadge}
        </span>
      ) : null}
      <ComponentIcon type={row.node.type} orientation={row.node.props.orientation} className="tree-node-icon" />
      {renaming ? (
        <input
          ref={inputRef}
          className="tree-node-rename"
          defaultValue={row.node.name ?? row.node.type}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onCommitRename(inputRef.current?.value ?? "");
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancelRename();
            }
          }}
          onBlur={() => onCommitRename(inputRef.current?.value ?? "")}
        />
      ) : (
        <>
          {/* Nom de l’objet en avant, son type en petit (pas de doublon si
              le nom est le type). */}
          <span className="tree-node-name">{row.node.name || row.node.type}</span>
          {row.node.name && row.node.name !== row.node.type ? (
            <span className="tree-node-type">{row.node.type}</span>
          ) : null}
          {flags}
        </>
      )}
    </div>
  );
}

interface OpenProject {
  id: string;
  project: TfuiProject;
  path: string | null;
  dirty: boolean;
  active: boolean;
}

/**
 * Hiérarchie : un fichier projet par racine (multi-projets, un seul actif),
 * ses écrans dessous, une ligne par nœud ; le slot d’un enfant n’apparaît
 * qu’en petite étiquette quand son parent en a plusieurs.
 */
export function TreePanel() {
  useT();
  const project = useProjectStore((s) => s.project);
  const projectPath = useProjectStore((s) => s.projectPath);
  const dirty = useProjectStore((s) => s.dirty);
  const sessions = useProjectStore((s) => s.sessions);
  const activeSessionId = useProjectStore((s) => s.activeSessionId);
  const selectedNodeId = useProjectStore((s) => s.selectedNodeId);
  const selectedScreenId = useProjectStore((s) => s.selectedScreenId);
  const lastDropError = useProjectStore((s) => s.lastDropError);
  const setSelection = useProjectStore((s) => s.setSelection);
  const switchProject = useProjectStore((s) => s.switchProject);
  const insertChild = useProjectStore((s) => s.insertChild);
  const deleteNode = useProjectStore((s) => s.deleteNode);
  const clearDropError = useProjectStore((s) => s.clearDropError);
  const validationIssues = useProjectStore((s) => s.validationIssues);
  const renameNode = useProjectStore((s) => s.renameNode);

  const ctxMenu = useContextMenu();
  const [menuTargets, setMenuTargets] = useState<{
    nodeId?: string | null;
    screenId?: string | null;
  }>({});
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => loadSet(COLLAPSED_KEY));
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(() => loadSet(PROJECTS_COLLAPSED_KEY));
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Projets ouverts : l’actif depuis les champs du store, les autres depuis
  // leur session.
  const projects = useMemo<OpenProject[]>(() => {
    const list: OpenProject[] = sessions.map((sess) =>
      sess.id === activeSessionId && project
        ? { id: sess.id, project, path: projectPath, dirty, active: true }
        : { id: sess.id, project: sess.project, path: sess.projectPath, dirty: sess.dirty, active: false },
    );
    if (list.length === 0 && project) list.push({ id: "active", project, path: projectPath, dirty, active: true });
    return list;
  }, [sessions, activeSessionId, project, projectPath, dirty]);

  const blocks = useMemo(
    () =>
      projects.map((p) => ({
        ...p,
        screens: p.project.screens.map((screen) => ({ screen, rows: flattenScreen(screen) })),
      })),
    [projects],
  );

  const activeRows = useMemo(() => blocks.find((b) => b.active)?.screens.flatMap((s) => s.rows) ?? [], [blocks]);
  const visibleNodeRows = useMemo(() => {
    const active = blocks.find((b) => b.active);
    return active ? active.screens.flatMap((s) => filterCollapsedRows(s.rows, collapsedIds)) : [];
  }, [blocks, collapsedIds]);

  useEffect(() => {
    setInlineRenameHandler((nodeId) => setRenamingId(nodeId));
    return () => setInlineRenameHandler(null);
  }, []);

  // Déplier jusqu’à la sélection (aperçu, inspecteur, commandes).
  useEffect(() => {
    if (!selectedNodeId) return;
    const ancestors = ancestorIds(activeRows, selectedNodeId);
    if (!ancestors.some((id) => collapsedIds.has(id))) return;
    const next = new Set(collapsedIds);
    for (const id of ancestors) next.delete(id);
    saveSet(COLLAPSED_KEY, next);
    setCollapsedIds(next);
  }, [selectedNodeId, activeRows, collapsedIds]);

  function updateCollapsed(next: Set<string>) {
    saveSet(COLLAPSED_KEY, next);
    setCollapsedIds(next);
  }

  function toggleCollapse(nodeId: string) {
    const next = new Set(collapsedIds);
    if (next.has(nodeId)) next.delete(nodeId);
    else next.add(nodeId);
    updateCollapsed(next);
  }

  /** Replie (ou déplie) tous les nœuds du projet actif, racines d’écran exceptées. */
  function setAllCollapsed(collapse: boolean) {
    const next = new Set(collapsedIds);
    for (const r of activeRows) {
      if (!r.hasChildren || r.parentId === null) continue;
      if (collapse) next.add(r.id);
      else next.delete(r.id);
    }
    updateCollapsed(next);
  }

  function toggleProject(key: string) {
    const next = new Set(collapsedProjects);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    saveSet(PROJECTS_COLLAPSED_KEY, next);
    setCollapsedProjects(next);
  }

  /** Un clic dans un autre projet le rend d’abord actif. */
  function activate(p: OpenProject) {
    if (!p.active) switchProject(p.id);
  }

  function navigateTree(key: string) {
    if (!selectedNodeId || visibleNodeRows.length === 0) return;
    const idx = visibleNodeRows.findIndex((r) => r.id === selectedNodeId);
    if (idx < 0) return;
    const current = visibleNodeRows[idx]!;
    if (key === "ArrowDown") {
      const next = visibleNodeRows[idx + 1];
      if (next) setSelection(next.screenId, next.id);
      return;
    }
    if (key === "ArrowUp") {
      const prev = visibleNodeRows[idx - 1];
      if (prev) setSelection(prev.screenId, prev.id);
      return;
    }
    if (key === "ArrowLeft") {
      if (current.hasChildren && !collapsedIds.has(current.id)) {
        toggleCollapse(current.id);
        return;
      }
      if (current.parentId) setSelection(current.screenId, current.parentId);
      return;
    }
    if (key === "ArrowRight") {
      if (current.hasChildren && collapsedIds.has(current.id)) {
        toggleCollapse(current.id);
        return;
      }
      const child = visibleNodeRows.find((r, i) => i > idx && r.parentId === current.id);
      if (child) setSelection(child.screenId, child.id);
    }
  }

  if (projects.length === 0) {
    return (
      <div className="tree-panel">
        <div className="tree-empty">{t("tree.noProject")}</div>
      </div>
    );
  }

  const selected = selectedNodeId ? activeRows.find((r) => r.id === selectedNodeId) : null;

  function addType(type: string) {
    const parentId = selectedNodeId ?? useProjectStore.getState().project?.screens[0]?.root.id;
    if (!parentId) return;
    insertChild(parentId, type);
  }

  const screenSelected = selectedScreenId != null && selectedNodeId == null;

  const renderRow = (p: OpenProject, row: FlatRow) => (
    <NodeRow
      key={row.id}
      row={row}
      selected={p.active && selectedNodeId === row.id}
      collapsed={collapsedIds.has(row.id)}
      renaming={renamingId === row.id}
      onSelect={() => {
        activate(p);
        setSelection(row.screenId, row.id);
        scrollRef.current?.focus();
      }}
      onToggleCollapse={() => toggleCollapse(row.id)}
      onCommitRename={(name) => {
        const trimmed = name.trim();
        if (trimmed && trimmed !== (row.node.name ?? row.node.type)) renameNode(row.id, trimmed);
        else if (trimmed && !row.node.name) renameNode(row.id, trimmed);
        setRenamingId(null);
      }}
      onCancelRename={() => setRenamingId(null)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        activate(p);
        setSelection(row.screenId, row.id);
        setMenuTargets({ nodeId: row.id, screenId: row.screenId });
        const warnings = validationIssues()
          .filter((i) => i.nodeId === row.id)
          .map((i) => i.message);
        ctxMenu.open(e, nodeContextMenuItems({ warnings }));
      }}
    />
  );

  return (
    <div
      className="tree-panel"
      onContextMenu={(e) => {
        if ((e.target as Element).closest(".tree-node, .tree-screen-label, .tree-project")) return;
        setMenuTargets({});
        ctxMenu.open(e, treeBackgroundMenuItems());
      }}
    >
      <div className="tree-panel-toolbar">
        <button type="button" onClick={() => addType("BoxLayout")}>
          + BoxLayout
        </button>
        <button type="button" onClick={() => addType("TextView")}>
          + TextView
        </button>
        <button
          type="button"
          disabled={!selected || selected.parentId === null}
          onClick={() => selectedNodeId && deleteNode(selectedNodeId)}
        >
          {t("tree.delete")}
        </button>
        <span className="tree-toolbar-spacer" />
        <button type="button" title={t("tree.collapseAll")} onClick={() => setAllCollapsed(true)}>
          <ChevronsDownUp size={14} />
        </button>
        <button type="button" title={t("tree.expandAll")} onClick={() => setAllCollapsed(false)}>
          <ChevronsUpDown size={14} />
        </button>
      </div>
      {lastDropError ? (
        <div className="tree-drop-error" role="alert">
          {lastDropError}
          <button type="button" style={{ marginLeft: 8 }} onClick={clearDropError}>
            OK
          </button>
        </div>
      ) : null}
      <div
        ref={scrollRef}
        className="tree-scroll"
        tabIndex={0}
        onClick={(e) => {
          // Clic dans le vide de l’arbre : tout désélectionner, inspecteur vide.
          if ((e.target as Element).closest(".tree-node, .tree-screen-label, .tree-project, button, input")) {
            return;
          }
          useProjectStore.getState().clearSelection();
        }}
        onKeyDown={(e) => {
          if (renamingId) return;
          if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            navigateTree(e.key);
          }
        }}
      >
        {blocks.map((p) => {
          const key = p.path ?? p.id;
          const folded = collapsedProjects.has(key);
          return (
            <div key={p.id} className={`tree-project-block${p.active ? " active" : ""}`}>
              <div
                className={`tree-project${p.active ? " active" : ""}`}
                title={p.path ?? t("tree.unsavedProject")}
                onClick={() => activate(p)}
              >
                <button
                  type="button"
                  className="tree-node-chevron-btn"
                  aria-expanded={!folded}
                  aria-label={folded ? t("tree.expandProject") : t("tree.collapseProject")}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleProject(key);
                  }}
                >
                  <ChevronRight size={12} className={`tree-slot-chevron${folded ? "" : " open"}`} aria-hidden />
                </button>
                <FileJson size={13} className="tree-node-icon" aria-hidden />
                <span className="tree-project-name">{projectLabel(p.path)}</span>
                {p.dirty ? (
                  <span className="tree-project-dirty" title={t("tree.dirty")}>
                    ●
                  </span>
                ) : null}
              </div>
              {folded
                ? null
                : p.screens.map(({ screen, rows }) => (
                    <div key={screen.id} className="tree-screen">
                      <div
                        className={`tree-screen-label${
                          p.active && screenSelected && selectedScreenId === screen.id ? " selected" : ""
                        }`}
                        onClick={() => {
                          activate(p);
                          setSelection(screen.id, null);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          activate(p);
                          setSelection(screen.id, null);
                          setMenuTargets({ screenId: screen.id });
                          ctxMenu.open(e, screenHeaderMenuItems());
                        }}
                      >
                        {screen.recipeName} <span className="tree-screen-kind">{screen.kind}</span>
                        {p.active && selectedScreenId === screen.id ? " ·" : ""}
                      </div>
                      {filterCollapsedRows(rows, collapsedIds).map((row) => renderRow(p, row))}
                    </div>
                  ))}
            </div>
          );
        })}
      </div>
      {ctxMenu.menu ? (
        <ContextMenu
          x={ctxMenu.menu.x}
          y={ctxMenu.menu.y}
          doc={ctxMenu.menu.doc}
          items={ctxMenu.menu.items}
          ctx={withCommandTargets({
            targetNodeId: menuTargets.nodeId,
            targetScreenId: menuTargets.screenId,
          })}
          onClose={ctxMenu.close}
        />
      ) : null}
    </div>
  );
}
