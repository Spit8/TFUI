import { useEffect, useMemo, useState } from "react";
import { focusPanel, isPanelOpen, togglePanel } from "../../app/dockApi";
import { propRowMenuItems, serializePropValue } from "../../app/menus/propRowMenu";
import { useCatalog } from "../../catalog/CatalogContext";
import { findComponent } from "../../catalog/loadCatalog";
import { PropValueEditor } from "../../inspector/PropValueEditor";
import { filterPropFieldsList } from "../../inspector/propFilters";
import { defaultForMode, modesForField, type PropMode } from "../../inspector/propMode";
import { NodeClassesSection } from "../../inspector/NodeClassesSection";
import { NodeStyleSection } from "../../inspector/NodeStyleSection";
import { wrappingMetaKeys } from "../../model/metaRules";
import { findNode } from "../../model/treeOps";
import type { PropValue } from "../../model/types";
import { useGeneratedFiles } from "../../store/generatedFilesStore";
import { useProjectStore } from "../../store/projectStore";
import { setSelectedStyleRuleId } from "../../store/styleSelectionStore";
import { CollapsibleSection, INSP_SECTIONS_KEY } from "../../ui/CollapsibleSection";
import { ComponentIcon } from "../../ui/icons";
import { ContextMenu } from "../../ui/menu/ContextMenu";
import { useContextMenu } from "../../ui/menu/useContextMenu";
import { NumberInput } from "../../ui/NumberInput";
import "./InspectorPanel.css";
import { t, useT } from "../../i18n";
import { componentNotes } from "../../catalog/overrides";
import { tabTitleText } from "../../model/tabTitle";

/** `!secondary` (forme sélecteur) → `secondary` (forme `meta.class`). */
function stripClassPrefix(name: string): string {
  return name.replace(/^!+/, "");
}

