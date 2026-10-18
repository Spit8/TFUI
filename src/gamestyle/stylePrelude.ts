/**
 * Prélude Lua pour exécuter les feuilles de style de base du jeu
 * (`builtin.css.lua`, `default.css.lua`, `font_scaling.css.lua`) avec le vrai
 * `stylesheetutil.lua`, les vraies palettes `.gres.lua` et `color_internal.lua`.
 *
 * Simulé (non exécutable sans compilateur Teal) :
 * - `color_util.tl` : les 3 fonctions utilisées par ces feuilles
 *   (withTransparencyRaw, getHoverFromRaw, getActiveFromRaw), réécrites comme
 *   dans le fichier du jeu, sur `color_internal.adaptBrightnessOfScaledRGBa` ;
 * - `table_util.tl` : `copy` (seule fonction utilisée par stylesheetutil) ;
 * - `mat4.tl` / `vec3.tl` : tables neutres (transformations, non rendues).
 *
 * Fourni par le JS avant ce prélude : `__readFile(path)` (fichier préchargé).
 */
export const STYLE_PRELUDE = String.raw`
local issues = {}
local function joinArgs(...)
  local parts = {}
  for i = 1, select("#", ...) do parts[#parts + 1] = tostring((select(i, ...))) end
  return table.concat(parts, " ")
end
log = {
  error = function(...) issues[#issues + 1] = joinArgs(...) end,
  warning = function() end, verbose = function() end, info = function() end,
}
_ = function(s) return s end
resolve = function(s) return s end
debugPrint = function() end

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

local function neutral(name)
  return setmetatable({}, {
    __index = function(t, k) local v = neutral(name .. "." .. tostring(k)); rawset(t, k, v); return v end,
    __call = function() return neutral(name .. "()") end,
  })
end

local loaded = {}
local function normalize(path)
  local p = tostring(path):gsub("^::", ""):gsub("^/+", "")
  if not p:find("/", 1, true) then p = "gui/main/" .. p end
  return p
end

local loadModule
local stubs = {
  ["gui/main/color_util.tl"] = function()
    local internal = loadModule("gui/main/color_internal.lua")
    local cu = {}
    cu.withTransparencyRaw = function(c, alpha) return { c[1], c[2], c[3], alpha } end
    cu.getHoverFromRaw = function(c) return internal.adaptBrightnessOfScaledRGBa(c, 0.2) end
    cu.getActiveFromRaw = function(c) return internal.adaptBrightnessOfScaledRGBa(c, 0.1) end
    return setmetatable(cu, { __index = function(_, k) return neutral("color_util." .. k) end })
  end,
  ["scripts/table_util.tl"] = function()
    local tu = {}
    local function copy(t)
      if type(t) ~= "table" then return t end
      local r = {}
      for k, v in pairs(t) do r[k] = copy(v) end
      return r
    end
    tu.copy = copy
    return setmetatable(tu, { __index = function(_, k) return neutral("table_util." .. k) end })
  end,
  ["scripts/mat4.tl"] = function() return neutral("mat4") end,
  ["scripts/vec3.tl"] = function() return neutral("vec3") end,
}

loadModule = function(path)
  local key = normalize(path)
  if loaded[key] ~= nil then return loaded[key] end
  local result
  if stubs[key] then
    result = stubs[key]()
  else
    local src = __readFile(key)
    if src == nil then error("fichier du jeu introuvable : " .. key, 2) end
    local chunk, err = load(src, "@" .. key)
    if not chunk then error(err, 2) end
    result = chunk()
  end
  loaded[key] = result
  return result
end
require = loadModule
ug_require = loadModule

-- Ressources .gres : function data() return { type = …, data = … } end
local function loadGres(path)
  local key = normalize(path) .. ".lua"
  local src = __readFile(key)
  if src == nil then error("ressource introuvable : " .. key, 2) end
  local env = setmetatable({}, { __index = _G })
  local chunk, err = load(src, "@" .. key, "t", env)
  if not chunk then error(err, 2) end
  chunk()
  return env.data()
end
api = neutral("api")
api.gui.genericRep.find = function(path) return path end
api.gui.genericRep.get = function(path) return loadGres(path) end

-- ── Sérialisation JSON (nombres, chaînes, booléens, tables) ─────────────
local function isArray(t)
  local n = 0
  for k in pairs(t) do
    if type(k) ~= "number" then return false end
    n = n + 1
  end
  return n == #t
end
local encode
encode = function(v, depth)
  local t = type(v)
  if t == "number" then
    if v ~= v or v == math.huge or v == -math.huge then return "null" end
    return tostring(v)
  elseif t == "string" then
    return '"' .. v:gsub('[%c"\\]', function(c)
      if c == '"' then return '\\"' elseif c == "\\" then return "\\\\" elseif c == "\n" then return "\\n" end
      return string.format("\\u%04x", string.byte(c))
    end) .. '"'
  elseif t == "boolean" then
    return v and "true" or "false"
  elseif t == "table" and depth < 8 and getmetatable(v) == nil then
    local parts = {}
    if isArray(v) then
      for _, x in ipairs(v) do parts[#parts + 1] = encode(x, depth + 1) end
      return "[" .. table.concat(parts, ",") .. "]"
    end
    for k, x in pairs(v) do
      if type(k) == "string" then
        local e = encode(x, depth + 1)
        if e ~= "null" then parts[#parts + 1] = encode(k, depth + 1) .. ":" .. e end
      end
    end
    return "{" .. table.concat(parts, ",") .. "}"
  end
  return "null"
end

local function levelText(l)
  local s = (l.id and ("#" .. l.id) or "") .. (l.element or "")
  for _, c in ipairs(l.classList or {}) do s = s .. "!" .. c end
  for _, c in ipairs(l.pseudoClassList or {}) do s = s .. ":" .. c end
  if l.childCombinator == 1 then s = s .. " >" elseif l.childCombinator == 2 then s = s .. " >>" end
  return s
end

-- Palette nommée du jeu (default_colors.gres) et niveaux de transparence.
function __tfuiPalette()
  local ok, result = xpcall(function()
    local colors = loadGres("gui/main/default_colors.gres").data
    local alphas = loadGres("gui/main/transparency.gres").data
    local c, t = {}, {}
    for name, rgba in pairs(colors) do
      if type(rgba) == "table" and type(rgba[1]) == "number" then
        c[#c + 1] = '{"name":' .. encode(name, 0) .. ',"rgba":' .. encode(rgba, 0) .. '}'
      end
    end
    for name, alpha in pairs(alphas) do
      if type(alpha) == "number" then
        t[#t + 1] = '{"name":' .. encode(name, 0) .. ',"alpha":' .. encode(alpha, 0) .. '}'
      end
    end
    return '{"colors":[' .. table.concat(c, ",") .. '],"transparency":[' .. table.concat(t, ",") .. ']}'
  end, debug.traceback)
  if not ok then return '{"error":' .. encode(tostring(result), 0) .. '}' end
  return result
end

local order = 0
function __tfuiRunStyleSheet(path)
  local ok, result = xpcall(function()
    local sheet = loadModule(path)
    if type(sheet) ~= "nil" then return sheet end
    return nil
  end, debug.traceback)
  if not ok then return '{"error":' .. encode(tostring(result), 0) .. '}' end
  if type(data) ~= "function" then return '{"error":"pas de data()"}' end
  local ok2, list = xpcall(data, debug.traceback)
  data = nil
  if not ok2 then return '{"error":' .. encode(tostring(list), 0) .. '}' end
  local out = {}
  for _, ss in ipairs(list or {}) do
    order = order + 1
    local levels, texts = {}, {}
    for _, l in ipairs(ss.levels or {}) do
      levels[#levels + 1] = '{"element":' .. encode(l.element, 0) ..
        ',"id":' .. encode(l.id, 0) ..
        ',"classList":' .. encode(l.classList or {}, 0) ..
        ',"pseudoClassList":' .. encode(l.pseudoClassList or {}, 0) ..
        ',"childCombinator":' .. encode(l.childCombinator or 0, 0) .. '}'
      texts[#texts + 1] = levelText(l)
    end
    out[#out + 1] = '{"order":' .. order ..
      ',"selector":' .. encode(table.concat(texts, " "), 0) ..
      ',"levels":[' .. table.concat(levels, ",") .. ']' ..
      ',"styleSheet":' .. encode(ss.styleSheet or {}, 0) .. '}'
  end
  return '{"rules":[' .. table.concat(out, ",") .. '],"issues":' .. encode(issues, 0) .. '}'
end
`;
