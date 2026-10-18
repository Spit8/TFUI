import type { PropValue, Screen, StateVar } from "../model/types";
import type { StateSimValue } from "../store/projectStore";

export function resolvePropValue(
  value: PropValue | undefined,
  screen: Screen,
  sim: Record<string, StateSimValue> | undefined,
): unknown {
  if (!value) return undefined;
  switch (value.kind) {
    case "literal":
      return value.value;
    case "enum":
      return value.value;
    case "state": {
      if (sim && value.stateVar in sim) return sim[value.stateVar];
      const st = screen.state.find((s: StateVar) => s.name === value.stateVar);
      return st?.initial ?? null;
    }
    case "handler":
      return value.fn;
    case "lua":
      return value.code;
    default:
      return undefined;
  }
}

export function resolveStringProp(
  value: PropValue | undefined,
  screen: Screen,
  sim: Record<string, StateSimValue> | undefined,
  fallback = "",
): string {
  const v = resolvePropValue(value, screen, sim);
  if (v === null || v === undefined) return fallback;
  return String(v);
}

export function resolveNumberProp(
  value: PropValue | undefined,
  screen: Screen,
  sim: Record<string, StateSimValue> | undefined,
  fallback = 0,
): number {
  const v = resolvePropValue(value, screen, sim);
  return typeof v === "number" ? v : fallback;
}

export function resolveBoolProp(
  value: PropValue | undefined,
  screen: Screen,
  sim: Record<string, StateSimValue> | undefined,
  fallback = false,
): boolean {
  const v = resolvePropValue(value, screen, sim);
  return typeof v === "boolean" ? v : fallback;
}
