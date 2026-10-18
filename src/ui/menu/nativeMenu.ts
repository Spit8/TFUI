import type { MenuItem } from "./types";
import { t } from "../../i18n";

/**
 * Le menu contextuel natif du WebView (Recharger, Inspecter…) n’est jamais
 * affiché. Les champs texte reçoivent un petit menu maison ; Monaco garde le
 * sien ; ailleurs, sans menu applicatif, rien ne s’affiche.
 */

type TextField = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

export interface TextMenuState {
  x: number;
  y: number;
  doc: Document;
  field: TextField;
}

let state: TextMenuState | null = null;
const listeners = new Set<() => void>();

function setState(next: TextMenuState | null) {
  state = next;
  for (const l of listeners) l();
}

const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "number",
  "email",
  "url",
  "tel",
  "password",
  "",
]);

function textFieldOf(target: EventTarget | null): TextField | null {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return null;
  const field = el.closest("input, textarea, [contenteditable='true']");
  if (!field) return null;
  if (field.tagName === "INPUT") {
    const type = (field.getAttribute("type") ?? "").toLowerCase();
    if (!TEXT_INPUT_TYPES.has(type)) return null;
  }
  return field as TextField;
}

export function isTextFieldTarget(target: EventTarget | null): boolean {
  return textFieldOf(target) !== null;
}

/** Bloque le menu natif sur un document (principal ou fenêtre détachée). */
export function installNativeMenuBlocker(doc: Document): () => void {
  function onContextMenu(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    // Monaco affiche son propre menu (pas celui du WebView).
    if (target?.closest?.(".monaco-editor")) return;
    if (e.defaultPrevented) return;
    e.preventDefault();
    const field = textFieldOf(target);
    if (field) {
      setState({ x: e.clientX, y: e.clientY, doc, field });
    }
  }
  // Phase bulle : les menus applicatifs (React) passent d’abord et font
  // `preventDefault` ; on ne traite que ce qui reste.
  doc.addEventListener("contextmenu", onContextMenu);
  return () => doc.removeEventListener("contextmenu", onContextMenu);
}

function selectionOf(field: TextField): { start: number; end: number } | null {
  if ("selectionStart" in field && field.selectionStart !== null) {
    return { start: field.selectionStart, end: field.selectionEnd ?? field.selectionStart };
  }
  return null;
}

function hasSelection(field: TextField): boolean {
  const sel = selectionOf(field);
  if (sel) return sel.end > sel.start;
  const s = field.ownerDocument.getSelection();
  return Boolean(s && !s.isCollapsed);
}

function isReadOnly(field: TextField): boolean {
  if ("readOnly" in field && field.readOnly) return true;
  if ("disabled" in field && (field as HTMLInputElement).disabled) return true;
  return false;
}

function exec(field: TextField, command: string, value?: string): void {
  field.focus();
  field.ownerDocument.execCommand(command, false, value);
}

export function textMenuItems(field: TextField): MenuItem[] {
  const readOnly = isReadOnly(field);
  const selected = hasSelection(field);
  return [
    {
      type: "action",
      label: t("menu.cut"),
      shortcut: "Ctrl+X",
      icon: "Scissors",
      disabled: readOnly || !selected,
      onClick: () => exec(field, "cut"),
    },
    {
      type: "action",
      label: t("menu.copy"),
      shortcut: "Ctrl+C",
      icon: "Copy",
      disabled: !selected,
      onClick: () => exec(field, "copy"),
    },
    {
      type: "action",
      label: t("menu.paste"),
      shortcut: "Ctrl+V",
      icon: "ClipboardPaste",
      disabled: readOnly,
      onClick: () => {
        void navigator.clipboard
          .readText()
          .then((text) => exec(field, "insertText", text))
          .catch(() => {
            // Lecture du presse-papiers refusée : Ctrl+V reste disponible.
          });
      },
    },
    { type: "separator" },
    {
      type: "action",
      label: t("menu.selectAll"),
      shortcut: "Ctrl+A",
      onClick: () => {
        field.focus();
        if ("select" in field && typeof field.select === "function") {
          (field as HTMLInputElement).select();
        } else {
          exec(field, "selectAll");
        }
      },
    },
  ];
}

export function subscribeTextMenu(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getTextMenuState(): TextMenuState | null {
  return state;
}

export function closeTextMenu(): void {
  setState(null);
}
