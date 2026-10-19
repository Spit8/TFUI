import type { Catalog, CatalogComponent } from "../catalog/types";
import { getActiveCatalog } from "../catalog/activeCatalog";
import { t } from "../i18n";

/** Default slots per component type used by tree ops / factory. */
export const PARENT_CHILD_RULES: Record<string, string> = {
  AbsoluteLayoutChild: "AbsoluteLayout",
  ComboBoxItem: "ComboBox",
  TabWidgetChild: "TabWidget",
  Row: "TableLayout",
  FloatingLayoutChild: "FloatingLayout",
};

/** Builtins que le moteur C++ traite comme des layouts (`Builtin…Layout`). */
export const ENGINE_LAYOUT_TYPES = new Set(["BoxLayout", "FlowLayout", "TableLayout", "AbsoluteLayout", "FloatingLayout"]);

/**
 * Emplacements contraints par le moteur C++ (messages relevés dans
 * `TransportFever3.exe`, vérifiés en jeu le 2026-10-18 pour l’onglet :
 * « TabWidgetChild item must not be a Layout » fait tomber toute l’UI,
 * « Script component root failed ») :
 * - `TabWidgetChild indicator / item must not be a Layout`,
 * - `TableLayout cell must not be a Layout`,
 * - `ScrollArea does not accept a Layout as content`,
 * - assertion `List children must be Components, not Layouts` (BuiltinList.cpp,
 *   constatée en jeu le 2026-10-18 : toute l’UI tombe aussi),
 * - `Item of Component must be a layout`.
 * Vanilla : `item = builtin.Component{ layout = builtin.BoxLayout{…} }`.
 */
export const SLOT_LAYOUT_RULES: Record<string, Record<string, "layout" | "notLayout">> = {
  TabWidgetChild: { item: "notLayout", indicator: "notLayout" },
  Row: { cells: "notLayout" },
  ScrollArea: { content: "notLayout" },
  List: { children: "notLayout" },
  Component: { layout: "layout" },
};

export function slotLayoutRule(parentType: string, slot: string): "layout" | "notLayout" | null {
  return SLOT_LAYOUT_RULES[parentType]?.[slot] ?? null;
}

/** Le placement de `nodeType` dans `parentType.slot` viole-t-il une règle du moteur ? */
export function violatesSlotLayoutRule(parentType: string, slot: string, nodeType: string): "layout" | "notLayout" | null {
  const rule = slotLayoutRule(parentType, slot);
  if (rule === "notLayout" && ENGINE_LAYOUT_TYPES.has(nodeType)) return rule;
  if (rule === "layout" && !ENGINE_LAYOUT_TYPES.has(nodeType)) return rule;
  return null;
}

const PRIMARY_SLOT_PREFERENCE = [
  "children",
  "content",
  "layout",
  "item",
  "tabs",
  "rows",
  "items",
  "cells",
  "header",
  "child",
  "indicator",
] as const;

function resolveCatalog(catalog?: Catalog | null): Catalog | null {
  return catalog ?? getActiveCatalog();
}

export function findCatalogComponent(
  type: string,
  catalog?: Catalog | null,
): CatalogComponent | undefined {
  const c = resolveCatalog(catalog);
  return c?.components.find((comp) => comp.name === type);
}

/** Slot field names for a type from the catalog (`slot-single` / `slot-multi`). */
export function slotFieldsForType(
  type: string,
  catalog?: Catalog | null,
): { name: string; multi: boolean }[] {
  const comp = findCatalogComponent(type, catalog);
  if (!comp) return [];
  return comp.fields
    .filter((f) => f.kind === "slot-single" || f.kind === "slot-multi")
    .map((f) => ({ name: f.name, multi: f.kind === "slot-multi" }));
}

export function defaultSlotsForType(
  type: string,
  catalog?: Catalog | null,
): Record<string, never[]> {
  const slots: Record<string, never[]> = {};
  for (const field of slotFieldsForType(type, catalog)) {
    slots[field.name] = [];
  }
  return slots;
}

