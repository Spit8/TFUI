import { useMemo, useState } from "react";
import { selectorClasses } from "../model/elementStyle";
import type { Screen, TfuiProject, UiNode } from "../model/types";
import { matchingRules } from "../preview/cascade";
import { useProjectStore } from "../store/projectStore";
import { t } from "../i18n";

/** `!secondary` (forme sélecteur) → `secondary` (forme `meta.class`). */
function stripClassPrefix(name: string): string {
  return name.replace(/^!+/, "");
}

/**
 * Classes portées par l’élément. Une classe ne fait rien seule : elle relie
 * l’élément aux règles du panneau « Classes partagées », où on les modifie.
 */
export function NodeClassesSection({
  project,
  screen,
  node,
  suggestions,
  onOpenRule,
}: {
  project: TfuiProject;
  screen: Screen;
  node: UiNode;
  suggestions: string[];
  onOpenRule: (ruleId: string) => void;
}) {
  const setMeta = useProjectStore((s) => s.setMeta);
  const addStyleRule = useProjectStore((s) => s.addStyleRule);
  const [input, setInput] = useState("");
  const classes = useMemo(() => node.meta.class ?? [], [node.meta.class]);

  const shared = useMemo(
    () => project.styleRules.filter((r) => !r.ownerNodeId),
    [project.styleRules],
  );
  // Règles qui touchent l’élément sans passer par une de ses classes
  // (ex. `R::Ecran BoxLayout`) : affichées pour information.
  const otherRules = useMemo(
    () =>
      matchingRules(project, screen, node).filter(
        (r) => !selectorClasses(r.selector).some((c) => classes.includes(c)),
      ),
    [project, screen, node, classes],
  );

  const rulesForClass = (c: string) =>
    shared.filter((r) => selectorClasses(r.selector).includes(c));

  const createRuleFor = (c: string) => {
    addStyleRule({ selector: `R::${screen.recipeName} !${c}`, props: {} });
    const rules = useProjectStore.getState().project?.styleRules ?? [];
    const last = rules[rules.length - 1];
    if (last) onOpenRule(last.id);
  };

  const add = () => {
    const c = stripClassPrefix(input.trim());
    if (c && !classes.includes(c)) setMeta(node.id, { class: [...classes, c] });
    setInput("");
  };

  return (
    <div className="node-classes">
      {classes.length === 0 ? (
        <div className="style-empty">{t("nodeClasses.empty")}</div>
      ) : null}
      {classes.map((c) => {
        const rules = rulesForClass(c);
        return (
          <div key={c} className="node-class-row">
            <code className="node-class-name">{c}</code>
            {rules.length > 0 ? (
              <button
                type="button"
                className="style-badge own"
                title={t("nodeClasses.editRule")}
                onClick={() => onOpenRule(rules[0]!.id)}
              >
                {t("nodeClasses.rules", { n: rules.length })}
              </button>
            ) : (
              <button
                type="button"
                className="style-badge"
                title={t("nodeClasses.noRule")}
                onClick={() => createRuleFor(c)}
              >
                {t("nodeClasses.createRule")}
              </button>
            )}
            <button
              type="button"
              className="style-remove"
              title={t("nodeClasses.removeClass", { cls: c })}
              onClick={() => setMeta(node.id, { class: classes.filter((x) => x !== c) })}
            >
              ×
            </button>
          </div>
        );
      })}
      <div className="style-adder">
        <input
          type="text"
          list="node-class-suggestions"
          placeholder={t("nodeClasses.placeholder")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" disabled={!input.trim()} onClick={add}>
          {t("nodeClasses.add")}
        </button>
        <datalist id="node-class-suggestions">
          {suggestions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      {otherRules.length > 0 ? (
        <div className="node-class-other">
          <span>{t("nodeClasses.alsoApply")}</span>
          {otherRules.map((r) => (
            <button
              key={r.id}
              type="button"
              className="style-badge"
              title={r.selector}
              onClick={() => onOpenRule(r.id)}
            >
              {r.selector}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
