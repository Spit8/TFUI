import { Check, ChevronRight } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ensureCommandsRegistered,
  getCommand,
  type CommandContext,
} from "../../app/commands";
import { resolveIconByLucideName } from "../resolveIcon";
import { ComponentIcon } from "../ComponentIcon";
import { COMPONENT_OVERRIDES } from "../../catalog/overrides";
import { commandLabel } from "../../app/commands/types";
import { clampMenuPosition, clampSubmenuPosition } from "./clampMenuPosition";
import { isMenuItemShown } from "./menuVisibility";
import type { MenuItem } from "./types";
import "./MenuList.css";

function formatShortcut(shortcut: string | undefined): string | null {
  if (!shortcut) return null;
  return shortcut
    .replace(/mod\+/gi, "Ctrl+")
    .replace(/shift\+/gi, "⇧")
    .replace(/alt\+/gi, "Alt+")
    .replace(/^up$/gi, "↑")
    .replace(/up$/gi, "↑")
    .replace(/down$/gi, "↓")
    .replace(/delete/gi, "Suppr");
}

function CommandIcon({ name }: { name: string }) {
  if (COMPONENT_OVERRIDES[name] || name === "BoxLayout") {
    return <ComponentIcon type={name} size={16} className="menu-item-icon" />;
  }
  const Icon = resolveIconByLucideName(name);
  return <Icon size={16} className="menu-item-icon" aria-hidden />;
}

/** `closest` sans `instanceof` : les nœuds d’une fenêtre détachée ont leur propre `Element`. */
function closestIn(target: EventTarget | null, selector: string): boolean {
  const el = target as Element | null;
  return Boolean(el && typeof el.closest === "function" && el.closest(selector));
}

export interface MenuListProps {
  items: MenuItem[];
  anchor: { x: number; y: number };
  ctx: CommandContext;
  onClose: () => void;
  mode?: "context" | "bar";
  /**
   * Document où afficher le menu : celui de l’élément cliqué (fenêtre
   * principale ou fenêtre détachée). Défaut : document principal.
   */
  doc?: Document;
}

/**
 * Menu flottant rendu par portail dans `doc.body`.
 *
 * Le portail est indispensable : dockview pose `contain: layout` et des
 * `transform` sur ses conteneurs, qui deviennent alors le repère d’un élément
 * `position: fixed` — le menu apparaissait décalé du pointeur.
 */
export function MenuList(props: MenuListProps) {
  ensureCommandsRegistered();
  const doc = props.doc ?? document;
  const shown = props.items.some((i) => isMenuItemShown(i, props.ctx));
  const { onClose } = props;
  useEffect(() => {
    // Rien d’utile à proposer : on n’affiche rien (jamais de boîte vide).
    if (!shown) onClose();
  }, [shown, onClose]);
  if (!shown) return null;
  return createPortal(<MenuListInner {...props} doc={doc} />, doc.body);
}

function MenuListInner({
  items,
  anchor,
  ctx,
  onClose,
  doc,
}: MenuListProps & { doc: Document }) {
  const view = doc.defaultView ?? window;
  const ref = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState<{
    x: number;
    y: number;
    maxHeight: number;
    ready: boolean;
  }>({ x: anchor.x, y: anchor.y, maxHeight: 400, ready: false });
  const [openSub, setOpenSub] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const clamped = clampMenuPosition(
      anchor,
      { width: rect.width, height: rect.height },
      { width: view.innerWidth, height: view.innerHeight },
    );
    setPos({
      x: clamped.x,
      y: clamped.y,
      maxHeight: clamped.maxHeight,
      ready: true,
    });
  }, [anchor, items, view]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    function onPointerDown(e: MouseEvent) {
      if (closestIn(e.target, ".menu-list")) return;
      onClose();
    }
    function onScrollClose(e: Event) {
      if (closestIn(e.target, ".menu-list")) return;
      onClose();
    }
    view.addEventListener("keydown", onKey);
    view.addEventListener("mousedown", onPointerDown, true);
    view.addEventListener("scroll", onScrollClose, true);
    view.addEventListener("blur", onClose);
    view.addEventListener("resize", onClose);
    return () => {
      view.removeEventListener("keydown", onKey);
      view.removeEventListener("mousedown", onPointerDown, true);
      view.removeEventListener("scroll", onScrollClose, true);
      view.removeEventListener("blur", onClose);
      view.removeEventListener("resize", onClose);
    };
  }, [onClose, view]);

  return (
    <ul
      ref={ref}
      className={`menu-list${pos.ready ? "" : " measuring"}`}
      style={{
        left: pos.x,
        top: pos.y,
        maxHeight: pos.maxHeight,
      }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => (
        <MenuRow
          key={i}
          item={item}
          ctx={ctx}
          view={view}
          openSub={openSub === i}
          onOpenSub={() => setOpenSub(i)}
          onCloseSub={() => setOpenSub(null)}
          onClose={onClose}
        />
      ))}
    </ul>
  );
}

