import { useProjectStore } from "../store/projectStore";
import { saveProjectFile } from "./projectIo";
import { t } from "../i18n";

/**
 * Confirmation « modifications non enregistrées » : Enregistrer / Ne pas
 * enregistrer / Annuler. Remplace `window.confirm` (boutons OK / Annuler peu
 * clairs, impossible d’enregistrer depuis la question).
 */

export type UnsavedChoice = "save" | "discard" | "cancel";

interface PendingQuestion {
  action: string;
  resolve: (choice: UnsavedChoice) => void;
}

let pending: PendingQuestion | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeUnsaved(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getPendingUnsaved(): PendingQuestion | null {
  return pending;
}

export function answerUnsaved(choice: UnsavedChoice): void {
  const q = pending;
  pending = null;
  emit();
  q?.resolve(choice);
}

function ask(action: string): Promise<UnsavedChoice> {
  // Une seule question à la fois : la précédente est annulée.
  pending?.resolve("cancel");
  return new Promise((resolve) => {
    pending = { action, resolve };
    emit();
  });
}

/**
 * Vrai si l’action peut continuer : projet non modifié, enregistré à la
 * demande, ou modifications abandonnées volontairement.
 * `action` complète la question, ex. « avant d’ouvrir un autre projet ».
 */
/**
 * Multi-projets : demande pour chaque projet modifié (celui-ci devient actif
 * le temps de la question). Faux dès qu’une question est annulée.
 */
export async function confirmDiscardAllDirty(action = t("unsaved.beforeQuit")): Promise<boolean> {
  const st = useProjectStore.getState();
  const dirtyIds = st.sessions
    .filter((x) => (x.id === st.activeSessionId ? st.dirty : x.dirty))
    .map((x) => x.id);
  for (const id of dirtyIds) {
    useProjectStore.getState().switchProject(id);
    if (!(await confirmDiscardIfDirty(action))) return false;
  }
  return true;
}

export async function confirmDiscardIfDirty(
  action = t("unsaved.beforeContinue"),
): Promise<boolean> {
  if (!useProjectStore.getState().dirty) return true;
  const choice = await ask(action);
  if (choice === "cancel") return false;
  if (choice === "discard") return true;
  try {
    // « Enregistrer sous » annulé → on n’abandonne rien.
    return (await saveProjectFile(false)) !== null;
  } catch {
    return false;
  }
}
