import { produce } from "immer";
import type { Catalog } from "../catalog/types";
import { getActiveCatalog } from "../catalog/activeCatalog";
import { getClipboardNode, setClipboardNode } from "./clipboard";
import {
  isMultiSlot,
  PARENT_CHILD_RULES,
  isLockedSlot,
  primaryInsertSlot,
  violatesSlotLayoutRule,
} from "./slots";
import type { Screen, TfuiProject, UiNode } from "./types";
import { createId } from "./uuid";
import { t } from "../i18n";

function catalogOrActive(catalog?: Catalog | null): Catalog | null {
  return catalog ?? getActiveCatalog();
}

export interface NodeLocation {
  screenId: string;
  parentId: string | null;
  slot: string | null;
  index: number;
  node: UiNode;
}

export function findNode(
  project: TfuiProject,
  nodeId: string,
): NodeLocation | null {
  for (const screen of project.screens) {
    if (screen.root.id === nodeId) {
      return {
        screenId: screen.id,
        parentId: null,
        slot: null,
        index: 0,
        node: screen.root,
      };
    }
    const found = findInNode(screen.root, nodeId, screen.id);
    if (found) return found;
  }
  return null;
}

function findInNode(
  parent: UiNode,
  nodeId: string,
  screenId: string,
): NodeLocation | null {
  for (const [slot, children] of Object.entries(parent.slots)) {
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.id === nodeId) {
        return {
          screenId,
          parentId: parent.id,
          slot,
          index: i,
          node: child,
        };
      }
      const nested = findInNode(child, nodeId, screenId);
      if (nested) return nested;
    }
  }
  return null;
}

export function getScreen(
  project: TfuiProject,
  screenId: string,
): Screen | undefined {
  return project.screens.find((s) => s.id === screenId);
}

export function getNodeById(root: UiNode, id: string): UiNode | null {
  if (root.id === id) return root;
  for (const children of Object.values(root.slots)) {
    for (const child of children) {
      const found = getNodeById(child, id);
      if (found) return found;
    }
  }
  return null;
}

function isDescendant(root: UiNode, ancestorId: string, maybeDescendantId: string): boolean {
  if (ancestorId === maybeDescendantId) return true;
  const ancestor = getNodeById(root, ancestorId);
  if (!ancestor) return false;
  return getNodeById(ancestor, maybeDescendantId) !== null;
}

/** Check whether a node of `nodeType` can be placed under parent/slot. */
export function canPlaceType(
  parentType: string,
  slot: string,
  nodeType: string,
  parentSlots: Record<string, UiNode[]>,
  excludeNodeId?: string,
  catalog?: Catalog | null,
): { ok: true } | { ok: false; reason: string } {
  if (nodeType === "Window") {
    return { ok: false, reason: t("ops.windowRootOnly") };
  }

  const requiredParent = PARENT_CHILD_RULES[nodeType];
  if (requiredParent && parentType !== requiredParent) {
    return {
      ok: false,
      reason: t("ops.mustBeUnder", { type: nodeType, parent: requiredParent }),
    };
  }

  if (isLockedSlot(parentType, slot)) {
    return { ok: false, reason: t("ops.slotLocked", { parent: parentType, slot }) };
  }

  const layoutRule = violatesSlotLayoutRule(parentType, slot, nodeType);
  if (layoutRule) {
    return {
      ok: false,
      reason: t(layoutRule === "layout" ? "ops.slotNeedsLayout" : "ops.slotRefusesLayout", {
        parent: parentType,
        slot,
        type: nodeType,
      }),
    };
  }

  if (!isMultiSlot(parentType, slot, catalogOrActive(catalog))) {
    const existing = (parentSlots[slot] ?? []).filter((n) => n.id !== excludeNodeId);
    if (existing.length >= 1) {
      return {
        ok: false,
        reason: t("ops.singleChildSlot", { slot }),
      };
    }
  }

  if (parentType === "BoxLayout") {
    const children = (parentSlots.children ?? []).filter((n) => n.id !== excludeNodeId);
    const child = (parentSlots.child ?? []).filter((n) => n.id !== excludeNodeId);
    if (slot === "children" && child.length > 0) {
      return {
        ok: false,
        reason: t("ops.boxUsesChild"),
      };
    }
    if (slot === "child" && children.length > 0) {
      return {
        ok: false,
        reason: t("ops.boxUsesChildren"),
      };
    }
  }

  return { ok: true };
}

