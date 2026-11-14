-- Market mood: SOL's price and day, the Fear & Greed index (also on the LEDs),
-- SOL's chart and the hour's top mover.
local api = require("lib.api")
local chart = require("lib.chart")
local leds = require("lib.leds")
local nav = require("lib.nav")
local theme = require("lib.theme")
local ticker = require("lib.ticker")

local P = {}
local w = {}
local top = nil

local function load()
  api.get("/v1/pulse", function(ok, d)
    if not ok then w.status:text(d) return end
    w.status:text("")
    w.price:text(d.sol.p)
    w.change:text(d.sol.c .. " 24h")
    w.change:color(theme.dir(d.sol.cn))
    if d.fng then
      w.fng:text(tostring(d.fng.v))
      w.fngl:text(d.fng.l)
      w.bar:set(d.fng.v)
    else
      w.fngl:text("index unavailable")
    end
    top = d.top
    w.top:text(top and ("Top mover 1h: " .. top.s .. " " .. top.c) or "")
    leds.mood(d.mood)
  end)
  api.get("/v1/chart/" .. ticker.SOL .. "?r=1d", function(ok, c)
    if not ok or not c.pts or #c.pts < 2 then return end
    if w.canvas then w.canvas:remove() end
    w.canvas = chart.draw(8, 118, ui.W - 16, 58, c.pts, c.up)
  end)
end

function P.enter()
  top = nil
  w = {}
  theme.chrome("Pulse", "live")
  ui.label(8, 32, "SOLANA", {size = 12, color = "dim"})
  w.price = ui.label(8, 46, "...", {size = 32})
  w.change = ui.label(8, 86, "", {size = 14, color = "dim"})
  ui.label(188, 32, "FEAR & GREED", {size = 12, color = "dim"})
  w.fng = ui.label(188, 46, "--", {size = 32})
  w.fngl = ui.label(188, 86, "", {size = 14, color = "dim", w = 124})
  w.bar = ui.bar(188, 104, 124, 8, 0)
  w.top = ui.label(8, 182, "", {size = 14, color = "text", w = ui.W - 16})
  w.status = ui.label(8, 140, "Loading...", {size = 14, color = "dim"})
  ui.hint("SELECT top mover   CANCEL back")
  load()
  nav.every(30000, load)
end

function P.key(k)
  if k == "select" and top then
    nav.push(require("screens.token"), {m = top.m, s = top.s})
    return true
  end
  return false
end

function P.leave()
  ticker.relight()
end

return P