export function isMultiSlot(
  type: string,
  slot: string,
  catalog?: Catalog | null,
): boolean {
  const fields = slotFieldsForType(type, catalog);
  const found = fields.find((f) => f.name === slot);
  if (found) return found.multi;
  // Slot inconnu du catalogue : traiter comme multi pour ne pas bloquer l’émission
  // d’un tableau déjà présent (migration / données legacy).
  return true;
}

export function primaryInsertSlot(
  type: string,
  catalog?: Catalog | null,
): string | null {
  const slots = Object.keys(defaultSlotsForType(type, catalog));
  for (const pref of PRIMARY_SLOT_PREFERENCE) {
    if (slots.includes(pref)) return pref;
  }
  return slots[0] ?? null;
}

/**
 * Slots de repli quand le slot principal, mono, est déjà occupé : le titre
 * d’un onglet (`TabWidgetChild.indicator`, une TextView dans le vanilla).
 */
const SECONDARY_INSERT_SLOTS: Record<string, string[]> = {
  TabWidgetChild: ["indicator"],
};

/**
 * Slot où insérer un enfant « dans » `parent` : le slot principal, sauf s’il
 * n’accepte qu’un enfant et en a déjà un ; alors le premier slot de repli
 * libre (titre d’onglet). Sans repli possible, le slot principal (le refus
 * « déjà occupé » reste expliqué par canPlaceType).
 */
export function insertSlotFor(
  parent: { type: string; slots: Record<string, unknown[]> },
  catalog?: Catalog | null,
): string | null {
  const primary = primaryInsertSlot(parent.type, catalog);
  if (!primary) return null;
  const occupied = (s: string) => !isMultiSlot(parent.type, s, catalog) && (parent.slots[s]?.length ?? 0) > 0;
  if (!occupied(primary)) return primary;
  return (SECONDARY_INSERT_SLOTS[parent.type] ?? []).find((s) => !occupied(s)) ?? primary;
}

/** Renommages de slots obsolètes (éditeur → catalogue). */
const SLOT_RENAMES: Record<string, Record<string, string | null>> = {
  List: { items: "children" },
  ComboBox: { children: "items" },
  Component: { content: "layout" },
  CheckBox: { content: null },
};

export interface SlotMigrationWarning {
  nodeId: string;
  type: string;
  message: string;
}

/** Migre les clés de slots obsolètes sur tout l’arbre. Mutates in place. */
export function migrateNodeSlots(
  node: { id: string; type: string; slots: Record<string, unknown[]> },
  warnings: SlotMigrationWarning[] = [],
): SlotMigrationWarning[] {
  const renames = SLOT_RENAMES[node.type];
  if (renames) {
    for (const [from, to] of Object.entries(renames)) {
      if (!(from in node.slots)) continue;
      const children = node.slots[from] as unknown[];
      delete node.slots[from];
      if (to === null) {
        if (children.length > 0) {
          warnings.push({
            nodeId: node.id,
            type: node.type,
            message: t("ops.orphanChildren", { type: node.type, n: children.length, slot: from }),
          });
        }
      } else {
        const existing = (node.slots[to] as unknown[] | undefined) ?? [];
        node.slots[to] = [...existing, ...children];
      }
    }
  }
  for (const children of Object.values(node.slots)) {
    for (const child of children) {
      if (
        child &&
        typeof child === "object" &&
        "slots" in child &&
        "type" in child
      ) {
        migrateNodeSlots(
          child as {
            id: string;
            type: string;
            slots: Record<string, unknown[]>;
          },
          warnings,
        );
      }
    }
  }
  return warnings;
}

export function migrateProjectSlots<T extends {
  screens: { root: { id: string; type: string; slots: Record<string, unknown[]> } }[];
}>(project: T): { project: T; warnings: SlotMigrationWarning[] } {
  const warnings: SlotMigrationWarning[] = [];
  for (const screen of project.screens) {
    migrateNodeSlots(screen.root, warnings);
  }
  return { project, warnings };
}
