import type { Catalog } from "../catalog/types";
import { getActiveCatalog } from "../catalog/activeCatalog";
import { getActiveVocabulary } from "../catalog/activeVocabulary";
import type { StyleVocabulary } from "../catalog/types";
import { getActiveBaseStyles } from "../gamestyle/activeBaseStyles";
import { isPaletteColor } from "./paletteColor";
import { allowedKeysForRule } from "./styleKeys";
import { closeButtonInert, wrappingMetaKeys } from "./metaRules";
import { isMultiSlot, PARENT_CHILD_RULES, violatesSlotLayoutRule } from "./slots";
import { vanillaSeenChildren } from "./vanillaUsage";
import type { TfuiProject, UiNode, ValidationIssue } from "./types";
import { t } from "../i18n";

/**
 * Champs que le jeu de base renseigne toujours (décompte des appels
 * `builtin.X{` dans les .tl vanilla, 2026-10-17).
 */
const VANILLA_ALWAYS_FILLED: Record<
  string,
  { slots: string[]; props?: string[]; evidence: string }
> = {
  ScrollArea: { slots: ["content"], evidence: "52/52" },
  ComboBox: { slots: ["items"], evidence: "23/23" },
  ComboBoxItem: { slots: ["content"], props: ["value"], evidence: "39/39" },
};

function isCssRuleScoped(selector: string): boolean {
  return /R::[A-Za-z_][\w]*/.test(selector);
}

function walk(
  node: UiNode,
  parent: UiNode | null,
  visit: (node: UiNode, parent: UiNode | null) => void,
): void {
  visit(node, parent);
  for (const children of Object.values(node.slots)) {
    for (const child of children) {
      walk(child, node, visit);
    }
  }
}

function propNumber(
  node: UiNode,
  key: string,
): number | undefined {
  const prop = node.props[key];
  if (prop?.kind === "literal" && typeof prop.value === "number") {
    return prop.value;
  }
  return undefined;
}

