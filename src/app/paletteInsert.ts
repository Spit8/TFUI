import type { Catalog } from "../catalog/types";
import { primaryInsertSlot } from "../model/slots";
import { canPlaceType, findNode } from "../model/treeOps";
import type { TfuiProject } from "../model/types";
import { t } from "../i18n";

/** Où insérer un composant de la palette, par rapport au nœud cible. */
export type PaletteInsertMode = "child" | "before" | "after";

export type PaletteInsertPlan =
  | {
      ok: true;
      mode: PaletteInsertMode;
      parentId: string;
      slot: string;
      index?: number;
      /** Type du nœud cible (pour les libellés). */
      targetType: string;
    }
  | { ok: false; reason: string; targetType?: string };

/**
 * Nœud visé par la palette : le nœud sélectionné, sinon la racine de l’écran
 * sélectionné, sinon rien.
 */
export function paletteTargetNodeId(
  project: TfuiProject | null,
  selectedNodeId: string | null,
  selectedScreenId: string | null,
): string | null {
  if (!project) return null;
  if (selectedNodeId && findNode(project, selectedNodeId)) return selectedNodeId;
  const screen = project.screens.find((s) => s.id === selectedScreenId);
  return screen?.root.id ?? null;
}

/** Calcule une insertion précise (enfant / avant / après) du type `type`. */
export function planPaletteInsert(
  project: TfuiProject,
  targetId: string,
  type: string,
  mode: PaletteInsertMode,
  catalog: Catalog | null,
): PaletteInsertPlan {
  const loc = findNode(project, targetId);
  if (!loc) return { ok: false, reason: t("ops.nodeNotFound") };
  const targetType = loc.node.type;

  if (mode === "child") {
    const slot = primaryInsertSlot(targetType, catalog);
    if (!slot) {
      return { ok: false, reason: t("ops.noChildAccepted", { type: targetType }), targetType };
    }
    const r = canPlaceType(targetType, slot, type, loc.node.slots, undefined, catalog);
    return r.ok
      ? { ok: true, mode, parentId: targetId, slot, targetType }
      : { ok: false, reason: r.reason, targetType };
  }

  if (!loc.parentId || loc.slot == null) {
    return { ok: false, reason: t("ops.notBesideRoot"), targetType };
  }
  const parent = findNode(project, loc.parentId);
  if (!parent) return { ok: false, reason: t("ops.parentNotFound"), targetType };
  const r = canPlaceType(
    parent.node.type,
    loc.slot,
    type,
    parent.node.slots,
    undefined,
    catalog,
  );
  if (!r.ok) return { ok: false, reason: r.reason, targetType };
  return {
    ok: true,
    mode,
    parentId: loc.parentId,
    slot: loc.slot,
    index: mode === "after" ? loc.index + 1 : loc.index,
    targetType,
  };
}

/**
 * Double-clic dans la palette : dans le nœud ciblé s’il accepte le type,
 * sinon juste après lui.
 */
export function planPaletteAutoInsert(
  project: TfuiProject,
  targetId: string,
  type: string,
  catalog: Catalog | null,
): PaletteInsertPlan {
  const child = planPaletteInsert(project, targetId, type, "child", catalog);
  if (child.ok) return child;
  const after = planPaletteInsert(project, targetId, type, "after", catalog);
  return after.ok ? after : child;
}
