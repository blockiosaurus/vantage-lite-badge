-- Discovery lists: trending, top volume, new pairs, organic.
local api = require("lib.api")
local nav = require("lib.nav")
local rows = require("lib.rows")
local listui = require("lib.list")
local theme = require("lib.theme")

local D = {}
local TABS = {
  {id = "hot", name = "Hot"},
  {id = "volume", name = "Volume"},
  {id = "new", name = "New"},
  {id = "organic", name = "Organic"},
}
local tab = 1
local cache = {}   -- [id] = {items =, at = sys.millis()}
local tabs, list, note, status
local shown = {}

local function draw_tabs()
  for i, t in ipairs(tabs) do
    local on = i == tab
    t.rect:show(on)
    t.label:color(on and theme.FG or theme.MUTED_FG)
  end
end

local function fill(data)
  shown = data.items or {}
  note:text(data.t or "")
  if #shown == 0 then
    status:text("Nothing here right now")
    rows.set(list, {})
  else
    status:text("")
    rows.set(list, rows.list(shown))
  end
end

local function load()
  local id = TABS[tab].id
  local c = cache[id]
  if c and sys.millis() - c.at < 30000 then fill(c) return end
  status:text("Loading...")
  rows.set(list, {})
  api.get("/v1/list/" .. id, function(ok, d)
    if not ok then status:text(d) return end
    d.at = sys.millis()
    cache[id] = d
    if TABS[tab].id == id then fill(d) end
  end)
end

function D.enter()
  note = theme.chrome("Discover", "")
  tabs = {}
  for i, t in ipairs(TABS) do
    tabs[i] = theme.pill(8 + (i - 1) * 76, 31, 70, t.name)
  end
  list = listui.new(0, 56, ui.W, ui.H - 72, {}, {on_select = function(i)
    local t = shown[i]
    if t then nav.push(require("screens.token"), {m = t.m, s = t.s}) end
  end})
  status = theme.notice("", 110)
  theme.hint("<> tab   SELECT open   CANCEL back")
  draw_tabs()
  load()
end

function D.key(k)
  if k == "left" or k == "right" then
    tab = (tab - 1 + (k == "right" and 1 or -1)) % #TABS + 1
    draw_tabs()
    load()
    return true
  end
  return false
end

return D
