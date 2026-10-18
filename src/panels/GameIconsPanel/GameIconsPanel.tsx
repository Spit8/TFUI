import { useDraggable } from "@dnd-kit/core";
import { LayoutGrid, List as ListIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { runCommand } from "../../app/commands";
import { getCommandContext } from "../../app/commands/commandContextBridge";
import { planPaletteAutoInsert, paletteTargetNodeId } from "../../app/paletteInsert";
import type { GameIconDragData } from "../../app/WorkspaceDnd";
import { getActiveCatalog } from "../../catalog/activeCatalog";
import { filterGameIcons, groupGameIcons, type GameIcon } from "../../catalog/gameIcons";
import { iconUrl, useGameIcons } from "../../store/gameIconsStore";
import { useProjectStore } from "../../store/projectStore";
import { pushToast } from "../../store/toastStore";
import { CollapsibleSection, ICONS_SECTIONS_KEY } from "../../ui/CollapsibleSection";
import "./GameIconsPanel.css";
import { t, useT } from "../../i18n";
import { NON_UI_GROUP, OTHER_GROUP } from "../../catalog/gameIcons";

type View = "grid" | "list";
const VIEW_KEY = "tfui.icons.view";

function loadView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

/** Vignette chargée quand elle devient visible (milliers d’images). */
function IconThumb({ icon }: { icon: GameIcon }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const obs = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      obs.disconnect();
      void iconUrl(icon.png).then((u) => {
        if (alive) setUrl(u);
      });
    });
    obs.observe(el);
    return () => {
      alive = false;
      obs.disconnect();
    };
  }, [icon.png]);
  return (
    <span ref={ref} className="icons-thumb">
      {url ? <img src={url} alt="" draggable={false} /> : null}
    </span>
  );
}

/** Double-clic : ImageView dans le nœud sélectionné s’il l’accepte, sinon juste après. */
function autoInsertIcon(icon: GameIcon): void {
  const s = useProjectStore.getState();
  const target = paletteTargetNodeId(s.project, s.selectedNodeId, s.selectedScreenId);
  if (!s.project || !target) {
    pushToast(t("palette.selectNode"), "info");
    return;
  }
  const plan = planPaletteAutoInsert(s.project, target, "ImageView", getActiveCatalog());
  if (!plan.ok) {
    pushToast(plan.reason, "info");
    return;
  }
  s.insertChild(plan.parentId, "ImageView", plan.slot, plan.index, {
    path: { kind: "literal", value: icon.gamePath },
  });
}

function IconItem({ icon, view }: { icon: GameIcon; view: View }) {
  const data: GameIconDragData = { source: "gameIcon", path: icon.gamePath, label: icon.name };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `icon-${icon.gamePath}`, data });
  return (
    <div
      ref={setNodeRef}
      className={`icons-item${isDragging ? " dragging" : ""}`}
      title={t("icons.itemHint", {
        path: icon.gamePath,
        w: icon.width,
        h: icon.height,
        kind: icon.mask ? t("icons.maskHint") : t("icons.colorHint"),
      })}
      onDoubleClick={() => autoInsertIcon(icon)}
      {...listeners}
      {...attributes}
    >
      <IconThumb icon={icon} />
      {view === "list" ? (
        <span className="icons-name">
          {icon.name}
          <span className="icons-size">
            {icon.width}×{icon.height}
          </span>
        </span>
      ) : null}
    </div>
  );
}

/**
 * Icônes et images du jeu importées (copie locale), rangées comme les
 * dossiers du jeu. Glisser une icône crée un ImageView à l’endroit du dépôt.
 */
export function GameIconsPanel() {
  useT();
  const icons = useGameIcons();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>(loadView);
  const filtered = useMemo(() => filterGameIcons(icons ?? [], query), [icons, query]);
  const groups = useMemo(() => groupGameIcons(filtered), [filtered]);

  function toggleView() {
    const next: View = view === "grid" ? "list" : "grid";
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // préférence locale
    }
  }

  const importMore = (
    <button type="button" onClick={() => void runCommand("tools.rescan", getCommandContext())}>
      {t("icons.importMore")}
    </button>
  );

  return (
    <div className="icons-panel">
      <div className="palette-toolbar icons-toolbar">
        <div className="palette-search">
          <input
            type="search"
            placeholder={t("icons.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="palette-view-toggle"
          title={view === "grid" ? t("palette.listView") : t("palette.gridView")}
          onClick={toggleView}
        >
          {view === "grid" ? <ListIcon size={14} /> : <LayoutGrid size={14} />}
        </button>
      </div>
      <div className="icons-scroll">
        {icons === null ? <div className="palette-empty">{t("icons.loading")}</div> : null}
        {icons !== null && icons.length < 100 ? (
          <div className="palette-empty">
            {icons.length === 0 ? t("icons.none") : t("icons.minimumOnly")}
            <div style={{ marginTop: 6 }}>{importMore}</div>
          </div>
        ) : null}
        {groups.map((g) => (
          <CollapsibleSection
            key={g.title}
            id={g.title}
            title={g.title === NON_UI_GROUP ? t("icons.groupNonUi") : g.title === OTHER_GROUP ? t("icons.groupOther") : g.title}
            storageKey={ICONS_SECTIONS_KEY}
            defaultOpen={false}
            countLabel={String(g.count)}
            className="palette-category"
          >
            {g.subgroups.map((sub) => (
              <div key={sub.title} className="icons-subgroup">
                {sub.title ? <div className="icons-subtitle">{sub.title}</div> : null}
                <div className={view === "grid" ? "icons-grid" : "icons-list"}>
                  {sub.icons.map((icon) => (
                    <IconItem key={icon.gamePath} icon={icon} view={view} />
                  ))}
                </div>
              </div>
            ))}
          </CollapsibleSection>
        ))}
        {icons !== null && icons.length > 0 && groups.length === 0 ? (
          <div className="palette-empty">{t("palette.noResult")}</div>
        ) : null}
      </div>
    </div>
  );
}
