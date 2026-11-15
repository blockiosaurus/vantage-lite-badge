-- Search by name, ticker or mint.
local api = require("lib.api")
local nav = require("lib.nav")
local rows = require("lib.rows")
local listui = require("lib.list")
local theme = require("lib.theme")

local S = {}
local found = {}
local list, status, note

local function run(q)
  note:text(q)
  status:text("Searching...")
  api.get("/v1/search?q=" .. q:gsub("[^%w%-_%.]", ""), function(ok, d)
    if not ok then status:text(d) return end
    found = d.items or {}
    status:text(#found == 0 and ("No token matches " .. q) or "")
    rows.set(list, rows.list(found))
  end)
end

local function ask()
  ui.input("Token name or ticker", 20, function(text)
    if not text or #text < 2 then
      if #found == 0 then nav.pop() end
      return
    end
    run(text)
  end)
end

function S.enter(p)
  found = {}
  note = theme.chrome("Search", "")
  list = listui.new(0, 30, ui.W, ui.H - 46, {}, {on_select = function(i)
    local t = found[i]
    if t then nav.push(require("screens.token"), {m = t.m, s = t.s}) end
  end})
  status = theme.notice("", 96)
  list:show(false)
  theme.hint("SELECT open   RIGHT new search   CANCEL back")
  if p.q then run(p.q) else ask() end
end

function S.key(k)
  if k == "right" then ask() return true end
  return false
end

return S
