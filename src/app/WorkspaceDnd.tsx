import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type Active,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type Over,
} from "@dnd-kit/core";
import { Ban } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  checkDrop,
  chooseDropKind,
  locateNode,
  type DragSource,
  type DropKind,
} from "../model/dropTarget";
import { primaryInsertSlot } from "../model/slots";
import { useProjectStore } from "../store/projectStore";
import "./WorkspaceDnd.css";
import { t, translateKey } from "../i18n";

export type { DropKind };

export interface PaletteDragData {
  source: "palette";
  type: string;
  /** Préréglage de la palette (`palettePresets.ts`), ex. espaceur. */
  presetId?: string;
}

/** Nœud existant glissé depuis l’arbre ou l’aperçu. */
export interface TreeDragData {
  source: "tree";
  nodeId: string;
}

/** Icône du jeu glissée depuis le panneau « Icônes du jeu » (crée un ImageView). */
export interface GameIconDragData {
  source: "gameIcon";
  /** Chemin du jeu, ex. `::/gui/hud/icons/bus.tga`. */
  path: string;
  label: string;
}

/** Données d’une cible de l’aperçu : axe du layout parent (null = libre). */
export interface PreviewDropData {
  previewNodeId: string;
  parentAxis: "row" | "column" | null;
}

interface WorkspaceDndValue {
  overId: string | null;
  overKind: DropKind | null;
  /** Le dépôt à cet endroit est-il accepté ? */
  overValid: boolean;
  activeLabel: string | null;
}

const WorkspaceDndCtx = createContext<WorkspaceDndValue>({
  overId: null,
  overKind: null,
  overValid: true,
  activeLabel: null,
});

// Hook co-localisé avec le Provider (pattern context React).
// eslint-disable-next-line react-refresh/only-export-components -- hook du même module
export function useWorkspaceDnd(): WorkspaceDndValue {
  return useContext(WorkspaceDndCtx);
}

/**
 * Cible sous le pointeur ; parmi des cibles imbriquées (aperçu), la plus
 * petite, c’est-à-dire la plus profonde.
 */
const innermostUnderPointer: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  if (within.length === 0) return rectIntersection(args);
  const area = (id: string | number) => {
    const r = args.droppableRects.get(id);
    return r ? r.width * r.height : Infinity;
  };
  return [...within].sort((a, b) => area(a.id) - area(b.id));
};

interface OverState {
  id: string;
  kind: DropKind;
  valid: boolean;
  reason?: string;
}

function dragSourceOf(active: Active): DragSource | null {
  const data = active.data.current as PaletteDragData | TreeDragData | GameIconDragData | undefined;
  if (data?.source === "palette") return { source: "palette", type: data.type, presetId: data.presetId };
  if (data?.source === "tree") return { source: "tree", nodeId: data.nodeId };
  if (data?.source === "gameIcon") return { source: "gameIcon", path: data.path };
  return null;
}

interface Point {
  x: number;
  y: number;
}

/** Pointeur courant : position au démarrage du glisser + déplacement. */
function pointerOf(e: { activatorEvent: Event; delta: Point }): Point | null {
  const start = e.activatorEvent as Partial<PointerEvent>;
  if (typeof start.clientX !== "number" || typeof start.clientY !== "number") return null;
  return { x: start.clientX + e.delta.x, y: start.clientY + e.delta.y };
}

/** Position du pointeur sur la cible, 0..1 le long de l’axe. */
function relativePosition(pointer: Point | null, over: Over, axis: "row" | "column"): number {
  const r = over.rect;
  if (!pointer || r.width === 0 || r.height === 0) return 0.5;
  return axis === "row" ? (pointer.x - r.left) / r.width : (pointer.y - r.top) / r.height;
}

function computeOver(active: Active, over: Over | null, pointer: Point | null): OverState | null {
  if (!over) return null;
  const project = useProjectStore.getState().project;
  const drag = dragSourceOf(active);
  if (!project || !drag) return null;
  const overStr = String(over.id);
  const fromPreview = overStr.startsWith("preview-drop-");
  const id = overStr.replace(/^preview-drop-/, "").replace(/^drop-/, "");
  const target = locateNode(project, id);
  if (!target) return null;

  const accepts = primaryInsertSlot(target.node.type) !== null;
  const hasParent = target.parent !== null;
  let kind: DropKind;
  if (fromPreview) {
    // Aperçu : avant / après le long de l’axe du layout parent ; sans axe
    // (fenêtre, position libre), dans l’élément.
    const axis = (over.data.current as PreviewDropData | undefined)?.parentAxis ?? null;
    kind = axis ? chooseDropKind(relativePosition(pointer, over, axis), accepts, hasParent) : "into";
  } else {
    kind = chooseDropKind(relativePosition(pointer, over, "column"), accepts, hasParent);
  }
  const check = checkDrop(project, drag, id, kind);
  // Au-dessus de l’élément glissé lui-même : pas d’indicateur, rien ne bougera.
  if (check.ok && check.noop) return null;
  return check.ok ? { id, kind, valid: true } : { id, kind, valid: false, reason: check.reason };
}