export function validateProject(
  project: TfuiProject,
  catalog?: Catalog | null,
  vocabulary?: StyleVocabulary | null,
  /** Noms de `default_colors.gres` ; défaut : palette des styles de base actifs. */
  paletteNames?: Set<string>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const cat = catalog ?? getActiveCatalog();

  const recipeNames = new Map<string, string>();
  for (const screen of project.screens) {
    const prev = recipeNames.get(screen.recipeName);
    if (prev) {
      issues.push({
        severity: "error",
        code: "duplicate_recipe_name",
        message: t("validate.duplicate_recipe_name", { name: screen.recipeName }),
        screenId: screen.id,
      });
    } else {
      recipeNames.set(screen.recipeName, screen.id);
    }

    if (screen.kind === "window" && screen.root.type !== "Window") {
      issues.push({
        severity: "error",
        code: "window_root_required",
        message: t("validate.window_root_required"),
        screenId: screen.id,
        nodeId: screen.root.id,
      });
    }

    if (screen.kind === "window" && closeButtonInert(screen.root)) {
      issues.push({
        severity: "warning",
        code: "window_close_inert",
        message: t("validate.window_close_inert"),
        screenId: screen.id,
        nodeId: screen.root.id,
      });
    }

    if (screen.kind === "window") {
      const keys = wrappingMetaKeys(screen.root);
      if (keys.length > 0) {
        issues.push({
          severity: "error",
          code: "window_root_meta",
          message: t("validate.window_root_meta", { keys: keys.join(", ") }),
          screenId: screen.id,
          nodeId: screen.root.id,
        });
      }
    }

    if (screen.kind === "plugin") {
      const layoutRoots = new Set([
        "BoxLayout",
        "FlowLayout",
        "Component",
        "ScrollArea",
        "AbsoluteLayout",
        "TableLayout",
      ]);
      if (!layoutRoots.has(screen.root.type)) {
        issues.push({
          severity: "error",
          code: "plugin_root_must_be_layout",
          message: t("validate.plugin_root_must_be_layout", { name: screen.recipeName, type: screen.root.type }),
          screenId: screen.id,
          nodeId: screen.root.id,
        });
      }
    }

    const metaIds = new Map<string, string>();

    walk(screen.root, null, (node, parent) => {
      if (node.type === "Window" && parent !== null) {
        issues.push({
          severity: "error",
          code: "window_not_root",
          message: t("validate.window_not_root"),
          screenId: screen.id,
          nodeId: node.id,
        });
      }

      if (node.type === "Window" && screen.kind !== "window" && parent === null) {
        issues.push({
          severity: "warning",
          code: "window_on_non_window_screen",
          message: t("validate.window_on_non_window_screen"),
          screenId: screen.id,
          nodeId: node.id,
        });
      }

      const requiredParent = PARENT_CHILD_RULES[node.type];
      if (requiredParent) {
        if (!parent || parent.type !== requiredParent) {
          issues.push({
            severity: "error",
            code: "invalid_parent",
            message: t("validate.invalid_parent", { type: node.type, parent: requiredParent }),
            screenId: screen.id,
            nodeId: node.id,
          });
        }
      }

      // ImageView.size : pixels des données brutes (`data` / `data_native`,
      // vanilla : captures, images chargées), sans effet sur l’affichage d’une
      // image `path` (constaté en jeu, banc 3, 2026-10-18).
      if (node.type === "ImageView" && node.props.size && !node.props.data && !node.props.data_native) {
        issues.push({
          severity: "warning",
          code: "imageview_size_prop",
          message: t("validate.imageview_size_prop"),
          screenId: screen.id,
          nodeId: node.id,
        });
      }

      // « TabWidget indicatorsScrollable can only be used with orientation NORTH
      // and SOUTH. Using indicatorsScrollable = false. » (TransportFever3.exe)
      if (node.type === "TabWidget") {
        const orient = node.props.orientation;
        const scroll = node.props.indicatorsScrollable;
        const sideways = orient?.kind === "enum" && /(East|West)$/.test(orient.value);
        if (sideways && scroll?.kind === "literal" && scroll.value === true) {
          issues.push({
            severity: "warning",
            code: "tabs_scrollable_orientation",
            message: t("validate.tabs_scrollable_orientation"),
            screenId: screen.id,
            nodeId: node.id,
          });
        }
      }

      // `builtin.AbsoluteLayout { enfant, … }` : aucun paramètre possible
      // (builtin.d.tl : function({TreeNodeId})) ; le générateur n’émet que les enfants.
      if (node.type === "AbsoluteLayout") {
        const meta = node.meta;
        const hasMeta = !!(meta.id || meta.class?.length || meta.tooltip || meta.inlineStyle || meta.enabled);
        const hasElementStyle = project.styleRules.some((r) => r.ownerNodeId === node.id);
        if (Object.keys(node.props).length > 0 || hasMeta || hasElementStyle) {
          issues.push({
            severity: "warning",
            code: "absolute_layout_params",
            message: t("validate.absolute_layout_params"),
            screenId: screen.id,
            nodeId: node.id,
          });
        }
      }

      for (const [slot, children] of Object.entries(node.slots)) {
        const seen = vanillaSeenChildren(node.type, slot);
        for (const child of children) {
          if (seen && !seen.includes(child.type) && !violatesSlotLayoutRule(node.type, slot, child.type)) {
            issues.push({
              severity: "warning",
              code: "vanilla_unseen_child",
              message: t("validate.vanilla_unseen_child", {
                type: child.type,
                parent: node.type,
                slot,
                seen: seen.join(", "),
              }),
              screenId: screen.id,
              nodeId: child.id,
            });
          }
          const rule = violatesSlotLayoutRule(node.type, slot, child.type);
          if (rule) {
            issues.push({
              severity: "error",
              code: "slot_layout_rule",
              message: t(rule === "layout" ? "ops.slotNeedsLayout" : "ops.slotRefusesLayout", {
                parent: node.type,
                slot,
                type: child.type,
              }),
              screenId: screen.id,
              nodeId: child.id,
            });
          }
        }
      }

      for (const [slot, children] of Object.entries(node.slots)) {
        if (!isMultiSlot(node.type, slot, cat) && children.length > 1) {
          issues.push({
            severity: "error",
            code: "mono_slot_overflow",
            message: t("validate.mono_slot_overflow", { slot, type: node.type, n: children.length }),
            screenId: screen.id,
            nodeId: node.id,
          });
        }
      }

      if (node.type === "BoxLayout") {
        const hasChildren = (node.slots.children?.length ?? 0) > 0;
        const hasChild = (node.slots.child?.length ?? 0) > 0;
        if (hasChildren && hasChild) {
          issues.push({
            severity: "error",
            code: "boxlayout_xor",
            message: t("validate.boxlayout_xor"),
            screenId: screen.id,
            nodeId: node.id,
          });
        }
      }

      if (node.meta.id) {
        const other = metaIds.get(node.meta.id);
        if (other) {
          issues.push({
            severity: "error",
            code: "duplicate_meta_id",
            message: t("validate.duplicate_meta_id", { id: node.meta.id }),
            screenId: screen.id,
            nodeId: node.id,
          });
        } else {
          metaIds.set(node.meta.id, node.id);
        }
      }

      // Éléments que le jeu de base n’emploie jamais vides (comptés dans les
      // .tl vanilla) : vides, ils sont le suspect n°1 d’un plantage natif.
      const usage = VANILLA_ALWAYS_FILLED[node.type];
      if (usage) {
        const missing = [
          ...usage.slots.filter((s) => (node.slots[s]?.length ?? 0) === 0),
          ...(usage.props ?? []).filter((p) => node.props[p] === undefined),
        ];
        if (missing.length > 0) {
          issues.push({
            severity: "warning",
            code: "vanilla_never_empty",
            message: t("validate.vanilla_never_empty", { type: node.type, missing: missing.join(", "), evidence: usage.evidence }),
            screenId: screen.id,
            nodeId: node.id,
          });
        }
      }

      // stylesheetutil.lua ne lit que `![%a%d%-]+` : une classe avec `_`, un
      // point… ne peut être visée par aucune règle .css.lua.
      for (const cls of node.meta.class ?? []) {
        if (!/^[A-Za-z0-9-]+$/.test(cls)) {
          issues.push({
            severity: "warning",
            code: "class_invalid_chars",
            message: t("validate.class_invalid_chars", { cls }),
            screenId: screen.id,
            nodeId: node.id,
          });
        }
      }

      if (node.type === "Window") {
        for (const key of ["initialX", "initialY"] as const) {
          const v = propNumber(node, key);
          if (v !== undefined && (v < 0 || v > 1)) {
            issues.push({
              severity: "error",
              code: "initial_xy_range",
              message: t("validate.initial_xy_range", { key, value: v }),
              screenId: screen.id,
              nodeId: node.id,
            });
          }
        }
      }
    });
  }

  for (const rule of project.styleRules) {
    // Règle d’élément : sélecteur dérivé (classe unique).
    if (rule.ownerNodeId) continue;
    // Sans R:: ni classe ni #id, la règle s’applique à tous les éléments de ce
    // type dans tout le jeu (menus vanilla compris).
    if (!isCssRuleScoped(rule.selector) && !/[!#]/.test(rule.selector)) {
      issues.push({
        severity: "warning",
        code: "css_rule_unscoped",
        message: t("validate.css_rule_unscoped", { selector: rule.selector }),
      });
    }
  }

  // Couleurs de palette inconnues : `colorDefault.<nom>` vaut nil en jeu et
  // toute la feuille `.css.lua` échoue (« attempt to index field 'Base' (a nil
  // value) », constaté le 2026-10-18). Vérifié seulement si la palette est connue.
  const names = paletteNames ?? new Set((getActiveBaseStyles()?.palette?.colors ?? []).map((c) => c.name));
  if (names.size > 0) {
    for (const rule of project.styleRules) {
      for (const [key, value] of Object.entries(rule.props)) {
        if (!isPaletteColor(value) || names.has(value.name)) continue;
        const loc = rule.ownerNodeId ? findNodeInProject(project, rule.ownerNodeId) : null;
        issues.push({
          severity: "error",
          code: "palette_unknown",
          message: t("validate.palette_unknown", { name: value.name, key, target: loc ? loc.node.name || loc.node.type : rule.selector }),
          ...(loc ? { screenId: loc.screenId, nodeId: loc.node.id } : {}),
        });
      }
    }
  }

  // Propriétés de style non autorisées pour ce que vise la règle (vanilla +
  // socle, model/styleKeys.ts). Sans vocabulaire par élément (ancien cache),
  // rien n’est signalé : la liste serait réduite au socle.
  const vocab = vocabulary === undefined ? getActiveVocabulary() : vocabulary;
  if (vocab?.keysByElement) {
    for (const rule of project.styleRules) {
      const allowed = allowedKeysForRule(project, rule, vocab);
      const refused = Object.keys(rule.props).filter(
        (k) => (rule.props as Record<string, unknown>)[k] !== undefined && !allowed.keys.has(k),
      );
      if (refused.length === 0) continue;
      const loc = rule.ownerNodeId ? findNodeInProject(project, rule.ownerNodeId) : null;
      issues.push({
        severity: "warning",
        code: "style_key_not_allowed",
        message: t("validate.style_key_not_allowed", {
          keys: refused.join(", "),
          target: loc ? loc.node.name || loc.node.type : rule.selector,
          elements: allowed.elements.join(", ") || "—",
        }),
        ...(loc ? { screenId: loc.screenId, nodeId: loc.node.id } : {}),
      });
    }
  }

  return issues;
}

/** Nœud et écran d’un identifiant, ou null. */
function findNodeInProject(project: TfuiProject, nodeId: string): { screenId: string; node: UiNode } | null {
  for (const screen of project.screens) {
    let found: UiNode | null = null;
    walk(screen.root, null, (n) => {
      if (n.id === nodeId) found = n;
    });
    if (found) return { screenId: screen.id, node: found };
  }
  return null;
}
