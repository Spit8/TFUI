import { useCallback, useState } from "react";
import { isTextFieldTarget } from "./nativeMenu";
import type { MenuItem } from "./types";

export interface ContextMenuState {
  x: number;
  y: number;
  items: MenuItem[];
  /** Document de l’élément cliqué (fenêtre principale ou détachée). */
  doc: Document;
}

function docOf(target: EventTarget | null): Document {
  const node = target as Node | null;
  return node?.ownerDocument ?? document;
}

export function useContextMenu() {
  const [state, setState] = useState<ContextMenuState | null>(null);

  const openAt = useCallback(
    (
      e: {
        clientX: number;
        clientY: number;
        target?: EventTarget | null;
        preventDefault?: () => void;
      },
      items: MenuItem[],
    ) => {
      e.preventDefault?.();
      setState({ x: e.clientX, y: e.clientY, items, doc: docOf(e.target ?? null) });
    },
    [],
  );

  const open = useCallback(
    (e: React.MouseEvent, items: MenuItem[] | (() => MenuItem[])) => {
      // Clic droit dans un champ texte : menu Couper / Copier / Coller
      // (voir nativeMenu), pas le menu de la ligne.
      if (isTextFieldTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const list = typeof items === "function" ? items() : items;
      if (list.length === 0) return;
      setState({
        x: e.clientX,
        y: e.clientY,
        items: list,
        doc: docOf(e.currentTarget ?? e.target),
      });
    },
    [],
  );

  const close = useCallback(() => setState(null), []);

  return { menu: state, open, openAt, close };
}
