import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FIXTURES_SKIP_MESSAGE,
  fixturesBaseTealdef,
  fixturesLinked,
} from "./fixtures";
import { hashText } from "./hash";
import { buildManualHelperComponents } from "./overrides";
import { mergeHelperComponents, parseBuiltinTeal } from "./parseTealDefs";

describe.skipIf(!fixturesLinked())("extract-catalog (jeu lié)", () => {
  it(FIXTURES_SKIP_MESSAGE, () => {
    expect(fixturesLinked()).toBe(true);
  });

  it("extrait BoxLayout, Window, Button et ≥ 25 recipes", () => {
    const source = readFileSync(
      join(fixturesBaseTealdef(), "scripts", "builtin.d.tl"),
      "utf8",
    );
    let catalog = parseBuiltinTeal(source, hashText(source));
    catalog = mergeHelperComponents(catalog, buildManualHelperComponents());

    expect(catalog.components.length).toBeGreaterThanOrEqual(25);

    const box = catalog.components.find((c) => c.name === "BoxLayout");
    expect(box).toBeTruthy();
    expect(box!.fields.find((f) => f.name === "children")?.kind).toBe(
      "slot-multi",
    );
    expect(box!.fields.find((f) => f.name === "child")?.kind).toBe(
      "slot-single",
    );
    const orient = box!.fields.find((f) => f.name === "orientation");
    expect(orient?.kind).toBe("enum");
    expect(orient?.enumName).toBe("Orientation");
    expect(catalog.enums.Orientation).toContain("Vertical");

    const win = catalog.components.find((c) => c.name === "Window");
    expect(win).toBeTruthy();
    expect(win!.fields.find((f) => f.name === "content")?.kind).toBe(
      "slot-single",
    );
    expect(win!.fields.find((f) => f.name === "header")?.kind).toBe(
      "slot-single",
    );
    expect(win!.fields.find((f) => f.name === "initialX")?.kind).toBe("number");

    const btn = catalog.components.find((c) => c.name === "Button");
    expect(btn!.fields.find((f) => f.name === "onClick")?.kind).toBe("handler");
  });
});
