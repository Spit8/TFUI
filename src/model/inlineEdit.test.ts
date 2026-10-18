import { describe, expect, it } from "vitest";
import { inlineEditTarget } from "./inlineEdit";
import type { PropValue, UiNode } from "./types";

function node(id: string, type: string, props: Record<string, PropValue> = {}, slots: Record<string, UiNode[]> = {}): UiNode {
  return { id, type, name: `${type}-${id}`, props, meta: {}, slots };
}
const lit = (value: string): PropValue => ({ kind: "literal", value });

describe("cible du double-clic dans l’aperçu", () => {
  it("TextView : son texte, s’il est littéral", () => {
    expect(inlineEditTarget(node("t", "TextView", { text: lit("Bonjour") }))).toEqual({
      mode: "text",
      nodeId: "t",
      prop: "text",
      value: "Bonjour",
    });
    expect(inlineEditTarget(node("t", "TextView")).mode).toBe("text");
    const fromState = node("t", "TextView", { text: { kind: "state", stateVar: "label" } });
    expect(inlineEditTarget(fromState)).toEqual({ mode: "name", nodeId: "t", value: "TextView-t" });
  });

  it("Button : le texte de son unique TextView, même imbriqué", () => {
    const label = node("l", "TextView", { text: lit("OK") });
    const btn = node("b", "Button", {}, { content: [node("x", "BoxLayout", {}, { children: [label] })] });
    expect(inlineEditTarget(btn)).toMatchObject({ mode: "text", nodeId: "l", value: "OK" });
  });

  it("Button sans texte ou avec plusieurs textes : son nom", () => {
    expect(inlineEditTarget(node("b", "Button")).mode).toBe("name");
    const two = node("b", "Button", {}, { content: [node("a", "TextView"), node("c", "TextView")] });
    expect(inlineEditTarget(two)).toMatchObject({ mode: "name", nodeId: "b" });
  });

  it("Window : son titre", () => {
    expect(inlineEditTarget(node("w", "Window", { title: lit("Ma fenêtre") }))).toEqual({
      mode: "text",
      nodeId: "w",
      prop: "title",
      value: "Ma fenêtre",
    });
  });

  it("TextButton : sa prop text ; autre élément : son nom", () => {
    expect(inlineEditTarget(node("b", "TextButton", { text: lit("Go") }))).toMatchObject({ mode: "text", nodeId: "b" });
    expect(inlineEditTarget(node("x", "BoxLayout"))).toEqual({ mode: "name", nodeId: "x", value: "BoxLayout-x" });
  });
});