export function canDrop(
  project: TfuiProject,
  draggedId: string,
  targetParentId: string | null,
  slot: string,
  screenId: string,
): { ok: true } | { ok: false; reason: string } {
  const dragged = findNode(project, draggedId);
  if (!dragged) return { ok: false, reason: t("ops.nodeNotFound") };
  if (dragged.screenId !== screenId) {
    return { ok: false, reason: t("ops.crossScreenMove") };
  }
  if (draggedId === targetParentId) {
    return { ok: false, reason: t("ops.dropOnSelf") };
  }
  if (targetParentId === null) {
    return { ok: false, reason: t("ops.rootNoSiblings") };
  }

  const screen = getScreen(project, screenId);
  if (!screen) return { ok: false, reason: t("ops.screenNotFound") };

  if (isDescendant(screen.root, draggedId, targetParentId)) {
    return { ok: false, reason: t("ops.dropInDescendant") };
  }

  const parent = getNodeById(screen.root, targetParentId);
  if (!parent) return { ok: false, reason: t("ops.parentNotFound") };

  return canPlaceType(
    parent.type,
    slot,
    dragged.node.type,
    parent.slots,
    draggedId,
  );
}

function detachNode(root: UiNode, nodeId: string): UiNode | null {
  for (const children of Object.values(root.slots)) {
    const idx = children.findIndex((c) => c.id === nodeId);
    if (idx >= 0) {
      const [removed] = children.splice(idx, 1);
      return removed;
    }
    for (const child of children) {
      const removed = detachNode(child, nodeId);
      if (removed) return removed;
    }
  }
  return null;
}

export function insertNode(
  project: TfuiProject,
  screenId: string,
  parentId: string,
  slot: string,
  node: UiNode,
  index?: number,
): TfuiProject {
  return produce(project, (draft) => {
    const screen = draft.screens.find((s) => s.id === screenId);
    if (!screen) return;
    const parent = getNodeById(screen.root, parentId);
    if (!parent) return;
    if (!parent.slots[slot]) parent.slots[slot] = [];
    const list = parent.slots[slot];
    const at =
      index === undefined ? list.length : Math.max(0, Math.min(index, list.length));
    list.splice(at, 0, node);
  });
}

export function deleteNode(project: TfuiProject, nodeId: string): TfuiProject {
  const loc = findNode(project, nodeId);
  if (!loc || loc.parentId === null) return project;
  return produce(project, (draft) => {
    const screen = draft.screens.find((s) => s.id === loc.screenId);
    if (!screen) return;
    detachNode(screen.root, nodeId);
  });
}

export function moveNode(
  project: TfuiProject,
  draggedId: string,
  targetParentId: string,
  slot: string,
  index: number,
): TfuiProject {
  const loc = findNode(project, draggedId);
  if (!loc) return project;
  const check = canDrop(project, draggedId, targetParentId, slot, loc.screenId);
  if (!check.ok) return project;

  return produce(project, (draft) => {
    const screen = draft.screens.find((s) => s.id === loc.screenId);
    if (!screen) return;
    const node = detachNode(screen.root, draggedId);
    if (!node) return;
    const parent = getNodeById(screen.root, targetParentId);
    if (!parent) return;
    if (!parent.slots[slot]) parent.slots[slot] = [];
    let at = index;
    if (loc.parentId === targetParentId && loc.slot === slot && loc.index < index) {
      at = index - 1;
    }
    at = Math.max(0, Math.min(at, parent.slots[slot].length));
    parent.slots[slot].splice(at, 0, node);
  });
}

export type TreeOpResult =
  | { ok: true; project: TfuiProject }
  | { ok: false; reason: string };

export function duplicateNode(
  project: TfuiProject,
  nodeId: string,
  catalog?: Catalog | null,
): TreeOpResult {
  const loc = findNode(project, nodeId);
  if (!loc || loc.parentId === null || loc.slot === null) {
    return { ok: false, reason: t("ops.duplicateRoot") };
  }
  const screen = getScreen(project, loc.screenId);
  if (!screen) return { ok: false, reason: t("ops.screenNotFound") };
  const parent = getNodeById(screen.root, loc.parentId);
  if (!parent) return { ok: false, reason: t("ops.parentNotFound") };

  const place = canPlaceType(
    parent.type,
    loc.slot,
    loc.node.type,
    parent.slots,
    undefined,
    catalogOrActive(catalog),
  );
  if (!place.ok) return place;

  const clone = structuredClone(loc.node);
  reassignIdsAndClearMeta(clone);

  return {
    ok: true,
    project: insertNode(
      project,
      loc.screenId,
      loc.parentId,
      loc.slot,
      clone,
      loc.index + 1,
    ),
  };
}

