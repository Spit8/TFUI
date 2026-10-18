import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { getClipboardNode } from "../model/clipboard";
import {
  copyElementRulesToNewSubtree,
  migrateInlineStyles,
  pruneElementRules,
  setElementStyleValue,
  type StyleState,
} from "../model/elementStyle";
import { createEmptyProject, createNode, createStarterNode, nextChildValue, VALUED_CHILD_TYPES } from "../model/factory";
import { tfuiProjectSchema } from "../model/schema";
import {
  addScreen as addScreenOp,
  duplicateScreen as duplicateScreenOp,
  removeScreen as removeScreenOp,
  updateScreenMeta as updateScreenMetaOp,
} from "../model/screenOps";
import { migrateProjectSlots, primaryInsertSlot, violatesSlotLayoutRule } from "../model/slots";
import {
  canDrop,
  canPlaceType,
  copyNodeToClipboard as copyNodeOp,
  deleteNode as deleteNodeOp,
  duplicateNode as duplicateNodeOp,
  findNode,
  getNodeById,
  insertNode as insertNodeOp,
  moveDown as moveDownOp,
  moveNode as moveNodeOp,
  moveUp as moveUpOp,
  outdentNode as outdentNodeOp,
  pasteClipboardNode as pasteNodeOp,
  renameNode as renameNodeOp,
  setNodeMeta as setNodeMetaOp,
  setNodeProp as setNodePropOp,
  toggleNodeHidden as toggleNodeHiddenOp,
  toggleNodeLocked as toggleNodeLockedOp,
  unsetNodeProp as unsetNodePropOp,
  unwrapNode as unwrapNodeOp,
  wrapNode as wrapNodeOp,
} from "../model/treeOps";
import type {
  PropValue,
  Screen,
  ScreenPlugin,
  StateVar,
  StyleRule,
  TfuiProject,
  UiNode,
  UiNodeMeta,
  ValidationIssue,
} from "../model/types";
import { createId } from "../model/uuid";
import { validateProject } from "../model/validate";
import {
  pushUndo,
  redoOnce,
  undoOnce,
  type UndoCoalesceMeta,
  type UndoStacks,
} from "./undoStack";
import { t, translateKey } from "../i18n";

export type StateSimValue = string | number | boolean | null;

/**
 * Projet ouvert (multi-projets). Les champs du projet actif vivent au premier
 * niveau du store (`project`, `selectedNodeId`…) ; une session les garde pour
 * les projets inactifs (instantané pris au changement de projet).
 */
export interface ProjectSession {
  id: string;
  project: TfuiProject;
  projectPath: string | null;
  selectedNodeId: string | null;
  selectedScreenId: string | null;
  screenInspected: boolean;
  stateSim: Record<string, Record<string, StateSimValue>>;
  dirty: boolean;
  savedProject: TfuiProject | null;
  history: UndoStacks;
}

interface ProjectState {
  project: TfuiProject | null;
  projectPath: string | null;
  selectedNodeId: string | null;
  selectedScreenId: string | null;
  /**
   * Écran choisi lui-même (inspecteur d’écran). Faux après « tout
   * désélectionner » : l’écran reste affiché dans l’aperçu, l’inspecteur est vide.
   */
  screenInspected: boolean;
  /**
   * Éléments ciblés par la classe partagée cliquée : multi-sélection en
   * lecture seule (contour Box), inspecteur vide.
   */
  highlightedNodeIds: string[];
  hoveredNodeId: string | null;
  stateSim: Record<string, Record<string, StateSimValue>>;
  /** Vrai si `project` diffère de l’état enregistré (`savedProject`). */
  dirty: boolean;
  /** Instantané enregistré / chargé : un undo jusqu’à lui efface « modifié ». */
  savedProject: TfuiProject | null;
  lastDropError: string | null;
  history: UndoStacks;
  /** Projets ouverts, dans l’ordre (celui de `activeSessionId` : voir champs ci-dessus). */
  sessions: ProjectSession[];
  activeSessionId: string | null;

