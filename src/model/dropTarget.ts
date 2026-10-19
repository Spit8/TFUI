import { primaryInsertSlot } from "./slots";
import { canDrop, canPlaceType } from "./treeOps";
import type { TfuiProject, UiNode } from "./types";
import { t } from "../i18n";

export type DropKind = "before" | "after" | "into";

/** Ce qui est glissé : un composant de la palette ou un nœud existant. */
export type DragSource =
  | { source: "palette"; type: string; presetId?: string }
  | { source: "tree"; nodeId: string }
  /** Icône du jeu : crée un ImageView dont `path` est l’image. */
  | { source: "gameIcon"; path: string };

/** Type de nœud créé par une source d’insertion (palette ou icône du jeu). */
export function insertedType(drag: DragSource): string | null {
  if (drag.source === "palette") return drag.type;
  if (drag.source === "gameIcon") return "ImageView";
  return null;
}

export interface NodeLocation {
  node: UiNode;
  parent: UiNode | null;
  slot: string | null;
  index: number;
  screenId: string;
}

export function locateNode(project: TfuiProject, id: string): NodeLocation | null {
  const walk = (node: UiNode, screenId: string): NodeLocation | null => {
    for (const [slot, children] of Object.entries(node.slots)) {
      for (let i = 0; i < children.length; i++) {
        const c = children[i]!;
        if (c.id === id) return { node: c, parent: node, slot, index: i, screenId };
        const nested = walk(c, screenId);
        if (nested) return nested;
      }
    }
    return null;
  };
  for (const screen of project.screens) {
    if (screen.root.id === id) return { node: screen.root, parent: null, slot: null, index: 0, screenId: screen.id };
    const found = walk(screen.root, screen.id);
    if (found) return found;
  }
  return null;
}

/**
 * Zone de dépôt d’après la position relative du pointeur (0..1) sur l’axe
 * de la liste : bords = avant / après, milieu = dans (si l’élément accepte
 * des enfants ; sinon la moitié la plus proche). La racine n’a pas de frères.
 */
export function chooseDropKind(rel: number, acceptsChildren: boolean, hasParent: boolean): DropKind {
  if (!hasParent) return "into";
  if (!acceptsChildren) return rel < 0.5 ? "before" : "after";
  if (rel < 0.28) return "before";
  if (rel > 0.72) return "after";
  return "into";
}

export interface DropPlacement {
  screenId: string;
  parentId: string;
  slot: string;
  index: number;
}

/**
 * `noop` : l’élément est relâché sur lui-même ou dans son propre contenu ;
 * il reste où il est, sans message (l’utilisateur l’a simplement remis).
 */
export type DropCheck =
  | { ok: true; placement: DropPlacement; noop?: boolean }
  | { ok: false; reason: string };

function containsNode(node: UiNode, id: string): boolean {
  if (node.id === id) return true;
  return Object.values(node.slots).some((children) => children.some((c) => containsNode(c, id)));
}

/** Où irait l’élément, et le jeu l’accepte-t-il ? (même règles qu’à l’insertion). */
export function checkDrop(project: TfuiProject, drag: DragSource, targetId: string, kind: DropKind): DropCheck {
  const target = locateNode(project, targetId);
  if (!target) return { ok: false, reason: t("ops.targetNotFound") };
  if (drag.source === "tree") {
    const dragged = locateNode(project, drag.nodeId);
    if (dragged && containsNode(dragged.node, targetId)) {
      const placement = {
        screenId: dragged.screenId,
        parentId: dragged.parent?.id ?? dragged.node.id,
        slot: dragged.slot ?? "",
        index: dragged.index,
      };
      return { ok: true, placement, noop: true };
    }
  }

  let parent: UiNode;
  let slot: string;
  let index: number;
  if (kind === "into") {
    const s = primaryInsertSlot(target.node.type);
    if (!s) return { ok: false, reason: t("ops.noChildAccepted", { type: target.node.type }) };
    parent = target.node;
    slot = s;
    index = target.node.slots[s]?.length ?? 0;
  } else {
    if (!target.parent || target.slot === null) {
      return { ok: false, reason: t("ops.rootNoSiblingsDrop") };
    }
    parent = target.parent;
    slot = target.slot;
    index = kind === "before" ? target.index : target.index + 1;
  }
  const placement = { screenId: target.screenId, parentId: parent.id, slot, index };

  const created = insertedType(drag);
  const check =
    created !== null
      ? canPlaceType(parent.type, slot, created, parent.slots)
      : canDrop(project, (drag as { nodeId: string }).nodeId, parent.id, slot, target.screenId);
  return check.ok ? { ok: true, placement } : check;
}