function reassignIdsAndClearMeta(node: UiNode, suffixName = true): void {
  node.id = createId();
  if (node.meta.id) delete node.meta.id;
  if (suffixName && node.name) node.name = `${node.name}_2`;
  for (const children of Object.values(node.slots)) {
    for (const child of children) reassignIdsAndClearMeta(child, suffixName);
  }
}

/** Clone profond avec nouveaux ids (écran / sous-arbre). */
export function cloneNodeTree(node: UiNode, suffixName = false): UiNode {
  const clone = structuredClone(node) as UiNode;
  reassignIdsAndClearMeta(clone, suffixName);
  return clone;
}

export function moveUp(
  project: TfuiProject,
  nodeId: string,
): TreeOpResult {
  const loc = findNode(project, nodeId);
  if (!loc || loc.parentId === null || loc.slot === null) {
    return { ok: false, reason: t("ops.moveUpRoot") };
  }
  if (loc.index <= 0) {
    return { ok: false, reason: t("ops.alreadyFirst") };
  }
  return {
    ok: true,
    project: produce(project, (draft) => {
      const screen = draft.screens.find((s) => s.id === loc.screenId);
      if (!screen) return;
      const parent = getNodeById(screen.root, loc.parentId!);
      if (!parent) return;
      const list = parent.slots[loc.slot!];
      const i = loc.index;
      [list[i - 1], list[i]] = [list[i], list[i - 1]];
    }),
  };
}

export function moveDown(
  project: TfuiProject,
  nodeId: string,
): TreeOpResult {
  const loc = findNode(project, nodeId);
  if (!loc || loc.parentId === null || loc.slot === null) {
    return { ok: false, reason: t("ops.moveDownRoot") };
  }
  const screen = getScreen(project, loc.screenId);
  if (!screen) return { ok: false, reason: t("ops.screenNotFound") };
  const parent = getNodeById(screen.root, loc.parentId);
  if (!parent) return { ok: false, reason: t("ops.parentNotFound") };
  const list = parent.slots[loc.slot] ?? [];
  if (loc.index >= list.length - 1) {
    return { ok: false, reason: t("ops.alreadyLast") };
  }
  return {
    ok: true,
    project: produce(project, (draft) => {
      const scr = draft.screens.find((s) => s.id === loc.screenId);
      if (!scr) return;
      const par = getNodeById(scr.root, loc.parentId!);
      if (!par) return;
      const slotList = par.slots[loc.slot!];
      const i = loc.index;
      [slotList[i], slotList[i + 1]] = [slotList[i + 1], slotList[i]];
    }),
  };
}

export function outdentNode(
  project: TfuiProject,
  nodeId: string,
  catalog?: Catalog | null,
): TreeOpResult {
  const loc = findNode(project, nodeId);
  if (!loc || loc.parentId === null || loc.slot === null) {
    return { ok: false, reason: t("ops.outdentRoot") };
  }
  const parentLoc = findNode(project, loc.parentId);
  if (!parentLoc || parentLoc.parentId === null || parentLoc.slot === null) {
    return {
      ok: false,
      reason: t("ops.outdentUnderRoot"),
    };
  }
  const screen = getScreen(project, loc.screenId);
  if (!screen) return { ok: false, reason: t("ops.screenNotFound") };
  const grandParent = getNodeById(screen.root, parentLoc.parentId);
  if (!grandParent) return { ok: false, reason: t("ops.grandParentNotFound") };

  const place = canPlaceType(
    grandParent.type,
    parentLoc.slot,
    loc.node.type,
    grandParent.slots,
    undefined,
    catalogOrActive(catalog),
  );
  if (!place.ok) return place;

  return {
    ok: true,
    project: moveNode(
      project,
      nodeId,
      parentLoc.parentId,
      parentLoc.slot,
      parentLoc.index + 1,
    ),
  };
}