  newProject: (catalogHash?: string) => void;
  /** Ferme le projet actif ; un autre projet ouvert devient actif. */
  closeProject: () => void;
  /** Rend actif un projet ouvert. */
  switchProject: (sessionId: string) => void;
  setProject: (project: TfuiProject, path?: string | null) => void;
  loadFromJson: (
    json: string,
    path: string,
  ) => { ok: true } | { ok: false; error: string };
  markSaved: (path: string) => void;

  setSelection: (screenId: string | null, nodeId: string | null) => void;
  /** Désélectionne tout (clic sur le fond) : inspecteur vide. */
  clearSelection: () => void;
  /** Met en surbrillance les éléments d’une classe (vide la sélection). */
  highlightNodes: (nodeIds: string[]) => void;
  addScreen: (kind: Screen["kind"]) => void;
  duplicateScreen: (screenId?: string | null) => void;
  deleteScreen: (screenId?: string | null) => void;
  updateScreenMeta: (
    screenId: string,
    patch: Partial<{
      recipeName: string;
      fileBase: string;
      kind: Screen["kind"];
      plugin: Partial<ScreenPlugin> | null;
      previewViewport: { w: number; h: number };
    }>,
  ) => void;
  setHovered: (nodeId: string | null) => void;
  setStateSim: (
    screenId: string,
    name: string,
    value: StateSimValue,
  ) => void;
  clearStateSim: (screenId?: string) => void;
  clearDropError: () => void;

  insertChild: (
    parentId: string,
    type: string,
    slot?: string,
    index?: number,
    /** Props initiales (ex. `path` d’un ImageView créé depuis une icône du jeu). */
    props?: Record<string, PropValue>,
    /** Préréglage de la palette (`palettePresets.ts`, ex. espaceur). */
    presetId?: string,
  ) => boolean;
  moveNode: (
    draggedId: string,
    targetParentId: string,
    slot: string,
    index: number,
  ) => boolean;
  deleteSelected: () => void;
  deleteNode: (nodeId: string) => void;
  duplicateSelected: () => void;
  wrapSelected: (wrapperType: string) => void;
  moveSelectedUp: () => void;
  moveSelectedDown: () => void;
  outdentSelected: () => void;
  unwrapSelected: () => void;
  copySelected: () => void;
  pasteAtSelection: () => void;
  renameNode: (nodeId: string, name: string) => void;
  toggleNodeHidden: (nodeId: string) => void;
  toggleNodeLocked: (nodeId: string) => void;
  setProp: (nodeId: string, key: string, value: PropValue) => void;
  unsetProp: (nodeId: string, key: string) => void;
  setMeta: (nodeId: string, meta: Partial<UiNodeMeta>) => void;
  setModInfo: (patch: {
    modId?: string;
    modRoot?: string;
    guiDir?: string;
  }) => void;
  setLastWrittenFiles: (files: string[]) => void;
  /**
   * Style par élément : pose (ou retire, `value` undefined) une propriété de
   * la règle propre au nœud pour l’état donné (null = Normal).
   */
  setNodeStyle: (
    nodeId: string,
    state: StyleState | null,
    key: string,
    value: unknown,
  ) => void;
  setScreenState: (screenId: string, state: StateVar[]) => void;
  addStateVar: (screenId: string, variable?: Partial<StateVar>) => void;
  updateStateVar: (
    screenId: string,
    index: number,
    patch: Partial<StateVar>,
  ) => void;
  removeStateVar: (screenId: string, index: number) => void;
  addStyleRule: (rule?: Partial<StyleRule>) => void;
  updateStyleRule: (id: string, patch: Partial<StyleRule>) => void;
  removeStyleRule: (id: string) => void;
  reorderStyleRules: (fromIndex: number, toIndex: number) => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  validationIssues: () => ValidationIssue[];
}

function commitProject(
  set: (fn: (s: ProjectState) => void) => void,
  get: () => ProjectState,
  next: TfuiProject,
  coalesce?: UndoCoalesceMeta,
): void {
  const { project: current, savedProject } = get();
  // Un nœud supprimé emporte ses règles de style d’élément.
  next = pruneElementRules(next);
  if (!current) {
    set((s) => {
      s.project = next;
      s.dirty = next !== savedProject;
    });
    return;
  }
  if (current === next) return;
  set((s) => {
    s.history = pushUndo(s.history, current, coalesce);
    s.project = next;
    s.dirty = next !== savedProject;
    s.lastDropError = null;
  });
}

