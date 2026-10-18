import { describe, expect, it } from "vitest";
import { isTypingTarget, shouldIgnoreShortcut } from "./isTypingTarget";

function fake(
  tag: string,
  opts?: { contentEditable?: boolean; monaco?: boolean; inputarea?: boolean },
) {
  return {
    tagName: tag,
    isContentEditable: opts?.contentEditable ?? false,
    classList: { contains: (c: string) => !!opts?.inputarea && c === "inputarea" },
    closest: (sel: string) =>
      opts?.monaco && sel === ".monaco-editor" ? {} : null,
  };
}

describe("isTypingTarget (R3)", () => {
  it("détecte input / textarea / select", () => {
    expect(isTypingTarget(fake("INPUT") as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget(fake("TEXTAREA") as unknown as EventTarget)).toBe(
      true,
    );
    expect(isTypingTarget(fake("SELECT") as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget(fake("DIV") as unknown as EventTarget)).toBe(false);
  });

  it("détecte Monaco / contenteditable", () => {
    expect(
      isTypingTarget(
        fake("TEXTAREA", { monaco: true }) as unknown as EventTarget,
      ),
    ).toBe(true);
    expect(
      isTypingTarget(
        fake("DIV", { contentEditable: true }) as unknown as EventTarget,
      ),
    ).toBe(true);
  });

  it("laisse passer Ctrl+S même dans un input", () => {
    const target = fake("INPUT") as unknown as EventTarget;
    expect(shouldIgnoreShortcut({ target }, true)).toBe(false);
    expect(shouldIgnoreShortcut({ target }, false)).toBe(true);
  });
});