export function WorkspaceDndProvider({ children }: { children: ReactNode }) {
  const [over, setOver] = useState<OverState | null>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const overRef = useRef<OverState | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const update = useCallback((next: OverState | null) => {
    const prev = overRef.current;
    if (
      prev?.id === next?.id &&
      prev?.kind === next?.kind &&
      prev?.valid === next?.valid &&
      prev?.reason === next?.reason
    ) {
      return;
    }
    overRef.current = next;
    setOver(next);
  }, []);

  // Curseur « interdit » pendant un glisser vers une cible refusée.
  useEffect(() => {
    const body = document.body;
    body.classList.toggle("dnd-active", activeLabel !== null);
    body.classList.toggle("dnd-forbidden", activeLabel !== null && over !== null && !over.valid);
    return () => body.classList.remove("dnd-active", "dnd-forbidden");
  }, [activeLabel, over]);

  const onDragStart = useCallback((e: DragStartEvent) => {
    useProjectStore.getState().clearDropError();
    const drag = dragSourceOf(e.active);
    if (drag?.source === "palette") {
      setActiveLabel(drag.presetId ? translateKey(`palette.presets.${drag.presetId}.name`) : drag.type);
    } else if (drag?.source === "gameIcon") {
      const data = e.active.data.current as GameIconDragData | undefined;
      setActiveLabel(`ImageView · ${data?.label ?? drag.path}`);
    } else if (drag?.source === "tree") {
      const project = useProjectStore.getState().project;
      const node = project ? locateNode(project, drag.nodeId)?.node : undefined;
      setActiveLabel(node ? (node.name ?? node.type) : t("dnd.moving"));
    } else {
      setActiveLabel("…");
    }
  }, []);

  // Recalculé à chaque mouvement : la zone (avant / dans / après) change
  // à l’intérieur d’une même cible.
  const onDragMove = useCallback(
    (e: DragMoveEvent) => update(computeOver(e.active, e.over, pointerOf(e))),
    [update],
  );

  const reset = useCallback(() => {
    update(null);
    setActiveLabel(null);
  }, [update]);

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const final = e.over ? computeOver(e.active, e.over, pointerOf(e)) : overRef.current;
      const drag = dragSourceOf(e.active);
      reset();
      if (!final || !drag) return;
      const store = useProjectStore.getState();
      const project = store.project;
      if (!project) return;
      const check = checkDrop(project, drag, final.id, final.kind);
      if (!check.ok) {
        useProjectStore.setState({ lastDropError: check.reason });
        return;
      }
      if (check.noop) return;
      const { parentId, slot, index } = check.placement;
      if (drag.source === "palette") store.insertChild(parentId, drag.type, slot, index, undefined, drag.presetId);
      else if (drag.source === "gameIcon") {
        store.insertChild(parentId, "ImageView", slot, index, { path: { kind: "literal", value: drag.path } });
      }
      else store.moveNode(drag.nodeId, parentId, slot, index);
    },
    [reset],
  );

  const ctx = useMemo(
    () => ({
      overId: over?.id ?? null,
      overKind: over?.kind ?? null,
      overValid: over?.valid ?? true,
      activeLabel,
    }),
    [over, activeLabel],
  );

  return (
    <WorkspaceDndCtx.Provider value={ctx}>
      <DndContext
        sensors={sensors}
        collisionDetection={innermostUnderPointer}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragOver={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={reset}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {activeLabel ? (
            <div className={`dnd-overlay${over && !over.valid ? " forbidden" : ""}`}>
              {over && !over.valid ? <Ban size={14} className="dnd-ban" aria-label={t("dnd.forbidden")} /> : null}
              <span>{activeLabel}</span>
              {over && !over.valid && over.reason ? <span className="dnd-reason">{over.reason}</span> : null}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </WorkspaceDndCtx.Provider>
  );
}