/** Donne au sous-arbre copié (dupliquer / coller) les styles d’élément de la source. */
function withCopiedStyles(
  before: TfuiProject,
  result: { ok: true; project: TfuiProject } | { ok: false; reason: string },
  source: UiNode | undefined,
): { ok: true; project: TfuiProject } | { ok: false; reason: string } {
  if (!result.ok || !source) return result;
  return {
    ok: true,
    project: copyElementRulesToNewSubtree(before, result.project, source, createId),
  };
}

function applyTreeResult(
  set: (fn: (s: ProjectState) => void) => void,
  get: () => ProjectState,
  result: { ok: true; project: TfuiProject } | { ok: false; reason: string },
): void {
  if (!result.ok) {
    set((s) => {
      s.lastDropError = result.reason;
    });
    return;
  }
  commitProject(set, get, result.project);
}

type Draft = ProjectState;

/** Range les champs du projet actif dans sa session. */
function stashActive(s: Draft): void {
  if (!s.project || !s.activeSessionId) return;
  const index = s.sessions.findIndex((x) => x.id === s.activeSessionId);
  if (index < 0) return;
  s.sessions[index] = {
    id: s.activeSessionId,
    project: s.project,
    projectPath: s.projectPath,
    selectedNodeId: s.selectedNodeId,
    selectedScreenId: s.selectedScreenId,
    screenInspected: s.screenInspected,
    stateSim: s.stateSim,
    dirty: s.dirty,
    savedProject: s.savedProject,
    history: s.history,
  };
}

/** Charge une session dans les champs du projet actif. */
function loadSession(s: Draft, session: ProjectSession): void {
  s.activeSessionId = session.id;
  s.project = session.project;
  s.projectPath = session.projectPath;
  s.selectedNodeId = session.selectedNodeId;
  s.selectedScreenId = session.selectedScreenId;
  s.screenInspected = session.screenInspected;
  s.stateSim = session.stateSim;
  s.dirty = session.dirty;
  s.savedProject = session.savedProject;
  s.history = session.history;
  s.highlightedNodeIds = [];
  s.hoveredNodeId = null;
  s.lastDropError = null;
}

/** Plus aucun projet ouvert. */
function resetActive(s: Draft): void {
  s.activeSessionId = null;
  s.project = null;
  s.projectPath = null;
  s.selectedScreenId = null;
  s.screenInspected = true;
  s.selectedNodeId = null;
  s.highlightedNodeIds = [];
  s.hoveredNodeId = null;
  s.stateSim = {};
  s.dirty = false;
  s.savedProject = null;
  s.lastDropError = null;
  s.history = { undo: [], redo: [] };
}

/** Ouvre un projet dans une nouvelle session, qui devient active. */
function openSession(s: Draft, project: TfuiProject, path: string | null): void {
  stashActive(s);
  const session: ProjectSession = {
    id: createId(),
    project,
    projectPath: path,
    selectedNodeId: project.screens[0]?.root.id ?? null,
    selectedScreenId: project.screens[0]?.id ?? null,
    screenInspected: true,
    stateSim: {},
    dirty: false,
    savedProject: project,
    history: { undo: [], redo: [] },
  };
  s.sessions.push(session);
  loadSession(s, session);
}

