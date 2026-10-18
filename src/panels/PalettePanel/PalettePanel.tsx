import { useDraggable } from "@dnd-kit/core";
import { LayoutGrid, List as ListIcon } from "lucide-react";
import { useMemo, useState } from "react";
import {
  paletteTargetNodeId,
  planPaletteAutoInsert,
  planPaletteInsert,
  type PaletteInsertMode,
  type PaletteInsertPlan,
} from "../../app/paletteInsert";
import type { PaletteDragData } from "../../app/WorkspaceDnd";
import { getActiveCatalog } from "../../catalog/activeCatalog";
import { useCatalog } from "../../catalog/CatalogContext";
import type { ResolvedComponent } from "../../catalog/types";
import { useProjectStore } from "../../store/projectStore";
import { pushToast } from "../../store/toastStore";
import type { MenuItem } from "../../ui/menu/types";
import {
  CollapsibleSection,
  PALETTE_SECTIONS_KEY,
} from "../../ui/CollapsibleSection";
import { ComponentIcon, resolveIconByLucideName } from "../../ui/icons";
import { ContextMenu } from "../../ui/menu/ContextMenu";
import { useContextMenu } from "../../ui/menu/useContextMenu";
import "./PalettePanel.css";
import { categoryLabel } from "../../catalog/overrides";
import { t, translateKey, useT } from "../../i18n";
import { PALETTE_PRESETS, type PalettePreset } from "../../model/palettePresets";

const VIEW_KEY = "tfui.palette.view";

type PaletteView = "list" | "grid";

function readView(): PaletteView {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

function PaletteItem({
  comp,
  view,
  onContextMenu,
}: {
  comp: ResolvedComponent;
  view: PaletteView;
  onContextMenu: (e: React.MouseEvent, type: string) => void;
}) {
  const data: PaletteDragData = { source: "palette", type: comp.name };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${comp.name}`,
    data,
  });

  const tooltip = [
    ...comp.notes,
    ...comp.fields
      .filter((f) => f.comment)
      .slice(0, 4)
      .map((f) => `${f.name}: ${f.comment}`),
  ].join("\n");

  const warn =
    comp.status === "experimental" || comp.status === "unsafe" ? "⚠" : null;

  return (
    <div
      ref={setNodeRef}
      className={`palette-item ${isDragging ? "dragging" : ""}`}
      title={tooltip || comp.name}
      onDoubleClick={() => autoInsertFromPalette(comp.name)}
      onContextMenu={(e) => onContextMenu(e, comp.name)}
      {...listeners}
      {...attributes}
    >
      <ComponentIcon
        type={comp.name}
        size={view === "grid" ? 20 : 16}
        className="palette-item-icon"
      />
      <span className="palette-item-name">{comp.name}</span>
      {warn ? (
        <span className="palette-badge" title={comp.status}>
          {warn}
        </span>
      ) : null}
    </div>
  );
}

function presetText(preset: PalettePreset, part: "name" | "tooltip"): string {
  return translateKey(`palette.presets.${preset.id}.${part}`);
}

/** Préréglage (motif vanilla, ex. espaceur) : même usage qu’un composant. */
function PresetItem({
  preset,
  view,
  onContextMenu,
}: {
  preset: PalettePreset;
  view: PaletteView;
  onContextMenu: (e: React.MouseEvent, type: string, presetId: string) => void;
}) {
  const data: PaletteDragData = { source: "palette", type: preset.type, presetId: preset.id };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-preset-${preset.id}`,
    data,
  });
  const Icon = resolveIconByLucideName(preset.icon);
  return (
    <div
      ref={setNodeRef}
      className={`palette-item ${isDragging ? "dragging" : ""}`}
      title={presetText(preset, "tooltip")}
      onDoubleClick={() => autoInsertFromPalette(preset.type, preset.id)}
      onContextMenu={(e) => onContextMenu(e, preset.type, preset.id)}
      {...listeners}
      {...attributes}
    >
      <Icon size={view === "grid" ? 20 : 16} className="palette-item-icon" aria-hidden strokeWidth={1.75} />
      <span className="palette-item-name">{presetText(preset, "name")}</span>
    </div>
  );
}

