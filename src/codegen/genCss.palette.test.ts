import { describe, expect, it } from "vitest";
import { createEmptyProject } from "../model/factory";
import { genCss } from "./genCss";
import { emitStylePropsTable } from "./propEmit";
import { validateLuaContent } from "./validateLua";

const ACCESS = 'api.gui.genericRep.get(api.gui.genericRep.find("::/gui/main/default_colors.gres")).data';

describe("couleurs de la palette du jeu (convention vanilla colorDefault)", () => {
  it("émet colorDefault.X et déclare la palette une seule fois", () => {
    const project = createEmptyProject({ modId: "m" });
    project.styleRules = [
      { id: "a", selector: "TextView!title", props: { color: { kind: "palette", name: "AccentLight" } } },
      {
        id: "b",
        selector: "BoxLayout!panel",
        props: { backgroundColor1: { kind: "palette", name: "BaseDark", alpha: 0.5 } },
      },
    ];
    const css = genCss(project, project.screens[0]!).content;
    expect(css).toContain("\t\tcolor = colorDefault.AccentLight,");
    expect(css).toContain(
      "backgroundColor1 = { colorDefault.BaseDark[1], colorDefault.BaseDark[2], colorDefault.BaseDark[3], 0.5 },",
    );
    expect(css.split(`local colorDefault = ${ACCESS}`).length).toBe(2);
    expect(css.indexOf("local colorDefault")).toBeLessThan(css.indexOf('\ta("'));
    expect(validateLuaContent("x.css.lua", css)).toEqual([]);
  });

  it("ne déclare pas la palette sans couleur nommée", () => {
    const project = createEmptyProject({ modId: "m" });
    project.styleRules = [{ id: "a", selector: "TextView", props: { color: [1, 0, 0, 1] } }];
    expect(genCss(project, project.screens[0]!).content).not.toContain("colorDefault");
  });

  it("style inline : accès complet à la palette, Lua valide", () => {
    const table = emitStylePropsTable({ color: { kind: "palette", name: "Warning" } }, 2);
    expect(table).toContain(`color = (${ACCESS}).Warning,`);
    expect(validateLuaContent("x.lua", `local t = ${table}`)).toEqual([]);
  });
});
