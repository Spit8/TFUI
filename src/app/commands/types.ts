import { hasKey, translateKey } from "../../i18n";
import type { TfuiProject } from "../../model/types";

export type CommandGroup =
  | "file"
  | "edit"
  | "node"
  | "screen"
  | "rule"
  | "view"
  | "preview"
  | "mod"
  | "tools"
  | "help";

export interface CommandContext {
  project: TfuiProject | null;
  selectedNodeId: string | null;
  selectedScreenId: string | null;
  dirty: boolean;
  targetNodeId?: string | null;
  targetScreenId?: string | null;
  targetRuleId?: string | null;
  targetPanelId?: string | null;
  /** Hooks UI branchés depuis App (I/O, dialogs). */
  ui: CommandUiHandlers;
}

export interface CommandUiHandlers {
  save: (saveAs: boolean) => Promise<void>;
  open: () => Promise<void>;
  openMod: () => Promise<void>;
  openRecent: (path: string) => Promise<void>;
  newProject: () => void;
  newMod: () => void;
  closeProject: () => void;
  writeGui: () => Promise<void>;
  build: () => Promise<void>;
  install: () => Promise<void>;
  exportZip: () => Promise<void>;
  checkTeal: () => Promise<void>;
  openSettings: () => void;
  /** Affichage › Réglages de l’aperçu (fonds par format, couleurs). */
  openPreviewSettings: () => void;
  openModProperties: () => void;
  rescan: () => Promise<void>;
  /** Enregistrer / Ne pas enregistrer / Annuler ; vrai si on peut continuer. */
  confirmDiscard: () => Promise<boolean>;
  setDensity: (d: "compact" | "normal") => void;
  getDensity: () => "compact" | "normal";
  showShortcuts: () => void;
  showAbout: () => void;
  openExternal: (url: string) => void;
  openPath: (path: string) => Promise<void>;
}

export interface Command {
  id: string;
  /**
   * Libellé fixe non traduit (nom de composant, chemin…). Sinon le libellé est
   * la traduction `cmd.<id>` (voir `commandLabel`).
   */
  label?: string;
  /** Libellé dépendant du contexte (ex. « Ajouter dans BoxLayout »). */
  labelFor?: (ctx: CommandContext | undefined) => string;
  shortcut?: string;
  /** Nom Lucide ou type TF3 pour icône. */
  icon?: string;
  group: CommandGroup;
  isEnabled: (ctx: CommandContext) => boolean;
  isVisible?: (ctx: CommandContext) => boolean;
  disabledReason?: (ctx: CommandContext) => string | undefined;
  run: (ctx: CommandContext) => void | Promise<void>;
}

/** Nœud cible pour les menus contextuels (sinon sélection). */
export function effectiveNodeId(ctx: CommandContext): string | null {
  return ctx.targetNodeId ?? ctx.selectedNodeId;
}

export function effectiveScreenId(ctx: CommandContext): string | null {
  return ctx.targetScreenId ?? ctx.selectedScreenId;
}

/** Libellé affiché : contexte, libellé fixe, puis traduction `cmd.<id>`. */
export function commandLabel(cmd: Command, ctx?: CommandContext): string {
  if (cmd.labelFor) return cmd.labelFor(ctx);
  if (cmd.label !== undefined) return cmd.label;
  const key = `cmd.${cmd.id}`;
  return hasKey(key) ? translateKey(key) : cmd.id;
}
