-- Discovery lists: trending, top volume, new pairs, organic.
local api = require("lib.api")
local nav = require("lib.nav")
local rows = require("lib.rows")
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
local tabs, underline, list, note, status
local shown = {}

local function draw_tabs()
  for i, l in ipairs(tabs) do l:color(i == tab and theme.BLUE or "dim") end
  underline:pos(8 + (tab - 1) * 78, 46)
end

local function fill(data)
  shown = data.items or {}
  note:text(data.t or "")
  if #shown == 0 then
    status:text("Nothing here right now")
    list:items({})
  else
    status:text("")
    list:items(rows.list(shown))
  end
end

local function load()
  local id = TABS[tab].id
  local c = cache[id]
  if c and sys.millis() - c.at < 30000 then fill(c) return end
  status:text("Loading...")
  list:items({})
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
    tabs[i] = ui.label(8 + (i - 1) * 78, 30, t.name, {size = 14, color = "dim", w = 70})
  end
  underline = ui.rect(8, 46, 40, 2, {color = theme.BLUE})
  list = ui.list(0, 50, ui.W, ui.H - 66, {}, {on_select = function(i)
    local t = shown[i]
    if t then nav.push(require("screens.token"), {m = t.m, s = t.s}) end
  end})
  status = theme.notice("", 110)
  ui.hint("<> tab   SELECT open   CANCEL back")
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
