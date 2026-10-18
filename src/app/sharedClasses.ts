import { newSharedClassSelector } from "../model/elementStyle";
import type { TfuiProject } from "../model/types";
import { useProjectStore } from "../store/projectStore";

/** Ajoute une classe partagée ; renvoie son id. */
export function addSharedClass(project: TfuiProject): string | null {
  const s = useProjectStore.getState();
  s.addStyleRule({
    selector: newSharedClassSelector(project),
    props: {},
  });
  const rules = useProjectStore.getState().project?.styleRules ?? [];
  return rules[rules.length - 1]?.id ?? null;
}
