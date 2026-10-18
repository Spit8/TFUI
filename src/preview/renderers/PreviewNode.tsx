import { Pin } from "lucide-react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useWorkspaceDnd, type PreviewDropData, type TreeDragData } from "../../app/WorkspaceDnd";
import { useCatalog } from "../../catalog/CatalogContext";
import { slotFieldsForType } from "../../model/slots";
import type { Screen, TfuiProject, UiNode } from "../../model/types";
import type { StateSimValue } from "../../store/projectStore";
import { usePreviewTabsStore } from "../../store/previewTabsStore";
import { useProjectStore } from "../../store/projectStore";
import { ComponentIcon } from "../../ui/icons";
import {
  useMenuTargetNodeId,
  usePreviewAppearance,
  usePreviewFontScale,
  useShowBoxes,
} from "../../store/previewCameraStore";
import { useStylePreviewStore } from "../../store/stylePreviewStore";
import { gameTextStyle, resolveStyles, windowContentStyle } from "../cascade";
import { getActiveBaseStyles } from "../../gamestyle/activeBaseStyles";
import {
  GAME_FONT_FAMILY,
  gameFontsLoaded,
  hasGameAssets,
  useGameAssetsVersion,
} from "../../gamestyle/gameAssets";
import { colorToRgba } from "../../model/paletteColor";
import { NinePatch } from "./NinePatch";
import { asNinePatch } from "./ninePatchSpec";
import { GameImageView, WindowCloseButton } from "./WindowChrome";
import {
  alignForGravity,
  effectiveGravity,
  expandsOnAxis,
  overflowForPolicy,
  scrollPolicies,
  shrinksOnAxis,
} from "../layoutGravity";
import { ScrollBox } from "./ScrollBox";
import { ParentLayoutContext, PreviewExportContext } from "./layoutContext";
import { InlineInput } from "./InlineInput";
import { inlineEditTarget } from "../../model/inlineEdit";
import { startInlineEdit, stopInlineEdit, useInlineEdit } from "../../store/inlineEditStore";
import { resolveBoolProp, resolveNumberProp, resolvePropValue, resolveStringProp } from "../propResolve";
import { fontSizeForClasses, paletteLookup, stylePropsToCss } from "../styleToCss";
import { previewTheme } from "../theme";
import { t } from "../../i18n";

export interface PreviewNodeProps {
  project: TfuiProject;
  screen: Screen;
  node: UiNode;
  stateSim: Record<string, StateSimValue> | undefined;
  onNodeContextMenu?: (e: MouseEvent, nodeId: string) => void;
}

function renderSlots(
  project: TfuiProject,
  screen: Screen,
  node: UiNode,
  slots: string[],
  stateSim: Record<string, StateSimValue> | undefined,
  onNodeContextMenu?: (e: MouseEvent, nodeId: string) => void,
): ReactNode {
  return slots.flatMap((slot) =>
    (node.slots[slot] ?? []).map((c) => (
      <PreviewNode
        key={c.id}
        project={project}
        screen={screen}
        node={c}
        stateSim={stateSim}
        onNodeContextMenu={onNodeContextMenu}
      />
    )),
  );
}

/** Le sous-arbre de `node` contient-il `id` ? */
function containsNode(node: UiNode, id: string): boolean {
  if (node.id === id) return true;
  return Object.values(node.slots).some((children) => children.some((c) => containsNode(c, id)));
}

/** État d’une CheckBox : `value`, sinon `initialValue` (-1 / 0 / 1). */
function checkBoxState(node: UiNode, screen: Screen, stateSim: Record<string, StateSimValue> | undefined): number {
  for (const key of ["value", "initialValue"]) {
    const v = resolvePropValue(node.props[key], screen, stateSim);
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
  }
  return 0;
}