export function unwrapNode(
  project: TfuiProject,
  nodeId: string,
  catalog?: Catalog | null,
): TreeOpResult {
  const loc = findNode(project, nodeId);
  if (!loc) return { ok: false, reason: t("ops.nodeNotFound") };
  if (loc.parentId === null || loc.slot === null) {
    return { ok: false, reason: t("ops.unwrapRoot") };
  }
  if (loc.node.type === "Window") {
    return { ok: false, reason: t("ops.unwrapWindow") };
  }

  const screen = getScreen(project, loc.screenId);
  if (!screen) return { ok: false, reason: t("ops.screenNotFound") };
  const parent = getNodeById(screen.root, loc.parentId);
  if (!parent) return { ok: false, reason: t("ops.parentNotFound") };

  const children: UiNode[] = [];
  for (const list of Object.values(loc.node.slots)) {
    children.push(...list);
  }
  if (children.length === 0) {
    return { ok: false, reason: t("ops.nothingToUnwrap") };
  }

  const cat = catalogOrActive(catalog);
  const simulated: Record<string, UiNode[]> = {
    ...parent.slots,
    [loc.slot]: (parent.slots[loc.slot] ?? []).filter((n) => n.id !== nodeId),
  };
  for (const child of children) {
    const place = canPlaceType(
      parent.type,
      loc.slot,
      child.type,
      simulated,
      undefined,
      cat,
    );
    if (!place.ok) return place;
    simulated[loc.slot] = [...(simulated[loc.slot] ?? []), child];
  }

  return {
    ok: true,
    project: produce(project, (draft) => {
      const scr = draft.screens.find((s) => s.id === loc.screenId);
      if (!scr || !loc.slot) return;
      const par = getNodeById(scr.root, loc.parentId!);
      if (!par) return;
      const list = par.slots[loc.slot];
      const idx = list.findIndex((n) => n.id === nodeId);
      if (idx < 0) return;
      const [wrapper] = list.splice(idx, 1);
      const kids: UiNode[] = [];
      for (const slotKids of Object.values(wrapper.slots)) {
        kids.push(...slotKids);
      }
      list.splice(idx, 0, ...kids);
    }),
  };
}

export function copyNodeToClipboard(project: TfuiProject, nodeId: string): TreeOpResult {
  const loc = findNode(project, nodeId);
  if (!loc) return { ok: false, reason: t("ops.nodeNotFound") };
  if (loc.parentId === null) {
    return { ok: false, reason: t("ops.copyRoot") };
  }
  setClipboardNode(structuredClone(loc.node));
  return { ok: true, project };
}

export function pasteClipboardNode(
  project: TfuiProject,
  targetNodeId: string,
  catalog?: Catalog | null,
): TreeOpResult {
  const clip = getClipboardNode();
  if (!clip) return { ok: false, reason: t("ops.clipboardEmpty") };

  const loc = findNode(project, targetNodeId);
  if (!loc) return { ok: false, reason: t("ops.targetNotFound") };

  const cat = catalogOrActive(catalog);
  let parentId: string;
  let slot: string;
  let index: number;

  if (loc.parentId === null) {
    const insertSlot = primaryInsertSlot(loc.node.type, cat);
    if (!insertSlot) {
      return { ok: false, reason: t("ops.rootNoPasteSlot") };
    }
    parentId = loc.node.id;
    slot = insertSlot;
    index = loc.node.slots[insertSlot]?.length ?? 0;
  } else if (loc.slot !== null) {
    // Coller comme frère après la cible
    parentId = loc.parentId;
    slot = loc.slot;
    index = loc.index + 1;
  } else {
    return { ok: false, reason: t("ops.invalidPasteTarget") };
  }

  const screen = getScreen(project, loc.screenId);
  if (!screen) return { ok: false, reason: t("ops.screenNotFound") };
  const parent = getNodeById(screen.root, parentId);
  if (!parent) return { ok: false, reason: t("ops.parentNotFound") };

  const place = canPlaceType(
    parent.type,
    slot,
    clip.type,
    parent.slots,
    undefined,
    cat,
  );
  if (!place.ok) return place;

  const clone = structuredClone(clip);
  reassignIdsAndClearMeta(clone, false);

  return {
    ok: true,
    project: insertNode(project, loc.screenId, parentId, slot, clone, index),
  };
}

