import { describe, expect, it } from "vitest";
import { extractUserRegions, mergeUserRegions } from "./userRegions";

describe("userRegions (lecture des anciens scripts, pour la migration)", () => {
  it("extrait le corps d’une région", () => {
    const old = `\t-- @tfui:begin user:handlers\n\tlocal function onApply()\n\t\tprint("x")\n\tend\n\t-- @tfui:end user:handlers\n`;
    expect(extractUserRegions(old).get("handlers")).toContain('print("x")');
  });

  it("mergeUserRegions remplace uniquement les régions connues", () => {
    const generated = `-- @tfui:begin user:handlers
local function foo()
end
-- @tfui:end user:handlers
`;
    const previous = `-- @tfui:begin user:handlers
local function foo()
  return 1
end
-- @tfui:end user:handlers
`;
    const merged = mergeUserRegions(generated, previous);
    expect(merged).toContain("return 1");
  });
});
