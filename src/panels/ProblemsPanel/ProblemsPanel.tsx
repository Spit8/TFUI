import { useEffect, useMemo, useState } from "react";
import { setPendingProblemTarget } from "../../app/commands/miscCommands";
import { problemsRowMenuItems } from "../../app/menus/contextMenus";
import type { GenerationNotice, LuaSyntaxError } from "../../codegen";
import type { ValidationIssue } from "../../model/types";
import { isVersioned } from "../../tauri/commands";
import { dirname } from "../../tauri/pathUtil";
import { useGeneratedFiles } from "../../store/generatedFilesStore";
import { useProjectStore } from "../../store/projectStore";
import {
  useRuntimeIssuesStore,
  type RuntimeIssue,
} from "../../store/runtimeIssuesStore";
import { useTealIssuesStore } from "../../store/tealIssuesStore";
import { userCodeIssueMessage, useUserCodeStore } from "../../store/userCodeStore";
import { handlerStub } from "../../codegen/handlersFile";
import { ContextMenu } from "../../ui/menu/ContextMenu";
import { useContextMenu } from "../../ui/menu/useContextMenu";
import { t, useI18nStore, useT } from "../../i18n";
import { backendMessage } from "../../i18n/backend";

type Row =
  | { kind: "model"; issue: ValidationIssue }
  | { kind: "lua"; error: LuaSyntaxError }
  | { kind: "rewrite"; notice: GenerationNotice }
  | { kind: "teal"; line: string; severity: "error" | "warning" | "info" }
  | { kind: "runtime"; issue: RuntimeIssue }
  | { kind: "project"; message: string; copy?: string };


function tealSeverity(line: string): "error" | "warning" | "info" {
  const lower = line.toLowerCase();
  if (lower.startsWith("error") || lower.includes(" error:")) return "error";
  if (lower.startsWith("info:") || lower.startsWith("ok:")) return "info";
  return "warning";
}

