import { describe, expect, it } from "vitest";
import { createEmptyProject, createNode } from "../model/factory";
import { genScript } from "./genScript";
import { findLineForNode, findNodeAtLine } from "./sourceMap";

describe("source map from genScript", () => {
  it("marque la racine et un enfant connus", () => {
    const project = createEmptyProject();
    const screen = project.screens[0]!;
    const text = createNode("Text", "Hello");
    text.props.text = { kind: "literal", value: "Hello" };
    screen.root.slots.content = [text];

    const file = genScript(project, screen);
    expect(file.sourceMap.length).toBeGreaterThan(0);

    const rootLine = findLineForNode(file.sourceMap, screen.root.id);
    expect(rootLine).not.toBeNull();
    expect(findNodeAtLine(file.sourceMap, rootLine!)).toBe(screen.root.id);

    const textLine = findLineForNode(file.sourceMap, text.id);
    expect(textLine).not.toBeNull();
    expect(findNodeAtLine(file.sourceMap, textLine!)).toBe(text.id);

    // La prop text est dans le span du nœud (souvent ligne suivante)
    const propLine =
      file.content.split("\n").findIndex((l) => /text\s*=/.test(l)) + 1;
    expect(propLine).toBeGreaterThan(0);
    expect(findNodeAtLine(file.sourceMap, propLine)).toBe(text.id);
  });

  it("findNodeAtLine préfère le span le plus étroit", () => {
    const project = createEmptyProject();
    const screen = project.screens[0]!;
    const box = createNode("BoxLayout", "Box");
    const text = createNode("Text", "T");
    text.props.text = { kind: "literal", value: "x" };
    box.slots.content = [text];
    screen.root.slots.content = [box];

    const file = genScript(project, screen);
    const textLine = findLineForNode(file.sourceMap, text.id)!;
    expect(findNodeAtLine(file.sourceMap, textLine)).toBe(text.id);
  });
});
