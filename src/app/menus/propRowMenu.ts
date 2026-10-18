import {
  modeIcon,
  modeLabel,
  type PropMode,
} from "../../inspector/propMode";
import type { MenuItem } from "../../ui/menu/types";
import { t } from "../../i18n";

export function propRowMenuItems(opts: {
  defined: boolean;
  modes: PropMode[];
  onUnset: () => void;
  onCopy: () => void;
  onSetMode: (mode: PropMode) => void;
}): MenuItem[] {
  const items: MenuItem[] = [];
  if (opts.defined) {
    items.push({
      type: "label",
      text: t("propMenu.unset"),
      onClick: opts.onUnset,
    });
  }
  items.push(
    {
      type: "label",
      text: t("propMenu.copy"),
      onClick: opts.onCopy,
    },
    { type: "separator" },
  );
  for (const m of opts.modes) {
    if (m === "literal" || m === "enum") continue;
    items.push({
      type: "label",
      text: `Passer en mode ${modeLabel(m)} ${modeIcon(m)}`,
      onClick: () => opts.onSetMode(m),
    });
  }
  return items;
}

export function serializePropValue(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value);
  }
}
