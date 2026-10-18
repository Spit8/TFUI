import { describe, expect, it } from "vitest";
import { createScreen } from "../model/factory";
import { exportFileName } from "./previewExport";

describe("noms des exports PNG", () => {
  it("viewport avec sa résolution, UI à part, caractères sûrs", () => {
    const screen = { ...createScreen({ fileBase: "main gui", recipeName: "W" }), previewViewport: { w: 2560, h: 1080 } };
    expect(exportFileName(screen, "viewport")).toBe("main_gui_viewport_2560x1080.png");
    expect(exportFileName(screen, "ui")).toBe("main_gui_ui.png");
  });
});
