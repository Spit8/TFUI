import { describe, expect, it } from "vitest";
import { gameLogIssues, parseGameLog } from "./gameLog";

// Extrait au format du journal du jeu (messages génériques, mod fictif).
const SAMPLE = `[2026-10-16 21:10:22Z - VERBOSE  - Main Thread      - Main           ]  RegisterRecipeInner(889, DemoWindow) as wrapper around 39
[2026-10-16 21:10:24Z - ERROR    - Main Thread      - Main           ]+ Some other mod failed
    | DetailMessage: unrelated
[2026-10-16 21:10:29Z - ERROR    - Main Thread      - Main           ]+ Wrapper recipe must return child
    | DetailMessage: expectedRecipeId=39, expectedName=Window
    | Stacktrace:
    +     ::/gui/main/react.lua(282): ?
[2026-10-16 21:10:29Z - VERBOSE  - Main Thread      - Main           ]   (happened inside wrapper recipe recipeId = 889, name = DemoWindow
[2026-10-16 21:10:29Z - WARNING  - Main Thread      - Main           ]  NodeStorage.cpp:52: UI::react::NodeStorage::Get:  Assertion 'm_data->activeNodeIds[id]' failed
[2026-10-16 21:10:29Z - MESSAGE  - Main Thread      - Main           ]  Application: Calling HandleCrash
[2026-10-16 21:10:33Z - ERROR    - Main Thread      - Main           ]+ Wrapper recipe must return child
    | DetailMessage: expectedRecipeId=39, expectedName=Window
    +     ::/gui/main/react.lua(282): ?
`;

describe("journal du jeu", () => {
  it("découpe entrées et détails", () => {
    const entries = parseGameLog(SAMPLE);
    expect(entries).toHaveLength(7);
    expect(entries[2]).toMatchObject({ level: "ERROR", message: "Wrapper recipe must return child" });
    expect(entries[2]!.details[0]).toBe("DetailMessage: expectedRecipeId=39, expectedName=Window");
  });

  it("garde les erreurs du mod, la recette en cause et le crash, sans doublon", () => {
    const issues = gameLogIssues(parseGameLog(SAMPLE), {
      modId: "demo_mod",
      recipeNames: ["DemoWindow"],
    });
    const text = issues.map((i) => i.message).join("\n");
    expect(issues[0]!.message).toMatch(/a planté/);
    expect(text).toMatch(/Wrapper recipe must return child \(dans DemoWindow\)/);
    expect(text).toMatch(/expectedName=Window/);
    expect(text).toMatch(/Assertion/);
    expect(text).not.toMatch(/Some other mod/);
    expect(issues.filter((i) => /Wrapper recipe/.test(i.message))).toHaveLength(1);
  });
});
