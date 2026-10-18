import { describe, expect, it } from "vitest";
import { axisPrefixesForField, isColorField } from "./axisPrefixes";

describe("axisPrefixesForField", () => {
  it("xy pour vec2 générique", () => {
    expect(
      axisPrefixesForField({ name: "pos", tealType: "Vec2f", kind: "vec2f" }),
    ).toEqual(["x", "y"]);
  });

  it("wh pour size", () => {
    expect(
      axisPrefixesForField({ name: "size", tealType: "Vec2f", kind: "vec2f" }),
    ).toEqual(["w", "h"]);
  });

  it("trbl pour spacing", () => {
    expect(
      axisPrefixesForField({
        name: "innerSpacing",
        tealType: "Vec4f",
        kind: "vec4f",
      }),
    ).toEqual(["t", "r", "b", "l"]);
  });

  it("rgba pour couleur", () => {
    const field = {
      name: "backgroundColor",
      tealType: "Vec4f",
      kind: "vec4f" as const,
    };
    expect(isColorField(field)).toBe(true);
    expect(axisPrefixesForField(field)).toEqual(["r", "g", "b", "a"]);
  });
});
