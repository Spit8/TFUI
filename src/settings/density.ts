import type { UiDensity } from "./defaults";

export function applyDensity(density: UiDensity): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.density = density;
}