export function ProblemsPanel() {
  useT();
  // Messages recalculés dans la nouvelle langue.
  const messages = useI18nStore((s) => s.messages);
  const project = useProjectStore((s) => s.project);
  const validationIssues = useProjectStore((s) => s.validationIssues);
  const setSelection = useProjectStore((s) => s.setSelection);
  const tealLines = useTealIssuesStore((s) => s.lines);
  const { luaErrors, notices } = useGeneratedFiles();
  const executionIssues = useRuntimeIssuesStore((s) => s.execution);
  const gameIssues = useRuntimeIssuesStore((s) => s.game);
  const ctxMenu = useContextMenu();
  const projectPath = useProjectStore((s) => s.projectPath);
  const userCodeIssues = useUserCodeStore((s) => s.issues);
  const [versioned, setVersioned] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!projectPath) {
      setVersioned(true);
      return;
    }
    // Hors Tauri (banc de rendu) : pas d’avertissement.
    isVersioned(dirname(projectPath))
      .then((v) => alive && setVersioned(v))
      .catch(() => alive && setVersioned(true));
    return () => {
      alive = false;
    };
  }, [projectPath]);

  const rows = useMemo(() => {
    if (!project) return [] as Row[];
    const model: Row[] = validationIssues().map((issue) => ({
      kind: "model" as const,
      issue,
    }));
    const lua: Row[] = luaErrors.map((error) => ({
      kind: "lua" as const,
      error,
    }));
    const rewrite: Row[] = notices.map((notice) => ({
      kind: "rewrite" as const,
      notice,
    }));
    const teal: Row[] = tealLines.map((line) => ({
      kind: "teal" as const,
      line,
      severity: tealSeverity(line),
    }));
    const runtime: Row[] = [...gameIssues, ...executionIssues].map((issue) => ({
      kind: "runtime" as const,
      issue,
    }));
    const projectRows: Row[] = userCodeIssues.map((issue) => ({
      kind: "project" as const,
      message: userCodeIssueMessage(issue),
      // Clic droit › Copier : les stubs à coller dans le fichier.
      copy: issue.kind === "missing" ? issue.handlers.map(handlerStub).join("\n") : undefined,
    }));
    if (!versioned) projectRows.push({ kind: "project", message: t("problems.unversioned") });
    return [...runtime, ...model, ...rewrite, ...lua, ...teal, ...projectRows];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `messages` : recalcul au changement de langue
  }, [
    versioned,
    messages,
    userCodeIssues,
    project,
    validationIssues,
    tealLines,
    luaErrors,
    notices,
    executionIssues,
    gameIssues,
  ]);

  if (!project) {
    return (
      <div style={{ padding: "0.75rem", color: "var(--muted)" }}>
        {t("common.noProject")}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div style={{ padding: "0.75rem", color: "var(--muted)" }}>
        {t("problems.none")}
      </div>
    );
  }

  return (
    <>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: "0.35rem 0",
          fontSize: 13,
        }}
      >
        {rows.map((row, i) => {
          if (row.kind === "model") {
            const { issue } = row;
            return (
              <li key={`m-${issue.code}-${issue.nodeId ?? ""}-${i}`}>
                <button
                  type="button"
                  onClick={() => {
                    if (issue.screenId || issue.nodeId) {
                      setSelection(
                        issue.screenId ?? null,
                        issue.nodeId ?? null,
                      );
                    }
                  }}
                  onContextMenu={(e) => {
                    setPendingProblemTarget(
                      issue.message,
                      issue.screenId ?? null,
                      issue.nodeId ?? null,
                    );
                    ctxMenu.open(e, problemsRowMenuItems());
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    background: "transparent",
                    color: issue.severity === "error" ? "#ffb4b4" : "#ffe6a8",
                    padding: "0.35rem 0.75rem",
                    cursor: issue.nodeId ? "pointer" : "default",
                  }}
                >
                  [{issue.severity}] {issue.message}
                </button>
              </li>
            );
          }
          if (row.kind === "rewrite") {
            const { notice } = row;
            return (
              <li key={`r-${notice.id}-${notice.nodeId ?? ""}-${i}`}>
                <button
                  type="button"
                  onClick={() => {
                    if (notice.screenId || notice.nodeId) {
                      setSelection(
                        notice.screenId ?? null,
                        notice.nodeId ?? null,
                      );
                    }
                  }}
                  onContextMenu={(e) => {
                    setPendingProblemTarget(
                      notice.message,
                      notice.screenId ?? null,
                      notice.nodeId ?? null,
                    );
                    ctxMenu.open(e, problemsRowMenuItems());
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    background: "transparent",
                    color: "#9aa7b5",
                    padding: "0.35rem 0.75rem",
                    cursor: notice.nodeId ? "pointer" : "default",
                  }}
                >
                  [info] {notice.message}
                </button>
              </li>
            );
          }
          if (row.kind === "runtime") {
            const { issue } = row;
            const [first, ...rest] = issue.message.split("\n");
            const color =
              issue.severity === "error"
                ? "#ffb4b4"
                : issue.severity === "info"
                  ? "#9aa7b5"
                  : "#ffe6a8";
            return (
              <li key={`x-${i}`}>
                <div
                  style={{ padding: "0.35rem 0.75rem", color }}
                  title={rest.length > 0 ? issue.message : undefined}
                  onContextMenu={(e) => {
                    setPendingProblemTarget(issue.message, null, null);
                    ctxMenu.open(e, problemsRowMenuItems());
                  }}
                >
                  [{issue.source === "game" ? t("problems.sourceGame") : t("problems.sourceExecution")}]{" "}
                  {issue.file ? `${issue.file} — ` : ""}
                  {first}
                </div>
              </li>
            );
          }
          if (row.kind === "project") {
            return (
              <li key={`p-${i}`}>
                <div
                  style={{ padding: "0.35rem 0.75rem", color: "#ffe6a8" }}
                  onContextMenu={(e) => {
                    setPendingProblemTarget(row.copy ?? row.message, null, null);
                    ctxMenu.open(e, problemsRowMenuItems());
                  }}
                >
                  [{t("problems.project")}] {row.message}
                </div>
              </li>
            );
          }
          if (row.kind === "teal") {
            const color =
              row.severity === "error"
                ? "#ffb4b4"
                : row.severity === "info"
                  ? "#9aa7b5"
                  : "#ffe6a8";
            return (
              <li key={`t-${i}`}>
                <div
                  style={{ padding: "0.35rem 0.75rem", color }}
                  onContextMenu={(e) => {
                    setPendingProblemTarget(row.line, null, null);
                    ctxMenu.open(e, problemsRowMenuItems());
                  }}
                >
                  [teal] {backendMessage(row.line)}
                </div>
              </li>
            );
          }
          const { error } = row;
          return (
            <li key={`l-${error.path}-${error.line ?? ""}-${i}`}>
              <div
                style={{
                  padding: "0.35rem 0.75rem",
                  color: "#ffb4b4",
                }}
                onContextMenu={(e) => {
                  setPendingProblemTarget(
                    `${error.path}: ${error.message}`,
                    null,
                    null,
                  );
                  ctxMenu.open(e, problemsRowMenuItems());
                }}
              >
                [lua] {error.path}
                {error.line != null ? `:${error.line}` : ""} — {error.message}
              </div>
            </li>
          );
        })}
      </ul>
      {ctxMenu.menu ? (
        <ContextMenu
          x={ctxMenu.menu.x}
          y={ctxMenu.menu.y}
          doc={ctxMenu.menu.doc}
          items={ctxMenu.menu.items}
          onClose={ctxMenu.close}
        />
      ) : null}
    </>
  );
}
