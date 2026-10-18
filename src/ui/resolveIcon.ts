import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  Box,
  ChartLine,
  ChartSpline,
  ChevronsUpDown,
  ClipboardPaste,
  Columns3,
  Copy,
  Crosshair,
  Download,
  Gauge,
  Hash,
  Hammer,
  IdCard,
  Image,
  Layers,
  List,
  ListChecks,
  MousePointerClick,
  Move,
  MoveHorizontal,
  MoveVertical,
  PackageCheck,
  PanelTop,
  PanelsTopLeft,
  Pilcrow,
  Play,
  Puzzle,
  RectangleHorizontal,
  Rows3,
  Scissors,
  ScrollText,
  Sheet,
  SlidersHorizontal,
  SquareCheck,
  Table,
  TableRowsSplit,
  TextCursorInput,
  ToggleLeft,
  ToggleRight,
  Type,
  WrapText,
} from "lucide-react";
import { COMPONENT_OVERRIDES } from "../catalog/overrides";

/** Table statique — tree-shaking Lucide. */
const ICON_BY_NAME: Record<string, LucideIcon> = {
  AppWindow,
  MousePointerClick,
  Rows3,
  Columns3,
  ToggleLeft,
  WrapText,
  ToggleRight,
  Move,
  MoveHorizontal,
  MoveVertical,
  SquareCheck,
  Crosshair,
  ChevronsUpDown,
  Table,
  ListChecks,
  TableRowsSplit,
  SlidersHorizontal,
  ScrollText,
  TextCursorInput,
  Box,
  Hash,
  Type,
  Gauge,
  Pilcrow,
  List,
  Image,
  Layers,
  PanelsTopLeft,
  IdCard,
  PanelTop,
  RectangleHorizontal,
  Sheet,
  ChartLine,
  ChartSpline,
  Puzzle,
  Hammer,
  Download,
  PackageCheck,
  Scissors,
  Copy,
  ClipboardPaste,
  Play,
};

export type ComponentIconOptions = {
  /** Pour BoxLayout : vertical → Rows3, horizontal → Columns3. */
  orientation?: unknown;
};

function orientationToString(orientation: unknown): string | null {
  if (typeof orientation === "string") return orientation;
  if (
    orientation &&
    typeof orientation === "object" &&
    "kind" in orientation
  ) {
    const pv = orientation as { kind: string; value?: unknown; code?: string };
    if (
      (pv.kind === "literal" || pv.kind === "enum") &&
      typeof pv.value === "string"
    ) {
      return pv.value;
    }
    if (pv.kind === "lua" && typeof pv.code === "string") return pv.code;
  }
  return null;
}

function isHorizontalOrientation(orientation: unknown): boolean {
  const s = orientationToString(orientation);
  if (!s) return false;
  return s.toLowerCase().includes("horizontal");
}

/** Résout le composant Lucide pour un type TF3 (repli Puzzle). */
export function resolveComponentIcon(
  type: string,
  opts?: ComponentIconOptions,
): LucideIcon {
  if (type === "BoxLayout") {
    return isHorizontalOrientation(opts?.orientation) ? Columns3 : Rows3;
  }
  const name = COMPONENT_OVERRIDES[type]?.icon;
  if (name && ICON_BY_NAME[name]) return ICON_BY_NAME[name];
  return Puzzle;
}

export function resolveIconByLucideName(name: string | undefined): LucideIcon {
  if (name && ICON_BY_NAME[name]) return ICON_BY_NAME[name];
  return Puzzle;
}