function presetMatches(preset: PalettePreset, q: string): boolean {
  if (!q) return true;
  return [preset.type, presetText(preset, "name"), presetText(preset, "tooltip"), ...preset.classes]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

function currentTarget(): string | null {
  const s = useProjectStore.getState();
  return paletteTargetNodeId(s.project, s.selectedNodeId, s.selectedScreenId);
}

function applyPlan(plan: PaletteInsertPlan & { type: string; presetId?: string }): void {
  if (!plan.ok) {
    pushToast(plan.reason, "info");
    return;
  }
  useProjectStore
    .getState()
    .insertChild(plan.parentId, plan.type, plan.slot, plan.index, undefined, plan.presetId);
}

/** Double-clic : dans le nœud ciblé s’il l’accepte, sinon juste après. */
function autoInsertFromPalette(type: string, presetId?: string): void {
  const project = useProjectStore.getState().project;
  const target = currentTarget();
  if (!project || !target) {
    pushToast(t("palette.selectNode"), "info");
    return;
  }
  applyPlan({ ...planPaletteAutoInsert(project, target, type, getActiveCatalog()), type, presetId });
}

const MODE_LABELS: Record<PaletteInsertMode, "palette.insertChild" | "palette.insertBefore" | "palette.insertAfter"> = {
  child: "palette.insertChild",
  before: "palette.insertBefore",
  after: "palette.insertAfter",
};

/** Menu explicite : le verbe et le nœud visé sont toujours écrits. */
function paletteMenuItems(type: string, presetId?: string): MenuItem[] {
  const project = useProjectStore.getState().project;
  const target = currentTarget();
  if (!project || !target) {
    return [
      {
        type: "label",
        text: project
          ? t("palette.selectNodeShort")
          : t("palette.noProjectShort"),
      },
    ];
  }
  const catalog = getActiveCatalog();
  return (["child", "before", "after"] as const).map((mode) => {
    const plan = planPaletteInsert(project, target, type, mode, catalog);
    return {
      type: "action" as const,
      label: t(MODE_LABELS[mode], { target: plan.targetType ?? t("palette.theSelection") }),
      icon: type,
      disabled: !plan.ok,
      title: plan.ok ? undefined : plan.reason,
      onClick: () => applyPlan({ ...plan, type, presetId }),
    };
  });
}

/** Catégorie des composants hors liste blanche (= leur catégorie par défaut). */
const ALL_BUILTINS = "all";

function groupByCategory(
  components: ResolvedComponent[],
): { category: string; items: ResolvedComponent[] }[] {
  const map = new Map<string, ResolvedComponent[]>();
  for (const c of components) {
    const list = map.get(c.category) ?? [];
    list.push(c);
    map.set(c.category, list);
  }
  return [...map.entries()].map(([category, items]) => ({ category, items }));
}

/** Catégories de la liste blanche, avec leurs préréglages (placés après les composants). */
function groupWithPresets(
  components: ResolvedComponent[],
  presets: PalettePreset[],
): { category: string; items: ResolvedComponent[]; presets: PalettePreset[] }[] {
  const groups = groupByCategory(components).map((g) => ({ ...g, presets: [] as PalettePreset[] }));
  for (const preset of presets) {
    let group = groups.find((g) => g.category === preset.category);
    if (!group) {
      group = { category: preset.category, items: [], presets: [] };
      groups.push(group);
    }
    group.presets.push(preset);
  }
  return groups;
}

function matchesQuery(comp: ResolvedComponent, q: string): boolean {
  if (!q) return true;
  const hay = [
    comp.name,
    categoryLabel(comp.category),
    ...comp.notes,
    ...comp.fields.map((f) => `${f.name} ${f.comment ?? ""}`),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function PalettePanel() {
  useT();
  const { catalog, resolved } = useCatalog();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<PaletteView>(readView);
  const ctxMenu = useContextMenu();

  const q = query.trim().toLowerCase();

  const whitelist = useMemo(
    () => resolved.filter((c) => c.inWhitelist && matchesQuery(c, q)),
    [resolved, q],
  );
  // Préréglages dont le type existe dans le catalogue chargé.
  const presets = useMemo(
    () =>
      PALETTE_PRESETS.filter(
        (p) => resolved.some((c) => c.name === p.type) && presetMatches(p, q),
      ),
    [resolved, q],
  );
  const others = useMemo(
    () => resolved.filter((c) => !c.inWhitelist && matchesQuery(c, q)),
    [resolved, q],
  );

  function toggleView() {
    const next: PaletteView = view === "list" ? "grid" : "list";
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // ignore
    }
  }

  if (!catalog) {
    return (
      <div className="palette-panel">
        <div className="palette-empty">
          {t("palette.noCatalog")}
        </div>
      </div>
    );
  }

  const itemsClass =
    view === "grid" ? "palette-items-grid" : "palette-items-list";

  return (
    <div className="palette-panel">
      <div className="palette-toolbar">
        <div className="palette-search">
          <input
            type="search"
            placeholder={t("palette.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="palette-view-toggle"
          title={view === "list" ? t("palette.gridView") : t("palette.listView")}
          onClick={toggleView}
        >
          {view === "list" ? <LayoutGrid size={14} /> : <ListIcon size={14} />}
        </button>
      </div>
      <div className="palette-scroll">
        {groupWithPresets(whitelist, presets).map(({ category, items, presets: categoryPresets }) => (
          <CollapsibleSection
            key={category}
            id={`wl:${category}`}
            title={categoryLabel(category)}
            storageKey={PALETTE_SECTIONS_KEY}
            countLabel={String(items.length + categoryPresets.length)}
            className="palette-category"
          >
            <div className={itemsClass}>
              {items.map((comp) => (
                <PaletteItem
                  key={comp.name}
                  comp={comp}
                  view={view}
                  onContextMenu={(e, type) =>
                    ctxMenu.open(e, () => paletteMenuItems(type))
                  }
                />
              ))}
              {categoryPresets.map((preset) => (
                <PresetItem
                  key={preset.id}
                  preset={preset}
                  view={view}
                  onContextMenu={(e, type, presetId) =>
                    ctxMenu.open(e, () => paletteMenuItems(type, presetId))
                  }
                />
              ))}
            </div>
          </CollapsibleSection>
        ))}
        {others.length > 0 ? (
          <CollapsibleSection
            id="all-builtins"
            title={categoryLabel(ALL_BUILTINS)}
            storageKey={PALETTE_SECTIONS_KEY}
            defaultOpen={false}
            countLabel={String(others.length)}
            className="palette-category"
          >
            {groupByCategory(others).map(({ category, items }) => {
              const grid = (
                <div className={itemsClass}>
                  {items.map((comp) => (
                    <PaletteItem
                      key={comp.name}
                      comp={comp}
                      view={view}
                      onContextMenu={(e, type) =>
                        ctxMenu.open(e, () => paletteMenuItems(type))
                      }
                    />
                  ))}
                </div>
              );
              // Composants sans catégorie propre : déjà sous « Tous les
              // builtins », pas de sous-section qui répète ce titre.
              if (category === ALL_BUILTINS) return <div key={category}>{grid}</div>;
              return (
                <CollapsibleSection
                  key={category}
                  id={`all:${category}`}
                  title={categoryLabel(category)}
                  storageKey={PALETTE_SECTIONS_KEY}
                  defaultOpen
                  countLabel={String(items.length)}
                  className="palette-category"
                >
                  {grid}
                </CollapsibleSection>
              );
            })}
          </CollapsibleSection>
        ) : null}
        {whitelist.length === 0 && others.length === 0 && presets.length === 0 ? (
          <div className="palette-empty">{t("palette.noResult")}</div>
        ) : null}
      </div>
      {ctxMenu.menu ? (
        <ContextMenu
          x={ctxMenu.menu.x}
          y={ctxMenu.menu.y}
          doc={ctxMenu.menu.doc}
          items={ctxMenu.menu.items}
          onClose={ctxMenu.close}
        />
      ) : null}
    </div>
  );
}