export function PreviewNode({
  project,
  screen,
  node,
  stateSim,
  onNodeContextMenu,
}: PreviewNodeProps) {
  const selectedNodeId = useProjectStore((s) => s.selectedNodeId);
  const hoveredNodeId = useProjectStore((s) => s.hoveredNodeId);
  // Membre de la classe partagée cliquée (multi-sélection en lecture seule).
  const highlighted = useProjectStore((s) => s.highlightedNodeIds.includes(node.id));
  const setSelection = useProjectStore((s) => s.setSelection);
  const setHovered = useProjectStore((s) => s.setHovered);
  const setProp = useProjectStore((s) => s.setProp);
  const renameNode = useProjectStore((s) => s.renameNode);
  // Édition en place (double-clic) : texte affiché ou nom de l’élément.
  const editing = useInlineEdit();
  const editingText = editing?.mode === "text" && editing.nodeId === node.id ? editing : null;
  const editingName = editing?.mode === "name" && editing.nodeId === node.id ? editing : null;
  const { overId, overKind, overValid } = useWorkspaceDnd();
  const showBoxes = useShowBoxes();
  const look = usePreviewAppearance();
  // Re-rendu quand la taille du texte simulée ou les ressources du jeu changent.
  usePreviewFontScale();
  useGameAssetsVersion();
  const menuTargetNodeId = useMenuTargetNodeId();
  const { catalog } = useCatalog();
  const catalogSlotNames = slotFieldsForType(node.type, catalog).map((f) => f.name);
  // Onglet affiché (store partagé avec l’export PNG).
  const storedTabIndex = usePreviewTabsStore((s) => s.active[node.id] ?? 0);
  const setActiveTabIndex = (i: number) => usePreviewTabsStore.getState().setActive(node.id, i);

  // Étirement dans le layout parent (gravity, voir layoutGravity.ts).
  const parentLayout = useContext(ParentLayoutContext);

  const dropData: PreviewDropData = { previewNodeId: node.id, parentAxis: parentLayout };
  const { setNodeRef: setDropRef } = useDroppable({
    id: `preview-drop-${node.id}`,
    data: dropData,
  });
  // Glisser un élément de l’aperçu pour le déplacer (pas la racine).
  const dragData: TreeDragData = { source: "tree", nodeId: node.id };
  const {
    setNodeRef: setDragRef,
    listeners: dragListeners,
    isDragging,
  } = useDraggable({
    id: `preview-drag-${node.id}`,
    data: dragData,
    disabled: node.id === screen.root.id || !!node.locked,
  });
  const elRef = useRef<HTMLElement | null>(null);
  const setNodeRef = (el: HTMLElement | null) => {
    elRef.current = el;
    setDropRef(el);
    setDragRef(el);
  };
  // Taille naturelle (contenu) sur l’axe du layout parent, mesurée après rendu.
  const [naturalMain, setNaturalMain] = useState<number | null>(null);

  // État en cours d’édition dans l’inspecteur (Survol, Pressé…) pour ce nœud.
  const previewState = useStylePreviewStore((s) => (s.nodeId === node.id ? s.state : null));
  const resolved = resolveStyles(project, screen, node, previewState);
  const styleCss = stylePropsToCss(resolved);

  // Surfaces du jeu : images 9-patch (`backgroundImage1`, `borderImage`)
  // teintées par `backgroundColor1` / `borderColor`, sous le contenu ; elles
  // remplacent alors le fond et le contour CSS de repli.
  const raw = resolved as Record<string, unknown>;
  const assets = hasGameAssets();
  const surfaceSpec = assets ? asNinePatch(raw.backgroundImage1) : null;
  const contourSpec = assets ? asNinePatch(raw.borderImage) : null;
  const surfaceColor = colorToRgba(raw.backgroundColor1 ?? raw.backgroundColor, paletteLookup);
  const contourColor = colorToRgba(raw.borderColor, paletteLookup);
  const layers: ReactNode[] = [];
  if (surfaceSpec) {
    delete styleCss.backgroundColor;
    if (surfaceColor && (surfaceColor[3] ?? 1) > 0) {
      layers.push(<NinePatch key="surface" spec={surfaceSpec} color={surfaceColor} />);
    }
  }
  if (contourSpec) {
    delete styleCss.boxShadow;
    if (contourColor && (contourColor[3] ?? 1) > 0) {
      layers.push(<NinePatch key="contour" spec={contourSpec} color={contourColor} />);
    }
  }
  // Styles du jeu chargés : texte blanc par défaut (moteur), police Lato du jeu.
  const gameStyles = getActiveBaseStyles() !== null;

  // Un élément n’est jamais plus petit que son contenu (pas de rétrécissement
  // dans le layout parent) : c’est le parent qui grandit. Seule une taille
  // fixée (`size`) le borne, et son contenu est alors rogné (voir wrap).
  const layoutChild: CSSProperties = {};
  if (parentLayout) {
    layoutChild.flexShrink = 0;
    const main = parentLayout === "row" ? 0 : 1;
    const cross = main === 0 ? 1 : 0;
    const expands = expandsOnAxis(project, screen, node, main);
    // Éléments étirés côte à côte : la place se partage au prorata de leur
    // taille naturelle (facteur d’étirement = cette taille, base = contenu),
    // comme en jeu — mesuré le 2026-10-18 : une List de contenu 176 px et une
    // box de bouton de 62 px reçoivent 512 et 180 px sur 692 (×2,9 chacune).
    if (expands) layoutChild.flex = `${naturalMain ?? 1} 1 auto`;
    // Conteneur défilant (ou layout qui en contient un) : il peut descendre
    // sous la taille de son contenu, la place manquante devient du défilement.
    // Base `auto` : taille du contenu tant que le parent n’est pas borné
    // (fenêtre sans taille fixée), réduction seulement quand il l’est.
    if (shrinksOnAxis(project, screen, node, main)) {
      layoutChild.flexShrink = 1;
      if (main === 0) layoutChild.minWidth = 0;
      else layoutChild.minHeight = 0;
    }
    if (shrinksOnAxis(project, screen, node, cross)) {
      if (cross === 0) layoutChild.minWidth = 0;
      else layoutChild.minHeight = 0;
    }
    layoutChild.alignSelf = expandsOnAxis(project, screen, node, cross)
      ? "stretch"
      : alignForGravity(effectiveGravity(project, screen, node)[cross]);
    // Axe principal : la place libre va d’abord aux éléments étirés
    // (flex-grow) ; sans élément étiré, elle se répartit autour de chaque
    // élément, quelle que soit sa gravity (comme Qt). Constaté en jeu : bouton
    // seul centré dans une box verticale étirée (2026-10-18) ; boutons et
    // textes de gravity 0 répartis sur toute la largeur d’une ligne étirée
    // (banc 2, 2026-10-18). Marges `auto` des deux côtés. Pas dans la zone de
    // contenu de la fenêtre, alignée en haut à gauche en jeu (contenu à
    // y = 44, mesuré 2026-10-17) — sauf fenêtre `compact`, dont le contenu
    // est centré en hauteur (constaté en jeu, banc 3, 2026-10-18).
    const compactWindow =
      screen.root.props.compact?.kind === "literal" && screen.root.props.compact.value === true;
    const inWindowContent =
      screen.root.type === "Window" &&
      !compactWindow &&
      (screen.root.slots.content ?? []).some((c) => c.id === node.id);
    if (!expands && !inWindowContent && styleCss.margin === undefined) {
      const [start, end] = main === 0 ? (["marginLeft", "marginRight"] as const) : (["marginTop", "marginBottom"] as const);
      layoutChild[start] = "auto";
      layoutChild[end] = "auto";
    }
  }
  // Mesure de la taille naturelle (largeur ou hauteur `max-content`, hors
  // flex) d’un élément étiré ; offsetWidth/Height ignorent le zoom de
  // l’aperçu. Mise à jour seulement si elle change (pas de boucle).
  const measuresNatural = parentLayout !== null && layoutChild.flex !== undefined;
  // Chaque rendu : le contenu (texte, enfants) peut changer sans que ces
  // dépendances changent ; la mise à jour n’a lieu que si la mesure change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = elRef.current;
    if (!el || !measuresNatural) return;
    const prop = parentLayout === "row" ? "width" : "height";
    const prevSize = el.style[prop];
    const prevFlex = el.style.flex;
    el.style.flex = "none";
    el.style[prop] = "max-content";
    const size = Math.max(1, Math.round(prop === "width" ? el.offsetWidth : el.offsetHeight));
    el.style[prop] = prevSize;
    el.style.flex = prevFlex;
    if (size !== naturalMain) setNaturalMain(size);
  });
  // Export PNG : rendu du jeu seul, sans aides de l’éditeur.
  const exporting = useContext(PreviewExportContext);
  const selected = !exporting && selectedNodeId === node.id;
  // Étiquette du nœud sélectionné (14 px au-dessus) : à l’intérieur si un
  // ancêtre qui rogne (overflow) la couperait.
  const [labelInside, setLabelInside] = useState(false);
  const showsLabel = selected || editingName !== null;
  useLayoutEffect(() => {
    const el = elRef.current;
    if (!el || !showsLabel) return;
    const top = el.getBoundingClientRect().top;
    // 14 px d’étiquette, à l’échelle de l’aperçu (zoom).
    const labelHeight = 14 * (el.getBoundingClientRect().height / Math.max(1, el.offsetHeight));
    let inside = false;
    for (let a = el.parentElement; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowY !== "visible" && top - labelHeight < a.getBoundingClientRect().top) {
        inside = true;
        break;
      }
      if (cs.position === "absolute") break; // la fenêtre : au-delà, rien ne rogne
    }
    if (inside !== labelInside) setLabelInside(inside);
  }, [showsLabel, labelInside, project]);
  // Menu contextuel ouvert : seul l’élément visé reste surligné.
  const hovered =
    !exporting && (menuTargetNodeId ? menuTargetNodeId === node.id : hoveredNodeId === node.id);
  const dropHere = !exporting && overId === node.id ? overKind : null;

  if (node.hidden) {
    return null;
  }

  const base: CSSProperties = {
    boxSizing: "border-box",
    position: "relative",
    fontFamily: gameFontsLoaded() ? `"${GAME_FONT_FAMILY}", ${previewTheme.fontFamily}` : previewTheme.fontFamily,
    color: gameStyles ? "#fff" : previewTheme.text,
    // Avec les styles du jeu, la taille vient des règles (font_scaling) ;
    // sinon, repli du thème.
    fontSize: gameStyles ? undefined : fontSizeForClasses(node.meta.class),
    lineHeight: "normal",
    // Sélection : contour épais ; survol : contour fin + remplissage
    // (overlay) ; option « Box » : contour fin partout. Couleurs réglables
    // (Affichage › Réglages de l’aperçu). Tracés à l’intérieur de la boîte
    // (décalage négatif) : un contour ne déborde jamais sur un voisin ou sur
    // le parent ; deux bords qui se touchent partagent la même ligne.
    outline: selected
      ? `${look.selectedWidth}px solid ${rgbaCss(look.selectedOutline)}`
      : hovered
        ? `1px solid ${rgbaCss(look.hoverOutline)}`
        : (showBoxes || highlighted) && !exporting
          ? `1px solid ${rgbaCss(highlighted ? look.hoverOutline : look.boxOutline)}`
          : undefined,
    outlineOffset: selected ? -look.selectedWidth : -1,
    opacity: isDragging ? 0.4 : undefined,
    ...layoutChild,
    ...styleCss,
  };


  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    setSelection(screen.id, node.id);
  };
  const onEnter = () => setHovered(node.id);
  const onLeave = () => {
    if (useProjectStore.getState().hoveredNodeId === node.id) {
      setHovered(null);
    }
  };

  const wrap = (
    content: ReactNode,
    extra?: CSSProperties,
    /** Axe offert aux enfants (layouts seulement). */
    childLayout: "row" | "column" | null = null,
  ) => {
    const style: CSSProperties = { ...base, ...extra };
    // Réduction sous le contenu (zone défilante) : un `minHeight: undefined`
    // du rendu (cas vide) ne doit pas l’annuler.
    if (style.minWidth === undefined && layoutChild.minWidth !== undefined) style.minWidth = layoutChild.minWidth;
    if (style.minHeight === undefined && layoutChild.minHeight !== undefined) style.minHeight = layoutChild.minHeight;
    // Surfaces du jeu dessinées sous le contenu (z-index -1 dans ce contexte).
    if (layers.length > 0) style.isolation = "isolate";
    // Taille fixée : limite stricte, rien ne déborde sur les voisins.
    const fixed = style.width !== undefined || style.height !== undefined;
    if (fixed && style.overflow === undefined) style.overflow = "clip";
    return (
      <div
        ref={setNodeRef}
        data-node-id={node.id}
        style={style}
        {...dragListeners}
        onClick={onClick}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (exporting) return;
          setSelection(screen.id, node.id);
          startInlineEdit(inlineEditTarget(node));
        }}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setSelection(screen.id, node.id);
          onNodeContextMenu?.(e, node.id);
        }}
      >
        {layers}
        <PreviewOverlay
          hovered={hovered && !dropHere}
          hoverFill={rgbaCss(look.hoverFill)}
          drop={dropHere}
          dropValid={overValid}
          axis={parentLayout}
        />
        {selected || editingName ? (
          <span
            style={{
              position: "absolute",
              // Rognée hors d’une boîte de taille fixée, ou par une zone qui
              // rogne au-dessus (contenu de fenêtre fixée, List) : à l’intérieur.
              top: fixed || labelInside ? 0 : -14,
              left: 0,
              fontSize: 10,
              background: previewTheme.accent,
              color: "#fff",
              padding: "0 4px",
              borderRadius: 2,
              zIndex: 2,
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <ComponentIcon type={node.type} orientation={node.props.orientation} size={10} />
            {node.type}
            {editingName ? (
              <>
                {" · "}
                <InlineInput
                  initial={editingName.value}
                  onCommit={(v) => {
                    if (v.trim()) renameNode(node.id, v.trim());
                    stopInlineEdit();
                  }}
                  onCancel={stopInlineEdit}
                  style={{ color: "#fff", background: "rgba(0, 0, 0, 0.35)", outline: "none" }}
                />
              </>
            ) : node.name && node.name !== node.type ? (
              ` · ${node.name}`
            ) : (
              ""
            )}
          </span>
        ) : null}
        <ParentLayoutContext.Provider value={childLayout}>{content}</ParentLayoutContext.Provider>
      </div>
    );
  };

  /** Texte affiché, ou champ d’édition en place pendant un double-clic. */
  const shownText = (fallback: string, prop = "text"): ReactNode =>
    editingText ? (
      <InlineInput
        initial={editingText.value}
        onCommit={(v) => {
          setProp(node.id, editingText.prop, { kind: "literal", value: v });
          stopInlineEdit();
        }}
        onCancel={stopInlineEdit}
      />
    ) : (
      resolveStringProp(node.props[prop], screen, stateSim, fallback)
    );

  const hasChildren = Object.values(node.slots).some((children) => children.some((c) => !c.hidden));
  const kids = (...slots: string[]) =>
    renderSlots(project, screen, node, slots, stateSim, onNodeContextMenu);
  const kidsFromCatalog = () =>
    kids(...(catalogSlotNames.length > 0 ? catalogSlotNames : Object.keys(node.slots)));

  switch (node.type) {
    case "Window": {
      const title = resolveStringProp(node.props.title, screen, stateSim, t("defaults.windowTitle"));
      const ix = resolveNumberProp(node.props.initialX, screen, stateSim, 0.1);
      const iy = resolveNumberProp(node.props.initialY, screen, stateSim, 0.1);
      const closable = resolveBoolProp(node.props.closable, screen, stateSim, false);
      const pinnable = resolveBoolProp(node.props.pinnable, screen, stateSim, false);
      const noCloseButton = (node.meta.class ?? []).includes("no-close-button");
      const hasHeader = (node.slots.header ?? []).some((c) => !c.hidden);
      const compact = resolveBoolProp(node.props.compact, screen, stateSim, false);
      // Titre dessiné par le moteur : texte `font-scale-title-2` (taille
      // constatée en jeu), `Window::Title { padding 4, margin 4 }`.
      const titleCss = gameStyles
        ? stylePropsToCss(gameTextStyle(screen, [node], ["font-scale-title-2"]))
        : { fontSize: 13, fontWeight: 600 };
      // Ombre portée du jeu (`shadowNinePatch`, `shadowWidth` hors de la fenêtre).
      const shadowSpec = assets ? asNinePatch(raw.shadowNinePatch) : null;
      const shadowColor = colorToRgba(raw.shadowColor, paletteLookup);
      const shadowWidth = Array.isArray(raw.shadowWidth) ? (raw.shadowWidth as number[]) : [32, 32, 32, 32];
      // `<fenêtre> Window::Content` : marges de la zone de contenu seule.
      const contentCss = stylePropsToCss(windowContentStyle(project, screen, node));
      const fixedWindow = styleCss.height !== undefined || styleCss.width !== undefined;
      return wrap(
        <>
          {shadowSpec && shadowColor ? (
            <NinePatch spec={shadowSpec} color={shadowColor} outset={shadowWidth} />
          ) : null}
          {/* Barre de titre : pas de fond distinct (surface de la fenêtre) ;
              titre étiré, bouton fermer collé en haut à droite. */}
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            <div
              style={{
                flex: "1 1 auto",
                minWidth: 0,
                padding: 4,
                margin: 4,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                ...titleCss,
                // En-tête à sa taille naturelle, calé à gauche (constaté en jeu).
                ...(hasHeader ? { display: "flex", alignItems: "center", gap: 14 } : {}),
              }}
            >
              {/* Barre de titre (constaté en jeu, banc 3) : `header` avant le
                  titre ; `compact = true` masque le titre. */}
              {hasHeader ? kids("header") : null}
              {compact ? null : editingText ? shownText(t("defaults.windowTitle"), "title") : <span>{title}</span>}
            </div>
            {/* `pinnable` : punaise en haut à droite (constaté en jeu, banc 2). */}
            {pinnable ? (
              <Pin size={16} aria-hidden style={{ margin: "10px 6px 0 0", flex: "0 0 auto", color: "#fff" }} />
            ) : null}
            {/* `Window!no-close-button … Button!close { visibility = "none" }` (builtin.css.lua). */}
            {closable && !noCloseButton ? <WindowCloseButton /> : null}
          </div>
          {/* Zone de contenu : le contenu s’y étire selon sa gravity. Aucune
              marge intérieure dans les feuilles de base du jeu (constaté en
              jeu) ; le mod la règle par `Window!<classe> Window::Content`. */}
          <div
            style={{
              padding: contentCss.padding,
              margin: contentCss.margin,
              // Hauteur minimale seulement à vide (cible de dépôt visible).
              // Fenêtre de taille fixée : le contenu est rogné (l’ombre,
              // dessinée sur la Window, ne l’est pas) et les zones défilantes
              // se réduisent à la place disponible.
              minHeight: hasChildren ? (fixedWindow ? 0 : undefined) : 80,
              minWidth: fixedWindow ? 0 : undefined,
              overflow: fixedWindow ? "hidden" : undefined,
              flex: "1 1 auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
            }}
          >
            <ParentLayoutContext.Provider value="column">
              {kids("content")}
            </ParentLayoutContext.Provider>
          </div>
        </>,
        {
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: `${ix * 100}%`,
          top: `${iy * 100}%`,
          // Fond et contour : surfaces du jeu (images teintées) si
          // disponibles, sinon styles résolus, sinon thème.
          backgroundColor: styleCss.backgroundColor ?? (surfaceSpec ? undefined : previewTheme.surface),
          border: styleCss.boxShadow || contourSpec ? undefined : `1px solid ${previewTheme.border}`,
          borderRadius: surfaceSpec ? undefined : 4,
          // Sans taille fixée, la fenêtre s’agrandit pour contenir son contenu.
          minWidth: styleCss.width === undefined ? 520 : undefined,
          boxShadow: shadowSpec
            ? styleCss.boxShadow
            : [styleCss.boxShadow, "0 8px 24px rgba(0,0,0,0.35)"].filter(Boolean).join(", "),
          width: styleCss.width,
          height: styleCss.height,
          // L’ombre déborde de la fenêtre : pas de rognage.
          overflow: "visible",
        },
      );
    }
    case "BoxLayout":
    case "FlowLayout": {
      const orient = resolveStringProp(
        node.props.orientation,
        screen,
        stateSim,
        "Orientation.Vertical",
      );
      // FlowLayoutParam n’a pas d’orientation : en ligne, retour à la ligne
      // (constaté en jeu, banc 2026-10-18).
      const vertical = node.type === "BoxLayout" && orient.includes("Vertical");
      return wrap(
        <>{kidsFromCatalog()}</>,
        {
          display: "flex",
          flexDirection: vertical ? "column" : "row",
          flexWrap: node.type === "FlowLayout" ? "wrap" : undefined,
          // Pas d’étirement implicite : chaque enfant suit sa gravity.
          alignItems: "flex-start",
          // Aucune hauteur minimale dans le jeu : seulement à vide et en
          // édition, pour garder une cible de dépôt visible (vide, la box ne
          // s’étire pas, comme en jeu : voir `isEmptyLayout`).
          minHeight: hasChildren || exporting ? undefined : 24,
        },
        vertical ? "column" : "row",
      );
    }
    case "ScrollArea": {
      // builtin.css.lua : aucun fond ; `ScrollArea::Content::Layout`
      // s’étire en largeur. Défilement selon `horizontalPolicy` / `verticalPolicy`.
      const policies = scrollPolicies(node)!;
      return wrap(
        <ScrollBox
          vertical
          overflowX={overflowForPolicy(policies.x)}
          overflowY={overflowForPolicy(policies.y)}
          reserveX={policies.x === "AsNeededButAlwaysReserveSpace"}
          reserveY={policies.y === "AsNeededButAlwaysReserveSpace"}
          emptyLabel={!hasChildren && !exporting ? t("previewNode.emptyScroll", { type: node.type }) : null}
        >
          {kidsFromCatalog()}
        </ScrollBox>,
        { display: "flex", flexDirection: "column", minHeight: hasChildren ? undefined : 60 },
      );
    }
    case "Component":
      return wrap(
        <>{kidsFromCatalog()}</>,
        {
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          // Aucun fond ni taille minimale en jeu (pas de règle `Component`
          // dans les feuilles de base) : un Component vide est un espaceur
          // (`!horizontal-spacer` / `!vertical-spacer`, `default.css.lua`).
          // En édition seulement, 8 px pour rester visible et sélectionnable.
          minHeight: hasChildren || exporting ? undefined : 8,
          minWidth: hasChildren || exporting ? undefined : 8,
        },
        "column",
      );
    case "AbsoluteLayout":
      // Enfants superposés dans une même cellule, à gauche et centrés en
      // hauteur ; aucun fond (capture du banc, 2026-10-18 : seul le dernier
      // enfant, un bouton, reste visible). AbsoluteLayoutChildParam n’a aucune
      // position (builtin.d.tl) : approximation.
      return wrap(<>{kidsFromCatalog()}</>, {
        display: "grid",
        minHeight: hasChildren || exporting ? undefined : 24,
      });
    case "AbsoluteLayoutChild":
      return wrap(<>{kidsFromCatalog()}</>, { gridArea: "1 / 1", alignSelf: "center", justifySelf: "start" });
    case "FloatingLayout":
      // Enfants superposés dans une même cellule (FloatingLayoutChild), sans
      // fond ; taille = le plus grand enfant.
      return wrap(<>{kidsFromCatalog()}</>, {
        display: "grid",
        minHeight: hasChildren || exporting ? undefined : 24,
      });
    case "FloatingLayoutChild": {
      // `h` / `v` (FloatingLayoutChildParam) : comme une gravity, -1 remplit,
      // 0 début, 0.5 centre, 1 fin (usage vanilla : -1/-1 85 fois, coins et
      // centre). Absents (77 fois en vanilla) : supposé -1 (à vérifier).
      const place = (key: "h" | "v") => {
        const g = resolveNumberProp(node.props[key], screen, stateSim, -1);
        return g < 0 ? "stretch" : g >= 0.75 ? "end" : g >= 0.25 ? "center" : "start";
      };
      return wrap(
        <>{kidsFromCatalog()}</>,
        {
          gridArea: "1 / 1",
          justifySelf: place("h"),
          alignSelf: place("v"),
          display: "flex",
          flexDirection: "column",
        },
        "column",
      );
    }
    case "TableLayout": {
      // Colonnes alignées sur toutes les lignes. Constaté en jeu (banc 2,
      // 2026-10-18) : sans `columnWeights`, la place se partage au prorata des
      // largeurs naturelles (approximé par `auto`) ; `{ 1, 1, 1 }` : colonnes
      // égales, contenu rogné au besoin ; -1 = largeur naturelle.
      const rows = node.slots.rows ?? [];
      const columns = Math.max(1, ...rows.map((r) => (r.slots.cells ?? []).length));
      const weightsProp = node.props.columnWeights;
      const weights =
        weightsProp?.kind === "literal" && Array.isArray(weightsProp.value) ? (weightsProp.value as number[]) : [];
      const template = Array.from({ length: columns }, (_, i) => {
        const w = weights[i];
        if (typeof w !== "number") return weights.length ? "max-content" : "auto";
        return w > 0 ? `minmax(0, ${w}fr)` : "max-content";
      }).join(" ");
      return wrap(<>{kidsFromCatalog()}</>, { display: "grid", gridTemplateColumns: template, alignItems: "center" });
    }
    case "Row":
      // Les cellules se placent directement dans la grille du TableLayout.
      return wrap(<>{kidsFromCatalog()}</>, { display: "contents" });
    case "TextView":
    case "RichTextView": {
      // `textAlignment = { x, y }` : x par `text-align` (styleToCss), y en
      // plaçant le texte dans la hauteur de la boîte (0 haut, 0.5, 1 bas).
      // Sans `textAlignment`, le texte d’une TextView est centré en hauteur
      // dans sa boîte, même étirée par `gravity -1` (constaté en jeu, 2026-10-18).
      const align = Array.isArray(raw.textAlignment) ? (raw.textAlignment as unknown[]) : null;
      const y = typeof align?.[1] === "number" ? align[1] : node.type === "TextView" ? 0.5 : null;
      const vertical: CSSProperties | undefined =
        y !== null && y >= 0
          ? {
              display: "flex",
              flexDirection: "column",
              justifyContent: y >= 0.75 ? "flex-end" : y >= 0.25 ? "center" : "flex-start",
            }
          : undefined;
      // RichTextView : retours à la ligne conservés, markdown non interprété
      // (`isMarkdown = true` affiché brut ; constaté en jeu, banc 2026-10-18).
      const lines: CSSProperties | undefined = node.type === "RichTextView" ? { whiteSpace: "pre-line" } : undefined;
      return wrap(<span style={lines}>{shownText(t("previewNode.placeholderText"))}</span>, vertical);
    }
    case "ImageView": {
      // Image du jeu (`path`), teintée par la couleur résolue (blanc par
      // défaut : masques du jeu) ; taille : style `size`, sinon taille
      // d’interface de l’image. La prop `size` (Vec2i) décrit les pixels de
      // `data` / `data_native`, pas l’affichage (constaté en jeu, banc 3).
      const pathProp = node.props.path;
      const imagePath = pathProp?.kind === "literal" && typeof pathProp.value === "string" ? pathProp.value : null;
      const tint = colorToRgba(raw.color, paletteLookup) ?? [1, 1, 1, 1];
      const w = typeof styleCss.width === "number" ? styleCss.width : undefined;
      const h = typeof styleCss.height === "number" ? styleCss.height : undefined;
      return wrap(<GameImageView path={imagePath} color={tint} width={w} height={h} />, { color: undefined });
    }
    case "Button":
    case "TextButton":
    case "ToggleButton":
    case "ToolButton":
      // builtin.css.lua : la surface (9-patch `default_surface.tga`) couvre
      // tout le bouton, `padding = {8, 8, 8, 8}` compris ; `Button::Layout`
      // s’étire (`gravity {-1, -1}`) et centre ses enfants (`{0.5, 0.5}`).
      // Pas de boîte intérieure : elle tassait le bouton dans son élément.
      return wrap(
        <>
          {node.type === "TextButton" || node.type === "ToolButton" ? shownText(t("previewNode.placeholderButton")) : null}
          {kidsFromCatalog()}
        </>,
        {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          padding: styleCss.padding ?? 8,
          // Bouton vide : 24 px de haut en jeu (padding 8 + 8, contenu vide
          // de 8 px ; constaté 2026-10-17).
          minHeight: hasChildren ? undefined : 24,
          minWidth: hasChildren ? undefined : 24,
          // Surfaces du jeu disponibles : elles seules dessinent le bouton
          // (transparent sans classe, comme en jeu) ; sinon repli du thème.
          backgroundColor: surfaceSpec ? undefined : (styleCss.backgroundColor ?? previewTheme.surfaceAlt),
          boxShadow: contourSpec
            ? undefined
            : (styleCss.boxShadow ?? `inset 0 0 0 1px ${previewTheme.border}`),
          borderRadius: surfaceSpec ? undefined : 3,
        },
        "row",
      );
    case "CheckBox": {
      // `moveBoxRight` : case après le libellé (constaté en jeu, banc 2026-10-18).
      const boxRight = resolveBoolProp(node.props.moveBoxRight, screen, stateSim, false);
      const box = (
        <input
          type="checkbox"
          readOnly
          // CheckBoxParam : value / initialValue entiers, 1 = cochée, 0 = non,
          // -1 = indéterminée (builtin.lua) ; ancien booléen toléré.
          checked={checkBoxState(node, screen, stateSim) === 1}
          ref={(el) => {
            if (el) el.indeterminate = checkBoxState(node, screen, stateSim) === -1;
          }}
        />
      );
      return wrap(
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          {boxRight ? null : box}
          {resolveStringProp(node.props.label, screen, stateSim, "")}
          {boxRight ? box : null}
          {kidsFromCatalog()}
        </label>,
      );
    }
    case "ComboBox": {
      // Fermée : seul l’élément dont la `value` est celle de la ComboBox est
      // affiché ; sans valeur, rien (constaté en jeu, banc 2026-10-18).
      const selected = resolvePropValue(node.props.value, screen, stateSim);
      const item = (node.slots.items ?? []).find((it) => {
        const v = resolvePropValue(it.props.value, screen, stateSim);
        return selected !== undefined && v === selected;
      });
      return wrap(
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 6,
            padding: "4px 8px",
            background: previewTheme.surfaceAlt,
            borderRadius: 3,
            minWidth: 80,
            minHeight: 24,
          }}
        >
          <span>{item ? renderSlots(project, screen, item, ["content"], stateSim) : null}</span>
          <span aria-hidden>▾</span>
        </div>,
      );
    }
    case "ComboBoxItem":
      return wrap(<div style={{ padding: "2px 4px" }}>{kidsFromCatalog()}</div>);
    case "Slider":
    case "ProgressBar": {
      // Piste centrée dans la hauteur de l’élément (constaté en jeu) ; la
      // ProgressBar remplit sa hauteur (`size = {-1, 20}`).
      const vertical =
        node.type === "Slider" &&
        node.props.horizontal?.kind === "literal" &&
        node.props.horizontal.value === false;
      const bar = node.type === "ProgressBar";
      // Remplissage : ProgressBar `value` (0..1) ; Slider (valeur − min) / (max − min),
      // valeur = `value`, sinon `initialValue`.
      const num = (key: string, fallback: number) => resolveNumberProp(node.props[key], screen, stateSim, fallback);
      const ratio = bar
        ? num("value", 0)
        : (() => {
            const min = num("min", 0);
            const max = num("max", 100);
            const v = node.props.value ? num("value", min) : num("initialValue", min);
            return max > min ? (v - min) / (max - min) : 0;
          })();
      const fill = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`;
      return wrap(
        <div
          style={{
            height: vertical ? "100%" : bar ? "100%" : 8,
            width: vertical ? 8 : undefined,
            minHeight: vertical ? 80 : 8,
            // ProgressBar : aucune largeur naturelle en jeu (invisible dans une
            // cellule ou à côté d’un Slider étiré ; banc 2026-10-18).
            minWidth: vertical || bar ? undefined : 80,
            background: previewTheme.border,
            borderRadius: 4,
            overflow: "hidden",
            display: "flex",
            flexDirection: vertical ? "column-reverse" : "row",
          }}
        >
          <div
            style={{
              [vertical ? "height" : "width"]: fill,
              [vertical ? "width" : "height"]: "100%",
              background: bar && styleCss.color ? styleCss.color : previewTheme.accent,
            }}
          />
        </div>,
        {
          display: "flex",
          flexDirection: vertical ? "row" : "column",
          justifyContent: "center",
          // `color` d’une ProgressBar = couleur de la barre, pas du texte.
          color: bar ? undefined : styleCss.color,
        },
      );
    }
    case "TextInputField":
    case "DoubleSpinBox": {
      // En jeu, le fond du champ couvre toute la hauteur de l’élément étiré ;
      // seul le texte saisi est centré verticalement (constaté 2026-10-17).
      // DoubleSpinBox : valeur affichée arrondie à l’entier (42.5 → « 43 »,
      // constaté en jeu, banc 2026-10-18 ; aucun réglage de décimales connu).
      const spinValue = node.type === "DoubleSpinBox" ? resolvePropValue(node.props.value, screen, stateSim) : undefined;
      return wrap(
        <input
          readOnly
          // Texte indicatif affiché tant que le champ est vide (constaté en jeu).
          placeholder={resolveStringProp(node.props.placeholderText, screen, stateSim, "")}
          value={
            typeof spinValue === "number"
              ? String(Math.round(spinValue))
              : resolveStringProp(node.props.text ?? node.props.value, screen, stateSim, "")
          }
          style={{
            background: "transparent",
            border: "none",
            outline: "none",
            color: "inherit",
            padding: 0,
            width: "100%",
            font: "inherit",
          }}
        />,
        {
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          // Repli sur le thème si les styles du jeu ne sont pas chargés.
          backgroundColor: styleCss.backgroundColor ?? previewTheme.bg,
          border: styleCss.boxShadow ? undefined : `1px solid ${previewTheme.border}`,
          padding: styleCss.padding ?? "4px 6px",
          minHeight: styleCss.minHeight ?? 24,
        },
      );
    }
    case "List": {
      // builtin.css.lua : aucun fond (constaté en jeu, 2026-10-18) ;
      // `List::Content::Layout { gravity { -1, 0 } }` : les éléments s’étirent
      // sur l’axe transverse. Défilement selon les politiques de la List.
      const policies = scrollPolicies(node)!;
      const orient = resolveStringProp(node.props.orientation, screen, stateSim, "Orientation.Vertical");
      return wrap(
        <ScrollBox
          vertical={!orient.includes("Horizontal")}
          overflowX={overflowForPolicy(policies.x)}
          overflowY={overflowForPolicy(policies.y)}
          reserveX={policies.x === "AsNeededButAlwaysReserveSpace"}
          reserveY={policies.y === "AsNeededButAlwaysReserveSpace"}
          emptyLabel={!hasChildren && !exporting ? t("previewNode.emptyScroll", { type: node.type }) : null}
        >
          {kidsFromCatalog()}
        </ScrollBox>,
        { display: "flex", flexDirection: "column", minHeight: hasChildren ? undefined : 60 },
      );
    }
    case "TabWidget": {
      const tabs = node.slots.tabs ?? [];
      // Élément sélectionné (arbre) dans un autre onglet : cet onglet s’affiche,
      // dans l’aperçu comme à l’export (même sélection, même image).
      const selectedTab = selectedNodeId ? tabs.findIndex((tab) => containsNode(tab, selectedNodeId)) : -1;
      const wanted = selectedTab >= 0 ? selectedTab : storedTabIndex;
      const active = tabs.length === 0 ? 0 : Math.min(Math.max(0, wanted), tabs.length - 1);
      const activeTab = tabs[active];
      return wrap(
        <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div
            style={{
              display: "flex",
              gap: 2,
              borderBottom: `1px solid ${previewTheme.border}`,
            }}
          >
            {tabs.map((tab, i) => (
              <div
                key={tab.id}
                style={{
                  padding: "4px 10px",
                  background: i === active ? previewTheme.surface : previewTheme.bg,
                  border: `1px solid ${previewTheme.border}`,
                  borderBottom: "none",
                  fontSize: 12,
                  cursor: "pointer",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTabIndex(i);
                  setSelection(screen.id, tab.id);
                }}
              >
                {/* L’onglet n’affiche que son indicateur (TabWidgetChildParam : ni title ni text). */}
                {renderSlots(project, screen, tab, ["indicator"], stateSim)}
              </div>
            ))}
          </div>
          {/* `TabWidget::Content { gravity { -1, -1 }, padding 8 }` : la zone
              remplit l’onglet et son contenu la remplit (constaté en jeu). */}
          <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", padding: 8, minHeight: 0 }}>
            <ParentLayoutContext.Provider value="column">
              {activeTab ? renderSlots(project, screen, activeTab, ["item"], stateSim) : null}
            </ParentLayoutContext.Provider>
          </div>
        </div>,
        { background: previewTheme.surface, minHeight: 80, display: "flex", flexDirection: "column" },
      );
    }
    case "TabWidgetChild":
      return wrap(<>{kidsFromCatalog()}</>);
    case "ContentCard":
      return wrap(
        <>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            {resolveStringProp(node.props.title, screen, stateSim, t("previewNode.placeholderCard"))}
          </div>
          {kidsFromCatalog()}
        </>,
        {
          background: previewTheme.surfaceAlt,
          border: `1px solid ${previewTheme.border}`,
          borderRadius: 4,
          padding: 10,
        },
      );
    case "ToggleButtonGroup":
      return wrap(<>{kidsFromCatalog()}</>, { display: "flex", gap: 4 });
    default:
      return wrap(
        <>
          <div
            style={{
              background: previewTheme.fallbackBg,
              border: `1px dashed ${previewTheme.border}`,
              color: previewTheme.textMuted,
              padding: 8,
              fontSize: 12,
            }}
          >
            {node.type}
          </div>
          {kidsFromCatalog()}
        </>,
      );
  }
}

/** Survol (remplissage bleu) et zone de dépôt, sans toucher à la mise en page. */
/** RGBA 0..1 → couleur CSS. */
function rgbaCss(c: number[]): string {
  const [r = 0, g = 0, b = 0, a = 1] = c;
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
}

function PreviewOverlay({
  hovered,
  hoverFill,
  drop,
  dropValid,
  axis,
}: {
  hovered: boolean;
  hoverFill: string;
  drop: "before" | "after" | "into" | null;
  dropValid: boolean;
  axis: "row" | "column" | null;
}) {
  if (!hovered && !drop) return null;
  const color = drop && !dropValid ? previewTheme.dropInvalid : previewTheme.accent;
  const style: CSSProperties = {
    position: "absolute",
    pointerEvents: "none",
    zIndex: 1,
  };
  if (!drop) {
    Object.assign(style, { inset: 0, background: hoverFill });
  } else if (drop === "into") {
    Object.assign(style, {
      inset: 0,
      background: dropValid ? hoverFill : previewTheme.dropInvalidFill,
      outline: `2px dashed ${color}`,
      outlineOffset: -2,
    });
  } else {
    // Barre d’insertion avant / après, le long de l’axe du layout parent.
    const edge =
      axis === "row"
        ? drop === "before"
          ? "left"
          : "right"
        : drop === "before"
          ? "top"
          : "bottom";
    const across =
      axis === "row" ? { top: 0, bottom: 0, width: 3 } : { left: 0, right: 0, height: 3 };
    // À l’intérieur de l’élément, pour ne pas déborder sur le voisin.
    Object.assign(style, across, { [edge]: 0, background: color, borderRadius: 2 });
  }
  return <span style={style} />;
}
