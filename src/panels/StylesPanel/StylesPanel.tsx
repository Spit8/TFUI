import { useEffect, useMemo, useState } from "react";
import { withCommandTargets } from "../../app/commands";
import { styleRuleMenuItems } from "../../app/menus/contextMenus";
import { addSharedClass } from "../../app/sharedClasses";
import { useCatalog } from "../../catalog/CatalogContext";
import { StylePropsEditor } from "../../inspector/StyleRows";
import { isElementRule, selectorClasses } from "../../model/elementStyle";
import { allowedKeysForRule } from "../../model/styleKeys";
import { findNode } from "../../model/treeOps";
import type { StyleRule, TfuiProject } from "../../model/types";
import { analyzeSelector, countRuleTargets, matchingRules } from "../../preview/cascade";
import { suggestSelectorFix } from "../../preview/selectorFix";
import { useProjectStore } from "../../store/projectStore";
import { setSelectedStyleRuleId, useSelectedStyleRuleId } from "../../store/styleSelectionStore";
import { ContextMenu } from "../../ui/menu/ContextMenu";
import { useContextMenu } from "../../ui/menu/useContextMenu";
import "./StylesPanel.css";
import { t, useT } from "../../i18n";
import { Rich } from "../../i18n/Rich";

function TargetBadge({ project, rule }: { project: TfuiProject; rule: StyleRule }) {
  const analysis = analyzeSelector(rule.selector);
  if (!analysis.simulated) {
    return (
      <span className="rule-badge warn" title={t("styles.emittedAsIs", { reason: analysis.reason ?? "" })}>
        {t("styles.notSimulated")}
      </span>
    );
  }
  const n = countRuleTargets(project, rule).length;
  return n === 0 ? (
    <span
      className="rule-badge warn"
      title={t("styles.noTargetHint")}
    >
      {t("styles.noTarget")}
    </span>
  ) : (
    <span className="rule-badge" title={t("styles.targetsHint", { n })}>
      {t("styles.targetsShort", { n })}
    </span>
  );
}

/**
 * Classes partagées : règles `.css.lua` écrites à la main, appliquées à tous
 * les éléments qui portent la classe. Le style propre à un élément se règle
 * dans l’Inspecteur (section Style).
 */