export function wrapNode(
  project: TfuiProject,
  nodeId: string,
  wrapperType: string,
  catalog?: Catalog | null,
): TreeOpResult {
  const loc = findNode(project, nodeId);
  if (!loc) return { ok: false, reason: t("ops.nodeNotFound") };
  if (loc.parentId === null) {
    return {
      ok: false,
      reason: t("ops.wrapRoot"),
    };
  }
  const cat = catalogOrActive(catalog);
  const insertSlot = primaryInsertSlot(wrapperType, cat);
  if (!insertSlot) {
    return {
      ok: false,
      reason: t("ops.noSlotForChild", { type: wrapperType }),
    };
  }

  const screen = getScreen(project, loc.screenId);
  if (!screen || !loc.slot) {
    return { ok: false, reason: t("ops.screenOrSlotNotFound") };
  }
  const parent = getNodeById(screen.root, loc.parentId);
  if (!parent) return { ok: false, reason: t("ops.parentNotFound") };

  const wrapperSlots: Record<string, UiNode[]> = { [insertSlot]: [] };
  const childOk = canPlaceType(
    wrapperType,
    insertSlot,
    loc.node.type,
    wrapperSlots,
    undefined,
    cat,
  );
  if (!childOk.ok) return childOk;

  const parentOk = canPlaceType(
    parent.type,
    loc.slot,
    wrapperType,
    parent.slots,
    nodeId,
    cat,
  );
  if (!parentOk.ok) return parentOk;

  const wrapper: UiNode = {
    id: createId(),
    type: wrapperType,
    name: wrapperType,
    props: {},
    meta: {},
    slots: { [insertSlot]: [] },
  };

  const next = produce(project, (draft) => {
    const scr = draft.screens.find((s) => s.id === loc.screenId);
    if (!scr || !loc.slot) return;
    const par = getNodeById(scr.root, loc.parentId!);
    if (!par) return;
    const list = par.slots[loc.slot];
    const idx = list.findIndex((n) => n.id === nodeId);
    if (idx < 0) return;
    const [node] = list.splice(idx, 1);
    wrapper.slots[insertSlot] = [node];
    list.splice(idx, 0, wrapper);
  });

  return { ok: true, project: next };
}

export function renameNode(
  project: TfuiProject,
  nodeId: string,
  name: string,
): TfuiProject {
  return produce(project, (draft) => {
    for (const screen of draft.screens) {
      const node = getNodeById(screen.root, nodeId);
      if (node) {
        node.name = name;
        return;
      }
    }
  });
}

export function toggleNodeHidden(
  project: TfuiProject,
  nodeId: string,
): TfuiProject {
  return produce(project, (draft) => {
    for (const screen of draft.screens) {
      const node = getNodeById(screen.root, nodeId);
      if (node) {
        node.hidden = !node.hidden;
        return;
      }
    }
  });
}

export function toggleNodeLocked(
  project: TfuiProject,
  nodeId: string,
): TfuiProject {
  return produce(project, (draft) => {
    for (const screen of draft.screens) {
      const node = getNodeById(screen.root, nodeId);
      if (node) {
        node.locked = !node.locked;
        return;
      }
    }
  });
}

export function setNodeProp(
  project: TfuiProject,
  nodeId: string,
  key: string,
  value: UiNode["props"][string],
): TfuiProject {
  return produce(project, (draft) => {
    for (const screen of draft.screens) {
      const node = getNodeById(screen.root, nodeId);
      if (node) {
        node.props[key] = value;
        return;
      }
    }
  });
}

export function unsetNodeProp(
  project: TfuiProject,
  nodeId: string,
  key: string,
): TfuiProject {
  return produce(project, (draft) => {
    for (const screen of draft.screens) {
      const node = getNodeById(screen.root, nodeId);
      if (node && key in node.props) {
        delete node.props[key];
        return;
      }
    }
  });
}

export function setNodeMeta(
  project: TfuiProject,
  nodeId: string,
  meta: Partial<UiNode["meta"]>,
): TfuiProject {
  return produce(project, (draft) => {
    for (const screen of draft.screens) {
      const node = getNodeById(screen.root, nodeId);
      if (node) {
        node.meta = { ...node.meta, ...meta };
        return;
      }
    }
  });
}
