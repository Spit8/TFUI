import { useEffect, useMemo, useState } from "react";
import { useCatalog } from "../catalog/CatalogContext";
import {
  elementRuleSelectors,
  findElementRule,
  STYLE_STATE_LABELS,
  STYLE_STATES,
  type StyleState,
} from "../model/elementStyle";
import type { StyleVocabulary } from "../catalog/types";
import { allowedStyleKeys } from "../model/styleKeys";
import type { Screen, TfuiProject, UiNode } from "../model/types";
import {
  resolveStylesWithOrigin,
  type StyleOrigin,
} from "../preview/cascade";
import { useProjectStore } from "../store/projectStore";
import { useStylePreviewStore } from "../store/stylePreviewStore";
import { StyleKeyAdder, StyleRow } from "./StyleRows";
import { initialStyleValue, isPreviewedStyleKey } from "./styleValue";
import { usePendingKeys } from "./usePendingKeys";
import { t } from "../i18n";
import { Rich } from "../i18n/Rich";

type Tab = StyleState | "normal";

function OriginBadge({
  origin,
  tab,
  onOpenRule,
}: {
  origin: StyleOrigin | undefined;
  tab: Tab;
  onOpenRule: (ruleId: string) => void;
}) {
  if (!origin) return null;
  if (origin.kind === "game") {
    const file = origin.file.split("/").pop();
    return (
      <span
        className="style-badge game"
        title={t("nodeStyle.gameDefault", { file: file ?? "", selector: origin.selector })}
      >
        {t("nodeStyle.game")}
      </span>
    );
  }
  if (origin.kind === "element") {
    const own = (origin.state ?? "normal") === tab;
    return (
      <span
        className={`style-badge${own ? " own" : ""}`}
        title={own ? t("nodeStyle.ownHint") : t("nodeStyle.inheritedHint")}
      >
        {own ? t("nodeStyle.own") : t("nodeStyle.inherited")}
      </span>
    );
  }
  if (origin.kind === "inline") {
    return (
      <span className="style-badge" title={t("nodeStyle.inlineHint")}>
        {t("nodeStyle.inline")}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="style-badge"
      title={t("nodeStyle.sharedClass", { selector: origin.selector })}
      onClick={() => onOpenRule(origin.ruleId)}
    >
      {origin.selector}
    </button>
  );
}

/**
 * Style de l’élément sélectionné : une ligne par propriété avec sa valeur
 * effective et sa provenance. Toute modification est écrite dans la règle de
 * l’élément (onglet courant) et visible aussitôt dans l’aperçu.
 */
export function NodeStyleSection({
  project,
  screen,
  node,
  vocabulary,
  onOpenRule,
}: {
  project: TfuiProject;
  screen: Screen;
  node: UiNode;
  vocabulary: StyleVocabulary | null;
  onOpenRule: (ruleId: string) => void;
}) {
  // Propriétés autorisées pour ce type (vanilla + socle, model/styleKeys.ts).
  const allowed = useMemo(() => allowedStyleKeys(node.type, vocabulary), [node.type, vocabulary]);
  // Défaut du jeu : jamais signalé ; sinon, une clé hors liste est barrée.
  const refusedHint = (k: string) =>
    resolved.origins[k]?.kind === "game" || allowed.keys.has(k)
      ? undefined
      : t("styleRows.notAllowed", { key: k, elements: node.type });
  const setNodeStyle = useProjectStore((s) => s.setNodeStyle);
  const setPreviewState = useStylePreviewStore((s) => s.setPreviewState);
  const [tab, setTab] = useState<Tab>("normal");
  const state = tab === "normal" ? null : tab;

  // L’aperçu montre l’état en cours d’édition pour ce nœud.
  useEffect(() => {
    setPreviewState(node.id, state);
    return () => setPreviewState(null, null);
  }, [node.id, state, setPreviewState]);

  // Re-calcul quand les styles de base du jeu changent (re-scan).
  const { baseStyles } = useCatalog();
  const resolved = useMemo(
    () => resolveStylesWithOrigin(project, screen, node, state),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- baseStyles lu via la cascade
    [project, screen, node, state, baseStyles],
  );
  const values = resolved.values as Record<string, unknown>;
  // Défauts du jeu que l’aperçu ne rend pas (sons, images 9-patch,
  // transitions…) : résumés, pas listés.
  const hiddenGameKeys = Object.keys(values).filter(
    (k) => resolved.origins[k]?.kind === "game" && !isPreviewedStyleKey(k),
  );
  const keys = Object.keys(values).filter((k) => !hiddenGameKeys.includes(k));
  const pending = usePendingKeys(keys);
  const own = findElementRule(project, node.id, state);
  const ownKeys = new Set(Object.keys(own?.props ?? {}));

  return (
    <div className="style-section">
      <div className="style-tabs" role="tablist">
        {(["normal", ...STYLE_STATES] as Tab[]).map((st) => {
          const has = Boolean(
            findElementRule(project, node.id, st === "normal" ? null : st),
          );
          return (
            <button
              key={st}
              type="button"
              role="tab"
              aria-selected={tab === st}
              className={`style-tab${tab === st ? " active" : ""}`}
              onClick={() => setTab(st)}
              title={
                st === "normal"
                  ? t("nodeStyle.defaultStyle")
                  : t("nodeStyle.stateStyle", { state: STYLE_STATE_LABELS[st].toLowerCase(), key: st })
              }
            >
              {STYLE_STATE_LABELS[st]}
              {has ? <span className="dot" aria-label={t("nodeStyle.defined")} /> : null}
            </button>
          );
        })}
      </div>

      <div className="style-rows">
        {keys.length === 0 && pending.keys.length === 0 ? (
          <div className="style-empty">
            {state ? t("nodeStyle.emptyState", { state: STYLE_STATE_LABELS[tab] }) : t("nodeStyle.empty")}
          </div>
        ) : null}
        {keys.map((k) => (
          <StyleRow
            key={k}
            styleKey={k}
            value={values[k]}
            muted={!ownKeys.has(k)}
            notAllowed={refusedHint(k)}
            badge={
              <OriginBadge origin={resolved.origins[k]} tab={tab} onOpenRule={onOpenRule} />
            }
            onCommit={(v) => setNodeStyle(node.id, state, k, v)}
            onRemove={
              ownKeys.has(k) ? () => setNodeStyle(node.id, state, k, undefined) : undefined
            }
          />
        ))}
        {pending.keys.map((k) => (
          <StyleRow
            key={k}
            styleKey={k}
            value={undefined}
            onCommit={(v) => setNodeStyle(node.id, state, k, v)}
            onRemove={() => pending.remove(k)}
          />
        ))}
        {hiddenGameKeys.length > 0 ? (
          <div
            className="style-hidden-game"
            title={hiddenGameKeys
              .map((k) => {
                const o = resolved.origins[k];
                return o?.kind === "game" ? `${k} — ${o.selector}` : k;
              })
              .join("\n")}
          >
            {t("nodeStyle.hiddenGame", { n: hiddenGameKeys.length })}
          </div>
        ) : null}
        <StyleKeyAdder
          allowed={allowed}
          exclude={[...keys, ...pending.keys]}
          onAdd={(k) => {
            const v = initialStyleValue(k, values[k]);
            if (v === undefined) pending.add(k);
            else setNodeStyle(node.id, state, k, v);
          }}
        />
      </div>

      <div className="style-where">
        {own ? (
          <Rich
            k="nodeStyle.writtenIn"
            slots={{ selectors: <code>{elementRuleSelectors(screen, node.id, state ?? undefined).join(", ")}</code> }}
          />
        ) : (
          t("nodeStyle.nothingDefined")
        )}
      </div>
    </div>
  );
}
