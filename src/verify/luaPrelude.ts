/**
 * Prélude Lua du banc d’exécution : remplace le moteur C++ de TF3 (contexte
 * de recette, userdata des paramètres, API fenêtre) pour exécuter le **vrai**
 * `react.lua` / `builtin.lua` / `stylesheetutil.lua` du jeu sur le code généré.
 *
 * Ce qui est simulé est volontairement minimal ; ce qui est vérifié :
 * - erreurs Lua (syntaxe, indice sur nil, require introuvable) ;
 * - noms et types des champs des paramètres builtin (d’après `builtin.d.tl`,
 *   via le catalogue) — comme `makeUserdata` du jeu ;
 * - valeurs d’enum inconnues ;
 * - racine d’une recette wrapper (`checkRecipeMatch`, crash
 *   « Wrapper recipe must return child ») ;
 * - clic sur les boutons (onClick) et ouverture des fenêtres qu’ils demandent.
 *
 * Les variables `__fieldTables`, `__enumTables` et `__readFile` sont fournies
 * par le code JS avant ce prélude.
 */
export const LUA_PRELUDE = String.raw`
local issues = {}
local function issue(severity, message)
  issues[#issues + 1] = { severity = severity, message = tostring(message) }
end

-- Message traduit côté éditeur : E:harness.<clé>:{json} (clé backend.harness.* de fr.json).
local function code(key, params)
  local parts = {}
  for k, v in pairs(params or {}) do
    local s = tostring(v):gsub('[%c"\\]', function(c)
      if c == '"' then return '\\"' elseif c == "\\" then return "\\\\" elseif c == "\n" then return "\\n" end
      return string.format("\\u%04x", string.byte(c))
    end)
    parts[#parts + 1] = '"' .. k .. '":"' .. s .. '"'
  end
  table.sort(parts)
  return "E:harness." .. key .. ":{" .. table.concat(parts, ",") .. "}"
end

local function joinArgs(...)
  local parts = {}
  for i = 1, select("#", ...) do parts[#parts + 1] = tostring((select(i, ...))) end
  return table.concat(parts, " ")
end

log = {
  error = function(...) issue("error", joinArgs(...)) end,
  warning = function(...) issue("warning", joinArgs(...)) end,
  verbose = function() end,
  info = function() end,
}
debugPrint = function() end
toString = tostring
_ = function(s) return s end

-- Extensions de la bibliothèque string fournies par le jeu.
function string.split(s, sep)
  local out, start = {}, 1
  while true do
    local i, j = string.find(s, sep, start, true)
    if not i then out[#out + 1] = string.sub(s, start); break end
    out[#out + 1] = string.sub(s, start, i - 1)
    start = j + 1
  end
  return out
end
function string.strip(s) return (s:gsub("^%s+", ""):gsub("%s+$", "")) end
function string.ends(s, suffix) return suffix == "" or s:sub(-#suffix) == suffix end
function string.starts(s, prefix) return s:sub(1, #prefix) == prefix end

-- Table « tout permis » pour les parties de l’API non simulées.
local function permissive(name)
  return setmetatable({}, {
    __index = function(t, k)
      local v = permissive(name .. "." .. tostring(k))
      rawset(t, k, v)
      return v
    end,
    __call = function() return nil end,
    __tostring = function() return name end,
  })
end

-- ── Identifiants de recettes ────────────────────────────────────────────
local nextRecipeId = 1
local recipeNames = {}
local function newRecipeId(name)
  local id = nextRecipeId
  nextRecipeId = nextRecipeId + 1
  recipeNames[id] = name
  return id
end
local function nameOf(id)
  return id and (recipeNames[id] or ("#" .. tostring(id))) or "rien"
end

_react = {
  builtin = setmetatable({}, {
    __index = function(t, name)
      local id = newRecipeId(name)
      rawset(t, name, id)
      return id
    end,
  }),
  recipes = {}, recipeMetas = {}, originalRecipeFn = {}, recipeReplace = {},
  extensionPoints = {}, tools = {}, recipeReplacementAllowed = true,
}

-- ── Nœuds et userdata des paramètres ────────────────────────────────────
local rawtype = type
local NODE_MT = { __tfui_node = true, __tostring = function(n) return "TreeNodeId(" .. n.__id .. ")" end }
local function isNode(v) return rawtype(v) == "table" and getmetatable(v) == NODE_MT end
local USERDATA_MT = {}
-- Dans le jeu, TreeNodeId et les paramètres builtin sont des userdata C++ :
-- react.lua teste type(x) == "userdata", on fait de même ici.
type = function(v)
  if isNode(v) or (rawtype(v) == "table" and USERDATA_MT[v]) then return "userdata" end
  return rawtype(v)
end

local ENUM_MT = { __tfui_enum = true }
local enumCache = {}
local function makeEnum(name, values)
  if enumCache[name] then return enumCache[name] end
  local set = {}
  for _, v in ipairs(values) do set[v] = setmetatable({ enum = name, value = v }, ENUM_MT) end
  local e = setmetatable({}, {
    __index = function(_, k)
      local token = set[k]
      if token == nil then error(code("enumUnknown", { name = name, value = tostring(k) }), 2) end
      return token
    end,
  })
  enumCache[name] = e
  return e
end

-- Vecteurs \`api.type.VecXX.new(…)\` (api/type.d.tl), seule forme acceptée par
-- les champs \`Vec2i\`/\`Vec2f\`/\`Vec3f\`/\`Vec4f\` des paramètres.
local VECTOR_TYPES = { vec2i = "Vec2i", vec2f = "Vec2f", vec3f = "Vec3f", vec4f = "Vec4f" }
local VECTOR_MT = { __tfui_vector = true }
local function vectorClass(kind, axes)
  return {
    new = function(...)
      local args = { ... }
      local v = setmetatable({ __vector = kind }, VECTOR_MT)
      for i, axis in ipairs(axes) do v[axis] = args[#args == 1 and 1 or i] or 0 end
      return v
    end,
  }
end

local function checkValue(paramName, key, kind, v)
  if v == nil then return end
  local t = rawtype(v)
  local ok = true
  if kind == "string" then ok = t == "string"
  elseif kind == "number" or kind == "integer" then ok = t == "number"
  elseif kind == "boolean" then ok = t == "boolean"
  elseif kind == "handler" then ok = t == "function"
  elseif kind == "slot-single" then ok = isNode(v)
  elseif kind == "slot-multi" then
    ok = t == "table" and not isNode(v)
    if ok then for _, c in ipairs(v) do if not isNode(c) then ok = false end end end
  elseif kind == "enum" then ok = t == "table" and getmetatable(v) == ENUM_MT
  elseif kind == "scalar" then ok = t == "number" or t == "string"
  elseif kind == "number-list" then
    ok = t == "table" and getmetatable(v) == nil
    if ok then for _, n in ipairs(v) do if rawtype(n) ~= "number" then ok = false end end end
  elseif VECTOR_TYPES[kind] then
    -- Champ userdata C++ : le jeu refuse une table Lua (« Could not assign
    -- value to userdata 'size' », constaté le 2026-10-18).
    if not (t == "table" and getmetatable(v) == VECTOR_MT and v.__vector == kind) then
      error(code("vectorExpected", { field = paramName .. "." .. key, type = VECTOR_TYPES[kind], got = t }), 3)
    end
  end
  if not ok then
    error(code("wrongType", { field = paramName .. "." .. key, kind = kind, got = t }), 3)
  end
end

local function makeClass(name, fields)
  return {
    new = function(src)
      local data = {}
      local obj = setmetatable({}, {
        __tfui_userdata = name,
        __index = function(_, k) return data[k] end,
        __newindex = function(_, k, v)
          if fields == nil then data[k] = v; return end -- classe non cataloguée
          local kind = fields[k]
          if kind == nil then
            error(code("unknownField", { field = tostring(k), param = name .. "Param" }), 2)
          end
          checkValue(name, k, kind, v)
          data[k] = v
        end,
        __pairs = function() return next, data, nil end,
      })
      USERDATA_MT[obj] = data
      if rawtype(src) == "table" then
        for k, v in next, (USERDATA_MT[src] or src) do obj[k] = v end
      end
      return obj
    end,
  }
end

local builtinParams = setmetatable({}, {
  __index = function(t, name)
    local v
    if __fieldTables[name] then v = makeClass(name, __fieldTables[name])
    elseif __enumTables[name] then v = makeEnum(name, __enumTables[name])
    else v = makeClass(name, nil) end -- paramètres non catalogués : non vérifiés
    rawset(t, name, v)
    return v
  end,
})

api = permissive("api")
api.gui.react.params.builtin = builtinParams
api.gui.react.detail.makeRecipeId = newRecipeId
api.type.Vec2i = vectorClass("vec2i", { "x", "y" })
api.type.Vec2f = vectorClass("vec2f", { "x", "y" })
api.type.Vec3f = vectorClass("vec3f", { "x", "y", "z" })
api.type.Vec4f = vectorClass("vec4f", { "x", "y", "z", "w" })
-- Configuration d’action d’entrée (react.iaHandler : champs posés ensuite).
api.gui.react.detail.IAHandle.new = function() return {} end
-- Idem pour react.iaForward (ToggleButton : IA_SELECT → ACTION_CLICK) et
-- react.iaFocusTraversal (react.lua).
api.gui.react.detail.IAForward.new = function() return {} end
api.gui.react.detail.IAFocusTraversal.new = function() return {} end
api.res.genericRep.getAllOfType = function() return {} end
-- Ressources .gres (palette \`default_colors.gres\` des .css.lua, motif vanilla
-- \`api.gui.genericRep.get(api.gui.genericRep.find(…)).data\`) : le banc ne lit
-- pas les valeurs de style, toute entrée vaut une couleur neutre. Si les noms
-- de la palette sont connus (\`__paletteNames\`), un nom inconnu vaut nil comme
-- en jeu (\`colorDefault.Base[1]\` : « attempt to index field 'Base' »).
api.gui.genericRep.find = function(path) return path end
api.gui.genericRep.get = function()
  return { data = setmetatable({}, { __index = function(_, k)
    if __paletteNames and not __paletteNames[k] then return nil end
    return { 1, 1, 1, 1 }
  end }) }
end

-- ── Fenêtres ouvertes par les boutons ───────────────────────────────────
local openedWindows = {}
local windowApi = {
  addSingletonWindow = function(recipe, params) openedWindows[#openedWindows + 1] = { recipe = recipe, params = params or {} } end,
  addWindow = function(recipe, key, params) openedWindows[#openedWindows + 1] = { recipe = recipe, params = params or {} } end,
  moveSingletonWindowToFront = function() end,
  moveWindowToFront = function() end,
}

-- ── Modules ─────────────────────────────────────────────────────────────
local stubs = {
  ["scripts/string_util.tl"] = function()
    return { format = function(s, values)
      return (tostring(s):gsub("{(%w+)}", function(k) return tostring(values and values[k]) end))
    end }
  end,
  ["scripts/util.tl"] = function() return { useFn = function() return nil end } end,
  ["scripts/table_util.tl"] = function()
    return { copy = function(t) local c = {}; for k, v in pairs(t or {}) do c[k] = v end; return c end }
  end,
  ["scripts/mathutil.lua"] = function() return permissive("math_util") end,
  ["gui/main/main_mod_button_area.tl"] = function()
    return { MainModButtonAreaExtension = { id = "base::MainModButtonAreaExtension" } }
  end,
  ["gui/main/game_react_globals.tl"] = function()
    return { getDefaultWindowApi = function() return windowApi end }
  end,
  ["gui/main/styleutil.tl"] = function()
    return { makeStyle = function(t) return { __styleSheet = t } end }
  end,
}

local loaded = {}
local function normalize(path)
  local p = tostring(path):gsub("^::", ""):gsub("^/+", "")
  if not p:find("/", 1, true) then p = "gui/main/" .. p end
  return p
end
local function loadModule(path)
  local key = normalize(path)
  if loaded[key] ~= nil then return loaded[key] end
  local result
  if stubs[key] then
    result = stubs[key]()
  else
    local src = __readFile(key)
    if src == nil then
      if key:match("%.tl$") then
        issue("info", code("moduleSimulated", { module = key }))
        result = permissive(key)
      else
        error(code("moduleNotFound", { module = key }), 2)
      end
    else
      local chunk, err = load(src, "@" .. key)
      if not chunk then error(err, 2) end
      result = chunk()
    end
  end
  if key == "gui/main/builtin.lua" and rawtype(result) == "table" and rawtype(result.type) == "table" then
    -- builtin.type.Vertical (au lieu de builtin.type.Orientation.Vertical)
    -- vaut nil dans le jeu, sans erreur : on le signale ici.
    setmetatable(result.type, {
      __index = function(_, k)
        error(code("builtinTypeNil", { name = tostring(k) }), 2)
      end,
    })
  end
  loaded[key] = result
  return result
end
require = loadModule
ug_require = loadModule

-- ── Contexte de recette et rendu ────────────────────────────────────────
local nodes = {}

-- États et références des hooks, selon react.d.tl : ReactState (old / set /
-- transform / hasExpired) et ReactRefT (get / set / transform / hasExpired).
-- getUnderlyingState : appelé par react.lua (useMirrorState).
local function makeState(v)
  local st = { value = v }
  function st:old() return self.value end
  function st:set(x) self.value = x end
  function st:transform(fn) self.value = fn(self.value) end
  function st:hasExpired() return false end
  function st:getUnderlyingState() return self end
  return st
end

local function makeBox(v)
  local ref = { value = v }
  function ref:get() return self.value end
  function ref:set(x) self.value = x end
  function ref:transform(fn) self.value = fn(self.value) end
  function ref:hasExpired() return false end
  return ref
end

local function newCtx(recipeId)
  local ctx = { result = nil, appended = {} }
  function ctx:makeNodeWithProps(id, localKey, cppProps)
    local n = { id = #nodes + 1, recipeId = id, cppProps = cppProps }
    nodes[n.id] = n
    return setmetatable({ __id = n.id }, NODE_MT)
  end
  function ctx:checkRecipeMatch(node, innerId, logIt)
    local n = isNode(node) and nodes[node.__id] or nil
    local ok = n ~= nil and n.recipeId == innerId
    if not ok and logIt then
      issue("error", code("wrapperMustReturnChild", {
        recipe = nameOf(recipeId), expected = nameOf(innerId), got = nameOf(n and n.recipeId),
      }))
    end
    return ok
  end
  function ctx:setResult(r) self.result = r end
  function ctx:appendChildToResult(c) self.appended[#self.appended + 1] = c end
  function ctx:declareState(v) return makeState(v) end
  function ctx:declareStateLazy(fn) return makeState(fn()) end
  function ctx:declareDependentState(v) return makeState(v) end
  function ctx:declareRef(v) return makeBox(v) end
  function ctx:declareRefLazy(fn) return makeBox(fn()) end
  function ctx:declareSelfRef() return makeBox(nil) end
  function ctx:declareDependentRef(v) return makeBox(v) end
  function ctx:makeNodeRef(node) return makeBox(node) end
  function ctx:getCurrentRecipeName() return nameOf(recipeId) end
  function ctx:getCurrentRecipeId() return recipeId end
  function ctx:useComponentInternals() return permissive("componentInternals") end
  for _, m in ipairs({ "onMount", "onUnmount", "onStep", "onStepTimer", "onEvent",
                        "onPausedChange", "provideApi", "useChildPausedModes", "findOldChild",
                        "findOldChildByLocalKey" }) do
    ctx[m] = function() return nil end
  end
  return ctx
end

-- Contraintes du moteur C++ (messages de TransportFever3.exe) : un layout
-- interdit ici fait tomber toute l’interface (« Script component root failed »).
local ENGINE_LAYOUTS = { BoxLayout = true, FlowLayout = true, TableLayout = true, AbsoluteLayout = true, FloatingLayout = true }
local NOT_LAYOUT_CHILDREN = {
  TabWidgetChild = "TabWidgetChild item must not be a Layout",
  Row = "TableLayout cell must not be a Layout",
  ScrollArea = "ScrollArea does not accept a Layout as content",
  List = "List children must be Components, not Layouts",
}
local function checkEngineLayoutRules(parentName, children, where)
  for _, c in ipairs(children) do
    local n = isNode(c) and nodes[c.__id] or nil
    local childName = n and nameOf(n.recipeId)
    if childName then
      local isLayout = ENGINE_LAYOUTS[childName] == true
      if NOT_LAYOUT_CHILDREN[parentName] and isLayout then
        issue("error", code("engineLayoutRule", { message = NOT_LAYOUT_CHILDREN[parentName], where = where .. " › " .. childName }))
      elseif parentName == "Component" and not isLayout then
        issue("error", code("engineLayoutRule", { message = "Item of Component must be a layout", where = where .. " › " .. childName }))
      end
    end
  end
end

local rendered = 0
local function render(recipeId, cppProps, depth, path)
  if depth > 64 then issue("error", code("tooDeep", { path = path })); return end
  rendered = rendered + 1
  local fn = _react.recipes[recipeId]
  if not fn then issue("error", code("unknownRecipe", { recipe = nameOf(recipeId) })); return end
  local ctx = newCtx(recipeId)
  local issuesBefore = #issues
  local ok, err = xpcall(function() fn(ctx, cppProps) end, debug.traceback)
  local here = path .. " › " .. nameOf(recipeId)
  local children = {}
  local cppBuiltin = false
  if not ok then
    -- builtin.lua : log.error("builtin.X lua recipe called") puis assert(false)
    for i = issuesBefore + 1, #issues do
      if issues[i].message:find("lua recipe called", 1, true) then cppBuiltin = true end
    end
  end
  if cppBuiltin then
    -- Builtin rendu en C++ par le jeu (ex. BoxLayout) : on retire le faux
    -- message et on parcourt nous-mêmes les enfants de ses paramètres.
    for i = #issues, issuesBefore + 1, -1 do issues[i] = nil end
    local params = cppProps and cppProps.props and cppProps.props[1]
    local data = params and USERDATA_MT[params]
    for _, v in pairs(data or {}) do
      if isNode(v) then children[#children + 1] = v
      elseif rawtype(v) == "table" then
        for _, c in ipairs(v) do if isNode(c) then children[#children + 1] = c end end
      end
    end
  elseif not ok then
    issue("error", code("luaErrorIn", { where = here, error = tostring(err) })); return
  end
  if rawtype(ctx.result) == "table" and not isNode(ctx.result) then
    for _, c in ipairs(ctx.result) do children[#children + 1] = c end
  elseif isNode(ctx.result) then
    children[#children + 1] = ctx.result
  end
  for _, c in ipairs(ctx.appended) do children[#children + 1] = c end
  checkEngineLayoutRules(nameOf(recipeId), children, here)
  for _, c in ipairs(children) do
    if isNode(c) then
      local n = nodes[c.__id]
      render(n.recipeId, n.cppProps, depth + 1, here)
    end
  end
end

-- ── Points d’entrée ─────────────────────────────────────────────────────
local function isWindowRecipe(id)
  local meta = _react.recipeMetas[id]
  return meta ~= nil and meta.innerRecipeId == _react.builtin.Window
end

local function clickButtons(fromNode, path)
  for i = fromNode, #nodes do
    local n = nodes[i]
    local params = n.cppProps and n.cppProps.props and n.cppProps.props[1]
    local data = params and USERDATA_MT[params]
    for _, handler in ipairs({ "onClick", "onClose" }) do
      if data and rawtype(data[handler]) == "function" then
        local ok, err = xpcall(data[handler], debug.traceback)
        if not ok then
          issue("error", code("luaErrorInHandler", { handler = handler, recipe = nameOf(n.recipeId), path = path, error = tostring(err) }))
        end
      end
    end
  end
end

function __tfuiRunScript(src, chunkName)
  local chunk, err = load(src, "@" .. chunkName)
  if not chunk then issue("error", code("syntax", { error = tostring(err) })); return end
  local ok, e = xpcall(chunk, debug.traceback)
  if not ok then issue("error", code("loadError", { error = tostring(e) })); return end
  if type(data) ~= "function" then issue("error", code("noDataFunction", { chunk = chunkName })); return end
  local ok2, exports = xpcall(data, debug.traceback)
  if not ok2 then issue("error", code("dataError", { error = tostring(exports) })); return end
  if type(exports) ~= "table" then issue("error", code("dataMustReturnTable", {})); return end
  local react = loaded["gui/main/react.lua"]
  for name, recipe in pairs(exports) do
    local id = react and react.GetRecipeId(recipe)
    if not id then
      issue("error", code("exportNotRecipe", { name = tostring(name) }))
    else
      local before = #nodes + 1
      if isWindowRecipe(id) then
        render(id, { props = { {} } }, 0, chunkName)
      else
        render(id, nil, 0, chunkName)
        clickButtons(before, name)
      end
    end
  end
  -- Fenêtres demandées par les boutons (comme le gestionnaire de fenêtres).
  local i = 1
  while i <= #openedWindows and i <= 16 do
    local w = openedWindows[i]
    local id = react.GetRecipeId(w.recipe)
    if not id then issue("error", code("singletonNotRecipe", {}))
    else
      local before = #nodes + 1
      render(id, { props = { w.params } }, 0, "fenêtre ouverte")
      clickButtons(before, "fenêtre ouverte") -- boutons et onClose de la fenêtre
    end
    i = i + 1
  end
  data = nil
end

function __tfuiRunCss(src, chunkName)
  local chunk, err = load(src, "@" .. chunkName)
  if not chunk then issue("error", code("syntaxIn", { chunk = chunkName, error = tostring(err) })); return end
  local ok, e = xpcall(chunk, debug.traceback)
  if not ok then issue("error", code("loadErrorIn", { chunk = chunkName, error = tostring(e) })); return end
  if type(data) ~= "function" then issue("error", code("noDataFunction", { chunk = chunkName })); return end
  local ok2, result = xpcall(data, debug.traceback)
  if not ok2 then issue("error", code("errorIn", { chunk = chunkName, error = tostring(result) })); return end
  if type(result) ~= "table" then issue("error", code("dataMustReturnTableIn", { chunk = chunkName })) end
  data = nil
end

local function jsonString(s)
  return '"' .. tostring(s):gsub('[%c"\\]', function(c)
    if c == '"' then return '\\"' elseif c == "\\" then return "\\\\" elseif c == "\n" then return "\\n" end
    return string.format("\\u%04x", string.byte(c))
  end) .. '"'
end

function __tfuiIssuesJson()
  local parts = {}
  for _, i in ipairs(issues) do
    parts[#parts + 1] = '{"severity":' .. jsonString(i.severity) .. ',"message":' .. jsonString(i.message) .. '}'
  end
  return "{\"rendered\":" .. rendered .. ",\"issues\":[" .. table.concat(parts, ",") .. "]}"
end
`;