export function StylesPanel() {
  useT();
  const { vocabulary } = useCatalog();
  const project = useProjectStore((s) => s.project);
  const selectedNodeId = useProjectStore((s) => s.selectedNodeId);
  const updateStyleRule = useProjectStore((s) => s.updateStyleRule);
  const removeStyleRule = useProjectStore((s) => s.removeStyleRule);
  const reorderStyleRules = useProjectStore((s) => s.reorderStyleRules);
  const setMeta = useProjectStore((s) => s.setMeta);
  const externalRuleId = useSelectedStyleRuleId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const ctxMenu = useContextMenu();
  const [menuRuleId, setMenuRuleId] = useState<string | null>(null);

  useEffect(() => {
    if (externalRuleId) {
      setSelectedId(externalRuleId);
      setSelectedStyleRuleId(null);
    }
  }, [externalRuleId]);

  const rules = useMemo(
    () => (project ? project.styleRules.filter((r) => !isElementRule(r)) : []),
    [project],
  );

  if (!project) {
    return <div className="styles-empty">{t("common.noProject")}</div>;
  }

  const selected = rules.find((r) => r.id === selectedId) ?? rules[0] ?? null;
  const selectedLoc = selectedNodeId ? findNode(project, selectedNodeId) : null;
  const selectedNode = selectedLoc?.node ?? null;
  // Classes qui touchent l’élément sélectionné dans l’arbre / l’aperçu.
  const selectedScreen = selectedLoc
    ? project.screens.find((s) => s.id === selectedLoc.screenId)
    : undefined;
  const touchesSelection = new Set(
    selectedNode && selectedScreen
      ? matchingRules(project, selectedScreen, selectedNode).map((r) => r.id)
      : [],
  );

  /** Échange avec la classe partagée voisine (indices du tableau complet). */
  const swapWith = (rule: StyleRule, offset: -1 | 1) => {
    const i = rules.indexOf(rule);
    const other = rules[i + offset];
    if (!other) return;
    const all = project.styleRules;
    reorderStyleRules(all.indexOf(rule), all.indexOf(other));
  };

  const setKey = (rule: StyleRule, key: string, value: unknown) => {
    const props = { ...rule.props } as Record<string, unknown>;
    if (value === undefined) delete props[key];
    else props[key] = value;
    updateStyleRule(rule.id, { props: props as StyleRule["props"] });
  };

  return (
    <div className="styles-panel">
      <div className="styles-intro">
        <Rich k="styles.intro" />
      </div>
      <div className="styles-toolbar">
        <button
          type="button"
          onClick={() => {
            const id = addSharedClass(project);
            if (id) setSelectedId(id);
          }}
        >
          {t("styles.newClass")}
        </button>
        <button
          type="button"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            removeStyleRule(selected.id);
            setSelectedId(null);
          }}
        >
          {t("common.delete")}
        </button>
      </div>
      <div className="styles-body">
        <div className="styles-col-list">
          {rules.length === 0 ? (
            <div className="styles-empty">{t("styles.noClasses")}</div>
          ) : (
            <ul className="styles-list">
              {rules.map((rule, index) => (
                <li
                  key={rule.id}
                  className={`${selected?.id === rule.id ? "selected" : ""}${
                    touchesSelection.has(rule.id) ? " touches" : ""
                  }`}
                  onClick={() => {
                    setSelectedId(rule.id);
                    // Tous les éléments de la classe en surbrillance ; inspecteur vide
                    // (multi-sélection : pas d’édition d’un seul élément).
                    if (project) useProjectStore.getState().highlightNodes(countRuleTargets(project, rule));
                  }}
                  onContextMenu={(e) => {
                    setSelectedId(rule.id);
                    setMenuRuleId(rule.id);
                    ctxMenu.open(e, styleRuleMenuItems());
                  }}
                >
                  <span
                    className="touch-dot"
                    title={
                      touchesSelection.has(rule.id)
                        ? t("styles.touchesSelection")
                        : undefined
                    }
                  />
                  <span className="sel" title={rule.selector}>
                    {rule.selector || t("styles.emptySelector")}
                  </span>
                  <TargetBadge project={project} rule={rule} />
                  <span className="ops">
                    <button
                      type="button"
                      disabled={index === 0}
                      title={t("styles.moveUp")}
                      onClick={(e) => {
                        e.stopPropagation();
                        swapWith(rule, -1);
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={index >= rules.length - 1}
                      title={t("styles.moveDown")}
                      onClick={(e) => {
                        e.stopPropagation();
                        swapWith(rule, 1);
                      }}
                    >
                      ↓
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="styles-col-editor">
          {selected ? (
            <div className="styles-editor">
              <label>
                {t("styles.selector")}
                <input
                  type="text"
                  value={selected.selector}
                  onChange={(e) => updateStyleRule(selected.id, { selector: e.target.value })}
                />
              </label>
              {(() => {
            const fix = suggestSelectorFix(project, selected);
            return fix ? (
              <div className="styles-fix">
                <Rich k="styles.fixHint" slots={{ fix: <code>{fix}</code> }} />
                <button
                  type="button"
                  onClick={() => updateStyleRule(selected.id, { selector: fix })}
                >
                  {t("styles.fix")}
                </button>
              </div>
            ) : null;
          })()}
          <SelectorHelp
                selector={selected.selector}
                nodeClasses={selectedNode?.meta.class ?? null}
                onAddClass={(cls) => {
                  if (!selectedNode) return;
                  const current = selectedNode.meta.class ?? [];
                  if (!current.includes(cls)) {
                    setMeta(selectedNode.id, { class: [...current, cls] });
                  }
                }}
              />
              <label>
                {t("styles.comment")}
                <input
                  type="text"
                  value={selected.comment ?? ""}
                  onChange={(e) =>
                    updateStyleRule(selected.id, {
                      comment: e.target.value || undefined,
                    })
                  }
                />
              </label>
              <div className="styles-subtitle">{t("styles.properties")}</div>
              <StylePropsEditor
                props={selected.props}
                allowed={allowedKeysForRule(project, selected, vocabulary)}
                onSet={(k, v) => setKey(selected, k, v)}
              />
              <TargetList project={project} rule={selected} selectedNodeId={selectedNodeId} />
            </div>
          ) : (
            <div className="styles-empty">{t("styles.selectClass")}</div>
          )}
        </div>
      </div>
      {ctxMenu.menu ? (
        <ContextMenu
          x={ctxMenu.menu.x}
          y={ctxMenu.menu.y}
          doc={ctxMenu.menu.doc}
          items={ctxMenu.menu.items}
          ctx={withCommandTargets({ targetRuleId: menuRuleId })}
          onClose={ctxMenu.close}
        />
      ) : null}
    </div>
  );
}

/** Éléments touchés par la classe ; un clic les sélectionne (arbre, aperçu, inspecteur). */
function TargetList({
  project,
  rule,
  selectedNodeId,
}: {
  project: TfuiProject;
  rule: StyleRule;
  selectedNodeId: string | null;
}) {
  const setSelection = useProjectStore((s) => s.setSelection);
  const ids = countRuleTargets(project, rule);
  return (
    <div className="styles-targets">
      <div className="styles-subtitle">{t("styles.targetedElements", { n: ids.length })}</div>
      {ids.length === 0 ? (
        <div className="styles-help">
          {t("styles.noTargets")}
        </div>
      ) : (
        ids.map((id) => {
          const loc = findNode(project, id);
          if (!loc) return null;
          const n = loc.node;
          const label = n.name && n.name !== n.type ? t("common.typeNamed", { type: n.type, name: n.name }) : n.type;
          return (
            <button
              key={id}
              type="button"
              className={`styles-target${id === selectedNodeId ? " current" : ""}`}
              onClick={() => setSelection(loc.screenId, id)}
            >
              {label}
            </button>
          );
        })
      )}
    </div>
  );
}

/** Explique comment la règle s’applique et propose d’ajouter sa classe au nœud. */
function SelectorHelp({
  selector,
  nodeClasses,
  onAddClass,
}: {
  selector: string;
  nodeClasses: string[] | null;
  onAddClass: (cls: string) => void;
}) {
  const analysis = analyzeSelector(selector);
  const classes = selectorClasses(analysis.base);
  return (
    <div className="styles-help">
      {!analysis.simulated ? (
        <div>
          {t("styles.notPreviewed", { reason: analysis.reason ?? "" })}
        </div>
      ) : null}
      {analysis.state ? (
        <div>
          <Rich k="styles.state" slots={{ state: <code>:{analysis.state}</code> }} />
        </div>
      ) : null}
      {classes.length > 0 ? (
        <div className="styles-help-classes">
          {t("styles.appliesToClass")}{" "}
          {classes.map((c) => (
            <span key={c} className="styles-class-chip">
              {c}
              {nodeClasses ? (
                nodeClasses.includes(c) ? (
                  <span className="styles-class-ok" title={t("styles.nodeHasClass")}>
                    ✓
                  </span>
                ) : (
                  <button
                    type="button"
                    title={t("styles.addClassToNodeHint")}
                    onClick={() => onAddClass(c)}
                  >
                    {t("styles.addClassToNode")}
                  </button>
                )
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