function MenuRow({
  item,
  ctx,
  view,
  openSub,
  onOpenSub,
  onCloseSub,
  onClose,
}: {
  item: MenuItem;
  ctx: CommandContext;
  view: Window;
  openSub: boolean;
  onOpenSub: () => void;
  onCloseSub: () => void;
  onClose: () => void;
}) {
  const rowRef = useRef<HTMLLIElement>(null);
  const [nestedSub, setNestedSub] = useState<number | null>(null);

  if (item.type === "separator") {
    return <li className="menu-separator" role="separator" />;
  }

  if (item.type === "label") {
    return (
      <li
        className={`menu-item label${item.danger ? " danger" : ""}`}
        role="menuitem"
        onClick={() => {
          item.onClick?.();
          onClose();
        }}
      >
        <span className="menu-item-label">{item.text}</span>
      </li>
    );
  }

  if (item.type === "action") {
    return (
      <li
        className={`menu-item${item.disabled ? " disabled" : ""}`}
        role="menuitem"
        title={item.title}
        onMouseEnter={onCloseSub}
        onClick={() => {
          if (item.disabled) return;
          item.onClick();
          onClose();
        }}
      >
        {item.icon ? <CommandIcon name={item.icon} /> : null}
        <span className="menu-item-label">{item.label}</span>
        {item.shortcut ? (
          <span className="menu-item-shortcut">{item.shortcut}</span>
        ) : null}
      </li>
    );
  }

  if (item.type === "submenu") {
    if (!isMenuItemShown(item, ctx)) return null;
    return (
      <li
        ref={rowRef}
        className={`menu-item${openSub ? " open-submenu" : ""}`}
        role="menuitem"
        aria-haspopup
        onMouseEnter={onOpenSub}
      >
        <span className="menu-item-label">{item.label}</span>
        <ChevronRight size={14} className="menu-item-chevron" />
        {openSub && rowRef.current ? (
          <SubMenu
            parent={rowRef.current}
            items={item.children}
            ctx={ctx}
            view={view}
            onClose={onClose}
            nestedSub={nestedSub}
            setNestedSub={setNestedSub}
          />
        ) : null}
      </li>
    );
  }

  if (item.type === "checkbox") {
    const cmd = getCommand(item.id);
    const label = item.label ?? (cmd ? commandLabel(cmd, ctx) : item.id);
    const enabled = cmd ? cmd.isEnabled(ctx) : true;
    return (
      <li
        className={`menu-item${enabled ? "" : " disabled"}`}
        role="menuitemcheckbox"
        aria-checked={item.checked}
        title={
          !enabled && cmd?.disabledReason
            ? cmd.disabledReason(ctx)
            : undefined
        }
        onClick={() => {
          if (!enabled || !cmd) return;
          void cmd.run(ctx);
          onClose();
        }}
      >
        <span className="menu-item-check">
          {item.checked ? <Check size={14} /> : null}
        </span>
        <span className="menu-item-label">{label}</span>
      </li>
    );
  }

  const cmd = getCommand(item.id);
  if (!cmd || (cmd.isVisible && !cmd.isVisible(ctx))) {
    return null;
  }
  const enabled = cmd.isEnabled(ctx);
  const reason =
    !enabled && cmd.disabledReason ? cmd.disabledReason(ctx) : undefined;
  const shortcut = formatShortcut(cmd.shortcut);
  const label = commandLabel(cmd, ctx);

  return (
    <li
      className={`menu-item${enabled ? "" : " disabled"}`}
      role="menuitem"
      title={reason}
      onMouseEnter={onCloseSub}
      onClick={() => {
        if (!enabled) return;
        void cmd.run(ctx);
        onClose();
      }}
    >
      {cmd.icon ? <CommandIcon name={cmd.icon} /> : null}
      <span className="menu-item-label">{label}</span>
      {shortcut ? (
        <span className="menu-item-shortcut">{shortcut}</span>
      ) : null}
    </li>
  );
}

function SubMenu({
  parent,
  items,
  ctx,
  view,
  onClose,
  nestedSub,
  setNestedSub,
}: {
  parent: HTMLElement;
  items: MenuItem[];
  ctx: CommandContext;
  view: Window;
  onClose: () => void;
  nestedSub: number | null;
  setNestedSub: (n: number | null) => void;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0, maxHeight: 400, ready: false });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parentRect = parent.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const clamped = clampSubmenuPosition(
      parentRect,
      { width: rect.width, height: rect.height },
      { width: view.innerWidth, height: view.innerHeight },
    );
    setPos({
      x: clamped.x,
      y: clamped.y,
      maxHeight: clamped.maxHeight,
      ready: true,
    });
  }, [parent, items, view]);

  return (
    <ul
      ref={ref}
      className={`menu-list${pos.ready ? "" : " measuring"}`}
      style={{ left: pos.x, top: pos.y, maxHeight: pos.maxHeight }}
      role="menu"
    >
      {items.map((item, i) => (
        <MenuRow
          key={i}
          item={item}
          ctx={ctx}
          view={view}
          openSub={nestedSub === i}
          onOpenSub={() => setNestedSub(i)}
          onCloseSub={() => setNestedSub(null)}
          onClose={onClose}
        />
      ))}
    </ul>
  );
}
