import { z } from "zod";

const propValueSchema: z.ZodType = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("literal"),
    value: z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.number()),
    ]),
  }),
  z.object({ kind: z.literal("enum"), value: z.string() }),
  z.object({ kind: z.literal("state"), stateVar: z.string() }),
  z.object({ kind: z.literal("handler"), fn: z.string() }),
  z.object({ kind: z.literal("lua"), code: z.string() }),
]);

const stylePropsSchema = z.record(z.string(), z.unknown());

const uiNodeSchema: z.ZodType = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    name: z.string().optional(),
    props: z.record(z.string(), propValueSchema),
    meta: z.object({
      id: z.string().optional(),
      class: z.array(z.string()).optional(),
      tooltip: z.string().optional(),
      enabled: propValueSchema.optional(),
      inlineStyle: stylePropsSchema.optional(),
    }),
    slots: z.record(z.string(), z.array(uiNodeSchema)),
    locked: z.boolean().optional(),
    hidden: z.boolean().optional(),
  }),
);

const stateVarSchema = z.object({
  name: z.string().min(1),
  initial: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

const screenSchema = z.object({
  id: z.string().min(1),
  fileBase: z.string().min(1),
  recipeName: z.string().min(1),
  kind: z.enum(["window", "recipe", "plugin"]),
  plugin: z
    .object({
      extensionPoint: z.literal("MainModButtonAreaExtension"),
      pluginName: z.string(),
      order: z.number(),
      buttonLabel: z.string(),
    })
    .optional(),
  state: z.array(stateVarSchema),
  root: uiNodeSchema,
  previewViewport: z.object({ w: z.number(), h: z.number() }),
});

export const tfuiProjectSchema = z.object({
  schemaVersion: z.literal(1),
  mod: z.object({
    modId: z.string().min(1),
    modRoot: z.string(),
    guiDir: z.string().min(1),
  }),
  screens: z.array(screenSchema),
  styleRules: z.array(
    z.object({
      id: z.string(),
      selector: z.string(),
      props: stylePropsSchema,
      comment: z.string().optional(),
      ownerNodeId: z.string().optional(),
      state: z.enum(["hover", "active", "disabled"]).optional(),
    }),
  ),
  catalogHash: z.string(),
  lastWrittenFiles: z.array(z.string()).optional(),
});

export type TfuiProjectParsed = z.infer<typeof tfuiProjectSchema>;
