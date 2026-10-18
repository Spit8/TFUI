import { describe, expect, it } from "vitest";
import { classifyTealType, isCatalogOutdated, parseBuiltinTeal } from "./parseTealDefs";

const MINI = `
global record Builtin
	record Type
		record Orientation
			Horizontal : Orientation
			Vertical : Orientation
		end
	end

	type : Type

	record BoxLayoutParam
		children : {TreeNodeId}
		child : TreeNodeId
		orientation : Type.Orientation
	end

	BoxLayout : Recipe<BoxLayoutParam>

	record ButtonParam
		onClick : function()
		content : TreeNodeId
	end

	Button : Recipe<ButtonParam>

	record WindowParam
		content : TreeNodeId
		header : TreeNodeId
		initialX : number
	end

	Window : RecipeWithApi<WindowParam, WindowAPI>
end
`;

describe("classifyTealType", () => {
  it("classe les types courants", () => {
    expect(classifyTealType("string").kind).toBe("string");
    expect(classifyTealType("{TreeNodeId}").kind).toBe("slot-multi");
    expect(classifyTealType("TreeNodeId").kind).toBe("slot-single");
    expect(classifyTealType("function()").kind).toBe("handler");
    expect(classifyTealType("Type.Orientation")).toEqual({
      kind: "enum",
      enumName: "Orientation",
    });
  });
});

describe("parseBuiltinTeal (miniature)", () => {
  it("extrait recipes, slots et enums", () => {
    const catalog = parseBuiltinTeal(MINI, "testhash");
    expect(catalog.sourceHash).toBe("testhash");
    expect(catalog.enums.Orientation).toEqual(["Horizontal", "Vertical"]);

    const box = catalog.components.find((c) => c.name === "BoxLayout");
    expect(box).toBeTruthy();
    expect(box!.fields.find((f) => f.name === "children")?.kind).toBe(
      "slot-multi",
    );
    expect(box!.fields.find((f) => f.name === "child")?.kind).toBe(
      "slot-single",
    );
    expect(box!.fields.find((f) => f.name === "orientation")?.kind).toBe(
      "enum",
    );

    const win = catalog.components.find((c) => c.name === "Window");
    expect(win!.fields.find((f) => f.name === "content")?.kind).toBe(
      "slot-single",
    );
    expect(win!.fields.find((f) => f.name === "initialX")?.kind).toBe("number");

    const btn = catalog.components.find((c) => c.name === "Button");
    expect(btn!.fields.find((f) => f.name === "onClick")?.kind).toBe("handler");
  });

  it("garde une valeur d’enum suivie d’un commentaire", () => {
    const catalog = parseBuiltinTeal(
      `
global record Builtin
	record Type
		record FloatingLayoutOverflowMode
			None : FloatingLayoutOverflowMode
			Overflow : FloatingLayoutOverflowMode -- ignore outerSpacing
			KeepInside : FloatingLayoutOverflowMode
		end
	end
	type : Type
end
`,
      "h",
    );
    expect(catalog.enums.FloatingLayoutOverflowMode).toEqual(["None", "Overflow", "KeepInside"]);
  });
});

describe("unions de scalaires", () => {
  it("integer|number|string → scalar", () => {
    expect(classifyTealType("integer|number|string").kind).toBe("scalar");
    expect(classifyTealType("integer | string").kind).toBe("scalar");
    expect(classifyTealType("integer|boolean").kind).toBe("unsupported");
    expect(classifyTealType("{number}").kind).toBe("number-list");
  });
});

describe("isCatalogOutdated", () => {
  it("reconnaît un cache sans version ou d’une autre version", () => {
    const fresh = parseBuiltinTeal(MINI, "h");
    expect(isCatalogOutdated(fresh)).toBe(false);
    expect(isCatalogOutdated({ ...fresh, parserVersion: undefined })).toBe(true);
    expect(isCatalogOutdated({ ...fresh, parserVersion: 1 })).toBe(true);
  });
});
