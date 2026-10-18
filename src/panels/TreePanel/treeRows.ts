import type { Screen, UiNode } from "../../model/types";
import { t } from "../../i18n";

/** Ligne de l’arbre : un nœud (plus de lignes d’en-tête de slot). */
export interface FlatRow {
  id: string;
  screenId: string;
  node: UiNode;
  parentId: string | null;
  slot: string | null;
  index: number;
  depth: number;
  /**
   * Slot du nœud dans son parent, affiché en petite étiquette seulement quand
   * le parent a des enfants dans plusieurs slots (ex. Tab : `indicator` / `item`).
   */
  slotBadge?: string;
  hasChildren: boolean;
}

function nodeHasChildren(node: UiNode): boolean {
  return Object.values(node.slots).some((kids) => kids.length > 0);
}

/** Aplatis un écran : une ligne par nœud, indentation d’un cran par niveau. */
export function flattenScreen(screen: Screen): FlatRow[] {
  const rows: FlatRow[] = [];
  function walk(node: UiNode, parentId: string | null, slot: string | null, index: number, depth: number, badge?: string) {
    rows.push({
      id: node.id,
      screenId: screen.id,
      node,
      parentId,
      slot,
      index,
      depth,
      ...(badge ? { slotBadge: badge } : {}),
      hasChildren: nodeHasChildren(node),
    });
    const slotNames = Object.keys(node.slots);
    // Étiquette utile seulement si plusieurs slots ont réellement des enfants
    // (ex. Tab : indicator + item) ; un BoxLayout déclare children + child.
    const multi = slotNames.filter((n) => (node.slots[n]?.length ?? 0) > 0).length > 1;
    for (const slotName of slotNames) {
      (node.slots[slotName] ?? []).forEach((child, i) => {
        walk(child, node.id, slotName, i, depth + 1, multi ? slotName : undefined);
      });
    }
  }
  walk(screen.root, null, null, 0, 0);
  return rows;
}

/** Retire les descendants des nœuds repliés. */
export function filterCollapsedRows(rows: FlatRow[], collapsedIds: ReadonlySet<string>): FlatRow[] {
  const out: FlatRow[] = [];
  let skipDepth: number | null = null;
  for (const row of rows) {
    if (skipDepth != null) {
      if (row.depth > skipDepth) continue;
      skipDepth = null;
    }
    out.push(row);
    if (row.hasChildren && collapsedIds.has(row.id)) skipDepth = row.depth;
  }
  return out;
}

/** Ancêtres d’un nœud (pour déplier jusqu’à la sélection). */
export function ancestorIds(rows: FlatRow[], nodeId: string): string[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: string[] = [];
  let cur = byId.get(nodeId)?.parentId ?? null;
  while (cur) {
    out.push(cur);
    cur = byId.get(cur)?.parentId ?? null;
  }
  return out;
}

/** Nom affiché d’un fichier projet. */
export function projectLabel(path: string | null): string {
  if (!path) return t("tree.untitled");
  return path.split(/[/\\]/).pop() ?? path;
}
