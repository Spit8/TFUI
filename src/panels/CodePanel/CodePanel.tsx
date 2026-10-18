import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { useEffect, useMemo, useRef, useState } from "react";
import { codePanelMenuItems } from "../../app/menus/contextMenus";
import { findNodeAtLine } from "../../codegen";
import {
  takePendingCodeReveal,
  usePendingCodeReveal,
} from "../../store/codeRevealStore";
import { useGeneratedFiles } from "../../store/generatedFilesStore";
import { useProjectStore } from "../../store/projectStore";
import { ContextMenu } from "../../ui/menu/ContextMenu";
import { useContextMenu } from "../../ui/menu/useContextMenu";
import "./CodePanel.css";
import { t, useT } from "../../i18n";

export function CodePanel() {
  useT();
  const project = useProjectStore((s) => s.project);
  const setSelection = useProjectStore((s) => s.setSelection);
  const { files } = useGeneratedFiles();
  const [activePath, setActivePath] = useState<string | null>(null);
  const ctxMenu = useContextMenu();
  const activeRef = useRef<(typeof files)[number] | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const pendingReveal = usePendingCodeReveal();

  useEffect(() => {
    setActivePath((cur) =>
      cur && files.some((f) => f.path === cur) ? cur : (files[0]?.path ?? null),
    );
  }, [files]);

  const active = useMemo(
    () => files.find((f) => f.path === activePath) ?? null,
    [files, activePath],
  );
  activeRef.current = active;

  useEffect(() => {
    if (!pendingReveal) return;
    const req = takePendingCodeReveal();
    if (!req) return;
    if (req.path) {
      const match = files.find((f) => f.path === req.path);
      if (match) setActivePath(match.path);
    } else if (files.length > 0) {
      const byNode = files.find((f) =>
        f.sourceMap.some((e) => e.nodeId === req.nodeId),
      );
      if (byNode) setActivePath(byNode.path);
    }
    const reveal = () => {
      const ed = editorRef.current;
      if (!ed) return;
      ed.revealLineInCenter(req.line);
      ed.setPosition({ lineNumber: req.line, column: 1 });
      ed.focus();
    };
    // Wait a tick for tab switch / mount
    requestAnimationFrame(reveal);
  }, [pendingReveal, files]);

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.onMouseDown((e) => {
      const line = e.target.position?.lineNumber;
      const cur = activeRef.current;
      if (!line || !cur) return;
      const nodeId = findNodeAtLine(cur.sourceMap, line);
      if (!nodeId || !cur.screenId) return;
      setSelection(cur.screenId, nodeId);
    });
  };

  if (!project) {
    return (
      <div className="code-panel">
        <div className="code-empty">{t("codePanel.noProject")}</div>
      </div>
    );
  }

  return (
    <div
      className="code-panel"
      onContextMenu={(e) => {
        if ((e.target as Element).closest(".monaco-editor")) return;
        ctxMenu.open(e, codePanelMenuItems());
      }}
    >
      <div className="code-tabs">
        {files.map((f) => (
          <button
            key={f.path}
            type="button"
            className={f.path === activePath ? "active" : ""}
            onClick={() => setActivePath(f.path)}
          >
            {f.path}
          </button>
        ))}
      </div>
      <div className="code-editor">
        {active ? (
          <Editor
            height="100%"
            language="lua"
            theme="vs-dark"
            value={active.content}
            path={active.path}
            onMount={onMount}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 12,
              lineHeight: 18,
              scrollBeyondLastLine: false,
              wordWrap: "on",
            }}
          />
        ) : (
          <div className="code-empty">{t("codePanel.generating")}</div>
        )}
      </div>
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