export const useProjectStore = create<ProjectState>()(
  immer((set, get) => ({
    project: null,
    projectPath: null,
    selectedNodeId: null,
    selectedScreenId: null,
    screenInspected: true,
    highlightedNodeIds: [],
    hoveredNodeId: null,
    stateSim: {},
    dirty: false,
    savedProject: null,
    lastDropError: null,
    history: { undo: [], redo: [] },
    sessions: [],
    activeSessionId: null,

    newProject: (catalogHash = "") => {
      const project = createEmptyProject({ catalogHash });
      set((s) => {
        openSession(s, project, null);
      });
    },

    closeProject: () => {
      set((s) => {
        const index = s.sessions.findIndex((x) => x.id === s.activeSessionId);
        if (index >= 0) s.sessions.splice(index, 1);
        const next = s.sessions[Math.min(Math.max(index, 0), s.sessions.length - 1)];
        if (next) loadSession(s, next);
        else resetActive(s);
      });
    },

    switchProject: (sessionId) => {
      set((s) => {
        if (sessionId === s.activeSessionId) return;
        const target = s.sessions.find((x) => x.id === sessionId);
        if (!target) return;
        stashActive(s);
        loadSession(s, target);
      });
    },

    addScreen: (kind) => {
      const project = get().project;
      if (!project) return;
      const result = addScreenOp(project, kind);
      if (!result.ok) {
        set((s) => {
          s.lastDropError = result.reason;
        });
        return;
      }
      commitProject(set, get, result.project);
      set((s) => {
        s.selectedScreenId = result.screenId;
        s.screenInspected = true;
        s.selectedNodeId = null;
        s.highlightedNodeIds = [];
      });
    },

    duplicateScreen: (screenId) => {
      const project = get().project;
      const id = screenId ?? get().selectedScreenId;
      if (!project || !id) return;
      const result = duplicateScreenOp(project, id);
      if (!result.ok) {
        set((s) => {
          s.lastDropError = result.reason;
        });
        return;
      }
      const sourceRoot = project.screens.find((sc) => sc.id === id)?.root;
      commitProject(
        set,
        get,
        sourceRoot
          ? copyElementRulesToNewSubtree(project, result.project, sourceRoot, createId)
          : result.project,
      );
      set((s) => {
        s.selectedScreenId = result.screenId;
        s.screenInspected = true;
        s.selectedNodeId = null;
        s.highlightedNodeIds = [];
      });
    },

    deleteScreen: (screenId) => {
      const project = get().project;
      const id = screenId ?? get().selectedScreenId;
      if (!project || !id) return;
      const result = removeScreenOp(project, id);
      if (!result.ok) {
        set((s) => {
          s.lastDropError = result.reason;
        });
        return;
      }
      commitProject(set, get, result.project);
      set((s) => {
        s.selectedScreenId = result.screenId;
        s.screenInspected = true;
        s.selectedNodeId =
          result.project.screens.find((sc) => sc.id === result.screenId)?.root
            .id ?? null;
        s.highlightedNodeIds = [];
      });
    },

    updateScreenMeta: (screenId, patch) => {
      const project = get().project;
      if (!project) return;
      const result = updateScreenMetaOp(project, screenId, patch);
      if (!result.ok) {
        set((s) => {
          s.lastDropError = result.reason;
        });
        return;
      }
      commitProject(set, get, result.project);
    },

    setProject: (project, path = null) => {
      const migrated = migrateInlineStyles(
        migrateProjectSlots(project).project,
        createId,
      );
      set((s) => {
        // Déjà ouvert : on y bascule simplement.
        const already = path ? s.sessions.find((x) => x.projectPath === path) : undefined;
        if (already) {
          if (already.id !== s.activeSessionId) {
            stashActive(s);
            loadSession(s, already);
          }
          return;
        }
        openSession(s, migrated, path);
      });
    },

    loadFromJson: (json, path) => {
      try {
        const raw: unknown = JSON.parse(json);
        const parsed = tfuiProjectSchema.safeParse(raw);
        if (!parsed.success) {
          return {
            ok: false,
            error: parsed.error.issues.map((i) => i.message).join("; "),
          };
        }
        get().setProject(parsed.data as TfuiProject, path);
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : t("store.invalidJson"),
        };
      }
    },

    markSaved: (path) => {
      const saved = get().project;
      set((s) => {
        s.projectPath = path;
        s.savedProject = saved;
        s.dirty = false;
      });
    },

    setSelection: (screenId, nodeId) => {
      set((s) => {
        s.selectedScreenId = screenId;
        s.selectedNodeId = nodeId;
        s.screenInspected = true;
        s.highlightedNodeIds = [];
      });
    },

    clearSelection: () => {
      set((s) => {
        s.selectedNodeId = null;
        s.screenInspected = false;
        s.highlightedNodeIds = [];
      });
    },

    highlightNodes: (nodeIds) => {
      set((s) => {
        s.selectedNodeId = null;
        s.screenInspected = false;
        s.highlightedNodeIds = nodeIds;
      });
    },

    setHovered: (nodeId) => {
      set((s) => {
        s.hoveredNodeId = nodeId;
      });
    },

    setStateSim: (screenId, name, value) => {
      set((s) => {
        if (!s.stateSim[screenId]) s.stateSim[screenId] = {};
        s.stateSim[screenId][name] = value;
      });
    },

    clearStateSim: (screenId) => {
      set((s) => {
        if (screenId) {
          delete s.stateSim[screenId];
        } else {
          s.stateSim = {};
        }
      });
    },

    clearDropError: () => {
      set((s) => {
        s.lastDropError = null;
      });
    },

    insertChild: (parentId, type, slot, index, props, presetId) => {
      const { project } = get();
      if (!project) return false;
      const loc = findNode(project, parentId);
      if (!loc) return false;
      const screen = project.screens.find((s) => s.id === loc.screenId);
      if (!screen) return false;
      const parent = getNodeById(screen.root, parentId);
      if (!parent) return false;
      const targetSlot = slot ?? primaryInsertSlot(parent.type);
      if (!targetSlot) {
        set((s) => {
          s.lastDropError = t("store.noChildSlot", { type: parent.type });
        });
        return false;
      }
      // Layout déposé là où le moteur le refuse (item d’onglet, cellule,
      // contenu de ScrollArea) : enveloppé dans un Component, comme le vanilla
      // (`item = builtin.Component{ layout = … }`).
      const wrapInComponent = violatesSlotLayoutRule(parent.type, targetSlot, type) === "notLayout";
      const place = canPlaceType(
        parent.type,
        targetSlot,
        wrapInComponent ? "Component" : type,
        parent.slots,
      );
      if (!place.ok) {
        set((s) => {
          s.lastDropError = place.reason;
        });
        return false;
      }
      // Élément prêt à l’emploi (bouton : TextView « Bouton » + styles), en
      // une seule action annulable.
      const presetName = presetId ? translateKey(`palette.presets.${presetId}.name`) : undefined;
      const { node, styles } = createStarterNode(type, undefined, props, presetId, presetName);
      if (VALUED_CHILD_TYPES.has(type) && !node.props.value) {
        node.props.value = { kind: "literal", value: nextChildValue(parent.slots[targetSlot] ?? []) };
      }
      let inserted = node;
      if (wrapInComponent) {
        inserted = createNode("Component");
        inserted.slots.layout = [node];
      }
      let next = insertNodeOp(
        project,
        loc.screenId,
        parentId,
        targetSlot,
        inserted,
        index,
      );
      for (const st of styles) {
        next = setElementStyleValue(next, st.nodeId, null, st.key, st.value, createId);
      }
      commitProject(set, get, next);
      set((s) => {
        s.selectedNodeId = node.id;
        s.highlightedNodeIds = [];
        s.selectedScreenId = loc.screenId;
        s.screenInspected = true;
      });
      return true;
    },

    moveNode: (draggedId, targetParentId, slot, index) => {
      const { project } = get();
      if (!project) return false;
      const loc = findNode(project, draggedId);
      if (!loc) return false;
      const check = canDrop(
        project,
        draggedId,
        targetParentId,
        slot,
        loc.screenId,
      );
      if (!check.ok) {
        set((s) => {
          s.lastDropError = check.reason;
        });
        return false;
      }
      const next = moveNodeOp(
        project,
        draggedId,
        targetParentId,
        slot,
        index,
      );
      if (next === project) return false;
      commitProject(set, get, next);
      return true;
    },

    deleteSelected: () => {
      const { selectedNodeId } = get();
      if (selectedNodeId) get().deleteNode(selectedNodeId);
    },

    deleteNode: (nodeId) => {
      const { project } = get();
      if (!project) return;
      const loc = findNode(project, nodeId);
      if (!loc || loc.parentId === null) return;
      const next = deleteNodeOp(project, nodeId);
      commitProject(set, get, next);
      set((s) => {
        s.selectedNodeId = loc.parentId;
        s.highlightedNodeIds = [];
      });
    },

    duplicateSelected: () => {
      const { project, selectedNodeId } = get();
      if (!project || !selectedNodeId) return;
      const source = findNode(project, selectedNodeId)?.node;
      applyTreeResult(
        set,
        get,
        withCopiedStyles(project, duplicateNodeOp(project, selectedNodeId), source),
      );
    },

    wrapSelected: (wrapperType) => {
      const { project, selectedNodeId } = get();
      if (!project || !selectedNodeId) return;
      applyTreeResult(set, get, wrapNodeOp(project, selectedNodeId, wrapperType));
    },

    moveSelectedUp: () => {
      const { project, selectedNodeId } = get();
      if (!project || !selectedNodeId) return;
      applyTreeResult(set, get, moveUpOp(project, selectedNodeId));
    },

    moveSelectedDown: () => {
      const { project, selectedNodeId } = get();
      if (!project || !selectedNodeId) return;
      applyTreeResult(set, get, moveDownOp(project, selectedNodeId));
    },

    outdentSelected: () => {
      const { project, selectedNodeId } = get();
      if (!project || !selectedNodeId) return;
      applyTreeResult(set, get, outdentNodeOp(project, selectedNodeId));
    },

    unwrapSelected: () => {
      const { project, selectedNodeId } = get();
      if (!project || !selectedNodeId) return;
      applyTreeResult(set, get, unwrapNodeOp(project, selectedNodeId));
    },

    copySelected: () => {
      const { project, selectedNodeId } = get();
      if (!project || !selectedNodeId) return;
      const result = copyNodeOp(project, selectedNodeId);
      if (!result.ok) {
        set((s) => {
          s.lastDropError = result.reason;
        });
      }
    },

    pasteAtSelection: () => {
      const { project, selectedNodeId } = get();
      if (!project || !selectedNodeId) return;
      applyTreeResult(
        set,
        get,
        withCopiedStyles(
          project,
          pasteNodeOp(project, selectedNodeId),
          getClipboardNode() ?? undefined,
        ),
      );
    },

    renameNode: (nodeId, name) => {
      const { project } = get();
      if (!project) return;
      commitProject(set, get, renameNodeOp(project, nodeId, name));
    },

    toggleNodeHidden: (nodeId) => {
      const { project } = get();
      if (!project) return;
      commitProject(set, get, toggleNodeHiddenOp(project, nodeId));
    },

    toggleNodeLocked: (nodeId) => {
      const { project } = get();
      if (!project) return;
      commitProject(set, get, toggleNodeLockedOp(project, nodeId));
    },

    setProp: (nodeId, key, value) => {
      const { project } = get();
      if (!project) return;
      commitProject(set, get, setNodePropOp(project, nodeId, key, value), {
        coalesceKey: `${nodeId}:${key}`,
        at: Date.now(),
      });
    },

    unsetProp: (nodeId, key) => {
      const { project } = get();
      if (!project) return;
      const next = unsetNodePropOp(project, nodeId, key);
      if (next === project) return;
      commitProject(set, get, next, {
        coalesceKey: `${nodeId}:${key}`,
        at: Date.now(),
      });
    },

    setLastWrittenFiles: (files) => {
      set((s) => {
        if (!s.project) return;
        s.project.lastWrittenFiles = files;
        s.dirty = true;
      });
    },

    setModInfo: (patch) => {
      const { project } = get();
      if (!project) return;
      commitProject(set, get, {
        ...project,
        mod: {
          ...project.mod,
          ...(patch.modId !== undefined ? { modId: patch.modId } : {}),
          ...(patch.modRoot !== undefined ? { modRoot: patch.modRoot } : {}),
          ...(patch.guiDir !== undefined ? { guiDir: patch.guiDir } : {}),
        },
      });
    },

    setMeta: (nodeId, meta) => {
      const { project } = get();
      if (!project) return;
      commitProject(set, get, setNodeMetaOp(project, nodeId, meta));
    },

    setNodeStyle: (nodeId, state, key, value) => {
      const { project } = get();
      if (!project) return;
      commitProject(
        set,
        get,
        setElementStyleValue(project, nodeId, state, key, value, createId),
        { coalesceKey: `style:${nodeId}:${state ?? "normal"}:${key}`, at: Date.now() },
      );
    },

    setScreenState: (screenId, state) => {
      const { project } = get();
      if (!project) return;
      const next: TfuiProject = {
        ...project,
        screens: project.screens.map((s) =>
          s.id === screenId ? { ...s, state } : s,
        ),
      };
      commitProject(set, get, next);
    },

    addStateVar: (screenId, variable = {}) => {
      const { project } = get();
      if (!project) return;
      const screen = project.screens.find((s) => s.id === screenId);
      if (!screen) return;
      const entry: StateVar = {
        name: variable.name ?? `state${screen.state.length + 1}`,
        initial: variable.initial ?? "",
      };
      get().setScreenState(screenId, [...screen.state, entry]);
    },

    updateStateVar: (screenId, index, patch) => {
      const { project } = get();
      if (!project) return;
      const screen = project.screens.find((s) => s.id === screenId);
      if (!screen || index < 0 || index >= screen.state.length) return;
      const state = screen.state.map((v, i) =>
        i === index ? { ...v, ...patch } : v,
      );
      get().setScreenState(screenId, state);
    },

    removeStateVar: (screenId, index) => {
      const { project } = get();
      if (!project) return;
      const screen = project.screens.find((s) => s.id === screenId);
      if (!screen) return;
      get().setScreenState(
        screenId,
        screen.state.filter((_, i) => i !== index),
      );
    },

    addStyleRule: (rule = {}) => {
      const { project } = get();
      if (!project) return;
      const next: TfuiProject = {
        ...project,
        styleRules: [
          ...project.styleRules,
          {
            id: createId(),
            selector: rule.selector ?? "",
            props: rule.props ?? {},
            comment: rule.comment,
          },
        ],
      };
      commitProject(set, get, next);
    },

    updateStyleRule: (id, patch) => {
      const { project } = get();
      if (!project) return;
      const next: TfuiProject = {
        ...project,
        styleRules: project.styleRules.map((r) =>
          r.id === id
            ? {
                ...r,
                ...patch,
                props:
                  patch.props !== undefined
                    ? patch.props
                    : r.props,
              }
            : r,
        ),
      };
      commitProject(set, get, next);
    },

    removeStyleRule: (id) => {
      const { project } = get();
      if (!project) return;
      commitProject(set, get, {
        ...project,
        styleRules: project.styleRules.filter((r) => r.id !== id),
      });
    },

    reorderStyleRules: (fromIndex, toIndex) => {
      const { project } = get();
      if (!project) return;
      const rules = [...project.styleRules];
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= rules.length ||
        toIndex >= rules.length ||
        fromIndex === toIndex
      ) {
        return;
      }
      const [item] = rules.splice(fromIndex, 1);
      rules.splice(toIndex, 0, item);
      commitProject(set, get, { ...project, styleRules: rules });
    },

    undo: () => {
      const { project, history } = get();
      if (!project) return;
      const result = undoOnce(history, project);
      if (!result) return;
      const saved = get().savedProject;
      set((s) => {
        s.project = result.project;
        s.history = result.stacks;
        s.dirty = result.project !== saved;
      });
    },

    redo: () => {
      const { project, history } = get();
      if (!project) return;
      const result = redoOnce(history, project);
      if (!result) return;
      const saved = get().savedProject;
      set((s) => {
        s.project = result.project;
        s.history = result.stacks;
        s.dirty = result.project !== saved;
      });
    },

    canUndo: () => get().history.undo.length > 0,
    canRedo: () => get().history.redo.length > 0,

    validationIssues: () => {
      const { project } = get();
      return project ? validateProject(project) : [];
    },
  })),
);
