export {
  collectGenerationNotices,
  describeEffectiveFileBase,
  generateProject,
} from "./generate";
export {
  appendHandlerStubs,
  genHandlersFile,
  handlersFileName,
  handlersModulePath,
  missingHandlers,
} from "./handlersFile";
export { genScript } from "./genScript";
export { genCss } from "./genCss";
export { genRes } from "./genRes";
export { normalizeLua } from "./normalize";
export {
  extractUserRegions,
  mergeUserRegions,
  wrapUserRegion,
} from "./userRegions";
export { findLineForNode, findNodeAtLine } from "./sourceMap";
export { validateGeneratedFiles, validateLuaContent } from "./validateLua";
export { REWRITE_RULE_IDS, rewriteWindowOpenLua } from "./propEmit";
export type {
  GeneratedFile,
  GenerationNotice,
  LuaSyntaxError,
  SourceMapEntry,
} from "./types";