export function InspectorPanel() {
  useT();
  const { catalog, vocabulary } = useCatalog();
  const project = useProjectStore((s) => s.project);
  const selectedNodeId = useProjectStore((s) => s.selectedNodeId);
  const selectedScreenId = useProjectStore((s) => s.selectedScreenId);
  const screenInspected = useProjectStore((s) => s.screenInspected);
  const validationIssues = useProjectStore((s) => s.validationIssues);
  const setProp = useProjectStore((s) => s.setProp);
  const unsetProp = useProjectStore((s) => s.unsetProp);
  const setMeta = useProjectStore((s) => s.setMeta);
  const setTabTitle = useProjectStore((s) => s.setTabTitle);
  const addStateVar = useProjectStore((s) => s.addStateVar);
  const updateStateVar = useProjectStore((s) => s.updateStateVar);
  const removeStateVar = useProjectStore((s) => s.removeStateVar);
  const renameNode = useProjectStore((s) => s.renameNode);
  const updateScreenMeta = useProjectStore((s) => s.updateScreenMeta);
  const { notices } = useGeneratedFiles();

  const [fieldError, setFieldError] = useState<string | null>(null);
  const [propQuery, setPropQuery] = useState("");
  const [definedOnly, setDefinedOnly] = useState(false);
  const ctxMenu = useContextMenu();

  useEffect(() => {
    setFieldError(null);
  }, [selectedNodeId]);

  const loc = useMemo(() => {
    if (!project || !selectedNodeId) return null;
    return findNode(project, selectedNodeId);
  }, [project, selectedNodeId]);

  const screen = useMemo(() => {
    if (!project) return null;
    const id = loc?.screenId ?? selectedScreenId;
    return project.screens.find((s) => s.id === id) ?? null;
  }, [project, loc, selectedScreenId]);

  const node = loc?.node ?? null;

  const component = useMemo(() => {
    if (!catalog || !node) return null;
    return findComponent(catalog, node.type) ?? null;
  }, [catalog, node]);

  // Lues à chaque rendu : traduites dans la langue courante.
  const notes = node ? componentNotes(node.type) : [];

  // Problèmes du validateur pour ce nœud : détail dans le panneau Problèmes.
  const nodeIssues = useMemo(() => {
    if (!node || !project) return [] as string[];
    return validationIssues()
      .filter((i) => i.nodeId === node.id)
      .map((i) => i.message);
  }, [node, project, validationIssues]);

  const classSuggestions = useMemo(() => {
    // Le vocabulaire stocke les classes avec leur préfixe de sélecteur `!` :
    // sur le nœud, la classe s’écrit sans (`meta.class = "secondary"`).
    const fromVocab = [...(vocabulary?.fontScaleClasses ?? []), ...(vocabulary?.classes ?? [])].map(
      stripClassPrefix,
    );
    const fromRules = (project?.styleRules ?? [])
      .filter((r) => !r.ownerNodeId)
      .flatMap((r) => [...r.selector.matchAll(/!([A-Za-z0-9_-]+)/g)].map((m) => m[1]));
    return [...new Set([...fromVocab, ...fromRules])].filter(Boolean).sort();
  }, [vocabulary, project?.styleRules]);

  const selectedScreenOnly =
    !!project &&
    !selectedNodeId &&
    screenInspected &&
    !!selectedScreenId &&
    project.screens.find((s) => s.id === selectedScreenId);

  if (!project) {
    return (
      <div className="inspector-panel">
        <div className="insp-empty">{t("common.noProject")}</div>
      </div>
    );
  }

  if (selectedScreenOnly) {
    const sc = selectedScreenOnly;
    return (
      <div className="inspector-panel">
        <div className="insp-header">
          <strong className="insp-header-type">{t("insp.screen")}</strong>
          <span style={{ color: "var(--muted)" }}> — {sc.recipeName}</span>
        </div>
        <CollapsibleSection
          id="screen"
          title={t("insp.screen")}
          storageKey={INSP_SECTIONS_KEY}
          defaultOpen
          className="insp-section"
        >
          <div className="insp-section-body">
            <label className="insp-field">
              <span>{t("insp.recipe")}</span>
              <input
                type="text"
                value={sc.recipeName}
                onChange={(e) => updateScreenMeta(sc.id, { recipeName: e.target.value })}
              />
            </label>
            <label className="insp-field">
              <span>{t("insp.fileBase")}</span>
              <input
                type="text"
                value={sc.fileBase}
                onChange={(e) => updateScreenMeta(sc.id, { fileBase: e.target.value })}
              />
            </label>
            <label className="insp-field">
              <span>{t("insp.kind")}</span>
              <select
                value={sc.kind}
                onChange={(e) =>
                  updateScreenMeta(sc.id, {
                    kind: e.target.value as typeof sc.kind,
                  })
                }
              >
                <option value="window">{t("insp.kindWindow")}</option>
                <option value="recipe">{t("insp.kindRecipe")}</option>
                <option value="plugin">{t("insp.kindPlugin")}</option>
              </select>
            </label>
            {sc.kind === "plugin" ? (
              <>
                <label className="insp-field">
                  <span>pluginName</span>
                  <input
                    type="text"
                    value={sc.plugin?.pluginName ?? ""}
                    onChange={(e) =>
                      updateScreenMeta(sc.id, {
                        plugin: { pluginName: e.target.value },
                      })
                    }
                  />
                </label>
                <label className="insp-field">
                  <span>buttonLabel</span>
                  <input
                    type="text"
                    value={sc.plugin?.buttonLabel ?? ""}
                    onChange={(e) =>
                      updateScreenMeta(sc.id, {
                        plugin: { buttonLabel: e.target.value },
                      })
                    }
                  />
                </label>
                <label className="insp-field">
                  <span>order</span>
                  <NumberInput
                    value={sc.plugin?.order ?? 100}
                    integer
                    onCommit={(n) => updateScreenMeta(sc.id, { plugin: { order: n } })}
                  />
                </label>
              </>
            ) : null}
          </div>
        </CollapsibleSection>
      </div>
    );
  }

  if (!node || !component) {
    return (
      <div className="inspector-panel">
        <div className="insp-empty">
          {catalog
            ? t("insp.noSelection")
            : t("insp.noCatalog")}
        </div>
      </div>
    );
  }

  const propFields = filterPropFieldsList(component.fields, {
    query: propQuery,
    definedOnly,
    props: node.props,
  });
  const allEditable = filterPropFieldsList(component.fields);
  const definedCount = allEditable.filter((f) => node.props[f.name] !== undefined).length;
  const classes = node.meta.class ?? [];
  // Racine d’un écran fenêtre (RegisterWrapperRecipe) : meta limité à `class`.
  const isWindowRoot = !!screen && screen.kind === "window" && screen.root.id === node.id;
  // Titre d’un onglet : texte de la TextView de son indicator (null : état ou Lua).
  const tabTitle = node.type === "TabWidgetChild" ? tabTitleText(node) : "";
  const rootWrapKeys = isWindowRoot ? wrappingMetaKeys(node) : [];
  const displayName = node.name && node.name !== node.type ? node.name : "";

  function openRuleInStyles(ruleId: string) {
    setSelectedStyleRuleId(ruleId);
    if (!isPanelOpen("styles")) togglePanel("styles");
    focusPanel("styles");
  }

  function openPropMenu(e: React.MouseEvent, fieldName: string) {
    const field = component!.fields.find((f) => f.name === fieldName);
    if (!field) return;
    const value = node!.props[fieldName];
    const defined = value !== undefined;
    ctxMenu.open(
      e,
      propRowMenuItems({
        defined,
        modes: modesForField(field),
        onUnset: () => unsetProp(node!.id, fieldName),
        onCopy: () => {
          void navigator.clipboard.writeText(serializePropValue(value));
        },
        onSetMode: (mode: PropMode) => {
          setProp(node!.id, fieldName, defaultForMode(mode, field));
        },
      }),
    );
  }

  return (
    <div className="inspector-panel">
      <div className="insp-header">
        <ComponentIcon
          type={node.type}
          orientation={node.props.orientation}
          className="insp-header-icon"
        />
        <span className="insp-header-type">{node.type}</span>
        <input
          type="text"
          className="insp-header-name"
          placeholder={t("insp.namePlaceholder")}
          value={displayName}
          title={t("insp.nameHint")}
          onChange={(e) => renameNode(node.id, e.target.value)}
        />
        <input
          type="search"
          className="insp-header-filter"
          placeholder={t("insp.filter")}
          value={propQuery}
          onChange={(e) => setPropQuery(e.target.value)}
        />
        <button
          type="button"
          className={`insp-header-toggle${definedOnly ? " active" : ""}`}
          title={t("insp.definedOnly")}
          aria-pressed={definedOnly}
          onClick={() => setDefinedOnly((v) => !v)}
        >
          ◧
        </button>
      </div>

      {fieldError ? <div className="insp-error">{fieldError}</div> : null}

      {nodeIssues.length > 0 || notes.length > 0 ? (
        <div className="insp-infobar">
          {nodeIssues.length > 0 ? (
            <button
              type="button"
              className="insp-issues-link"
              title={nodeIssues.join("\n")}
              onClick={() => {
                if (!isPanelOpen("problems")) togglePanel("problems");
                focusPanel("problems");
              }}
            >
              {t("insp.issues", { n: nodeIssues.length })}
            </button>
          ) : null}
          {notes.length > 0 ? (
            <span className="insp-notes-hint" title={notes.join("\n")}>
              {t("insp.notesHint", { type: node.type })}
            </span>
          ) : null}
        </div>
      ) : null}

      <CollapsibleSection
        id="props"
        title={t("insp.props")}
        storageKey={INSP_SECTIONS_KEY}
        countLabel={t("insp.definedCount", { n: definedCount })}
        className="insp-section"
      >
        <div className="insp-section-body">
          {propFields.length === 0 ? (
            <span className="insp-readonly">{t("insp.noProps")}</span>
          ) : (
            propFields.map((field) => {
              const defined = node.props[field.name] !== undefined;
              const tip = [field.name, field.comment].filter(Boolean).join(" — ");
              const propNotices = notices.filter(
                (n) => n.nodeId === node.id && n.propKey === field.name,
              );
              return (
                <div
                  key={field.name}
                  className="insp-prop-row"
                  onContextMenu={(e) => openPropMenu(e, field.name)}
                >
                  <span className={`insp-prop-label${defined ? "" : " undefined"}`} title={tip}>
                    {field.name}
                    {propNotices.length > 0 ? (
                      <span
                        className="insp-rewrite-badge"
                        title={propNotices.map((n) => n.message).join("\n")}
                      >
                        ⓘ
                      </span>
                    ) : null}
                  </span>
                  <PropValueEditor
                    field={field}
                    value={node.props[field.name]}
                    enums={catalog?.enums ?? {}}
                    stateVars={screen?.state ?? []}
                    onError={setFieldError}
                    onChange={(next: PropValue) => {
                      setProp(node.id, field.name, next);
                    }}
                    onUnset={() => unsetProp(node.id, field.name)}
                  />
                </div>
              );
            })
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="meta"
        title={t("insp.general")}
        storageKey={INSP_SECTIONS_KEY}
        className="insp-section"
      >
        <div className="insp-section-body">
          {isWindowRoot ? (
            <div className="insp-window-root-note">
              {t("insp.windowRootNote")}
              {rootWrapKeys.length > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    setMeta(node.id, {
                      enabled: undefined,
                      tooltip: undefined,
                      inlineStyle: undefined,
                    })
                  }
                >
                  {t("insp.remove", { keys: rootWrapKeys.join(", ") })}
                </button>
              ) : null}
            </div>
          ) : null}
          {node.type === "TabWidgetChild" ? (
            tabTitle === null ? (
              <div className="insp-window-root-note">{t("insp.tabTitleDynamic")}</div>
            ) : (
              <label className="insp-field" title={t("insp.tabTitleHint")}>
                <span>{t("insp.tabTitle")}</span>
                <input
                  type="text"
                  value={tabTitle}
                  onChange={(e) => setTabTitle(node.id, e.target.value)}
                />
              </label>
            )
          ) : null}
          {isWindowRoot ? null : (
            <div
              className="insp-prop-row"
              title={t("insp.enabledHint")}
            >
              <span className="insp-prop-label">{t("insp.enabled")}</span>
              <PropValueEditor
                field={{
                  name: "enabled",
                  tealType: "boolean",
                  kind: "boolean",
                }}
                value={node.meta.enabled}
                enums={{}}
                stateVars={screen?.state ?? []}
                hideMode
                onChange={(next) => setMeta(node.id, { enabled: next })}
              />
            </div>
          )}
          {isWindowRoot ? null : (
            <label
              className="insp-field"
              title={t("insp.tooltipHint")}
            >
              <span>{t("insp.tooltip")}</span>
              <input
                type="text"
                value={node.meta.tooltip ?? ""}
                onChange={(e) => setMeta(node.id, { tooltip: e.target.value || undefined })}
              />
            </label>
          )}
          <label
            className="insp-field"
            title={t("insp.idHint")}
          >
            <span>{t("insp.id")}</span>
            <input
              type="text"
              value={node.meta.id ?? ""}
              onChange={(e) => setMeta(node.id, { id: e.target.value || undefined })}
            />
          </label>
        </div>
      </CollapsibleSection>

      {screen ? (
        <CollapsibleSection
          id="style"
          title={t("insp.style")}
          storageKey={INSP_SECTIONS_KEY}
          className="insp-section"
        >
          <div className="insp-section-body">
            <NodeStyleSection
              key={node.id}
              project={project}
              screen={screen}
              node={node}
              vocabulary={vocabulary}
              onOpenRule={openRuleInStyles}
            />
          </div>
        </CollapsibleSection>
      ) : null}

      {screen ? (
        <CollapsibleSection
          id="rules"
          title={t("insp.classes")}
          storageKey={INSP_SECTIONS_KEY}
          className="insp-section"
          countLabel={String(classes.length)}
        >
          <div className="insp-section-body">
            <NodeClassesSection
              project={project}
              screen={screen}
              node={node}
              suggestions={classSuggestions}
              onOpenRule={openRuleInStyles}
            />
          </div>
        </CollapsibleSection>
      ) : null}

      <CollapsibleSection
        id="state"
        title={t("insp.state")}
        storageKey={INSP_SECTIONS_KEY}
        className="insp-section"
        headerActions={
          screen ? (
            <button type="button" onClick={() => addStateVar(screen.id)}>
              +
            </button>
          ) : null
        }
      >
        <div className="insp-section-body">
          {!screen ? (
            <span className="insp-readonly">{t("insp.noScreen")}</span>
          ) : (
            <>
              {screen.state.map((v, i) => (
                <div key={`${v.name}-${i}`} className="insp-state-row">
                  <input
                    type="text"
                    value={v.name}
                    onChange={(e) => updateStateVar(screen.id, i, { name: e.target.value })}
                    placeholder={t("insp.namePlaceholder")}
                  />
                  <input
                    type="text"
                    value={v.initial === null || v.initial === undefined ? "" : String(v.initial)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      let initial: string | number | boolean | null = raw;
                      if (raw === "true") initial = true;
                      else if (raw === "false") initial = false;
                      else if (raw === "null") initial = null;
                      else if (raw !== "" && !Number.isNaN(Number(raw))) {
                        initial = Number(raw);
                      }
                      updateStateVar(screen.id, i, { initial });
                    }}
                    placeholder={t("insp.initialValue")}
                  />
                  <button type="button" onClick={() => removeStateVar(screen.id, i)}>
                    ×
                  </button>
                </div>
              ))}
              <div className="insp-row-actions">
                <button type="button" onClick={() => addStateVar(screen.id)}>
                  {t("insp.addUseState")}
                </button>
              </div>
            </>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="notes"
        title={t("insp.notes")}
        storageKey={INSP_SECTIONS_KEY}
        defaultOpen={notes.length > 0}
        className="insp-section"
      >
        <div className="insp-section-body">
          {notes.length === 0 ? (
            <span className="insp-readonly">{t("insp.noNotes")}</span>
          ) : (
            <ul className="insp-notes">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      </CollapsibleSection>

      {ctxMenu.menu ? (
        <ContextMenu
          x={ctxMenu.menu.x}
          y={ctxMenu.menu.y}
          doc={ctxMenu.menu.doc}
          items={ctxMenu.menu.items}
          onClose={ctxMenu.close}
        />
      ) : null}
    </div>
  );
}
