-- A token page: price and day up top, then three pages (UP/DOWN):
-- the chart (LEFT/RIGHT for 1H, 1D, 1W), the stats and the safety read.
-- SELECT opens the actions: buy, sell, watch, alert, ask, open in Vantage.
local api = require("lib.api")
local chart = require("lib.chart")
local nav = require("lib.nav")
local store = require("lib.store")
local theme = require("lib.theme")

local T = {}
local PAGES = {"Chart", "Stats", "Safety"}
local RANGES = {"1h", "1d", "1w"}
local RISK = {low = theme.UP, medium = 0xF5A623, high = theme.DOWN}

local mint, symbol
local info = nil        -- /v1/token answer
local charts = {}       -- [range] = /v1/chart answer
local page, range = 1, 2
local status

local function header()
  local note = theme.chrome(symbol or "", "")
  note:text(PAGES[page] .. "  " .. page .. "/" .. #PAGES)
  if not info then return end
  ui.label(8, 30, info.n, {size = 12, color = "dim", w = 200})
  if info.ver then ui.label(220, 30, "VERIFIED", {size = 12, color = theme.UP, w = 92, align = "right"}) end
  ui.label(8, 44, info.p, {size = 32})
  ui.label(200, 52, info.ch["24h"], {size = 20, color = theme.dir(info.cn), w = 112, align = "right"})
  if store.watching(mint) then ui.label(200, 74, "watching", {size = 12, color = "dim", w = 112, align = "right"}) end
end

local function row(y, k1, v1, k2, v2)
  ui.label(8, y, k1, {size = 12, color = "dim"})
  ui.label(70, y, v1, {size = 14, w = 86})
  if k2 then
    ui.label(164, y, k2, {size = 12, color = "dim"})
    ui.label(226, y, v2, {size = 14, w = 86})
  end
end

local function draw_chart()
  local r = RANGES[range]
  for i, name in ipairs(RANGES) do
    ui.label(186 + (i - 1) * 42, 86, name:upper(), {size = 12, color = i == range and theme.BLUE or "dim"})
  end
  local c = charts[r]
  if not c then
    status = theme.notice("Loading chart...", 130)
    api.get("/v1/chart/" .. mint .. "?r=" .. r, function(ok, d)
      if not ok then status:text(d) return end
      charts[r] = d
      nav.redraw()
    end)
    return
  end
  if not c.pts or #c.pts < 2 then
    theme.notice("No chart for this token yet", 130)
    return
  end
  chart.draw(8, 102, ui.W - 16, 76, c.pts, c.up)
  ui.label(8, 182, "L " .. c.lo .. "   H " .. c.hi, {size = 12, color = "dim", w = 220})
  ui.label(232, 182, r:upper() .. " " .. c.chg, {size = 12, color = c.up and theme.UP or theme.DOWN, w = 80, align = "right"})
end

local function draw_stats()
  local i = info
  row(90, "MCAP", i.mc, "FDV", i.fdv)
  row(108, "LIQ", i.liq, "VOL 24H", i.vol)
  row(126, "HOLDERS", i.hold, "AGE", i.age)
  row(144, "BUYS", i.buys, "SELLS", i.sells)
  row(162, "5M", i.ch["5m"], "1H", i.ch["1h"])
  row(180, "6H", i.ch["6h"], "ORGANIC", i.org and (i.org .. " " .. i.orgl) or "-")
end

local function draw_safety()
  local s = info.safe
  ui.label(8, 88, "RISK", {size = 12, color = "dim"})
  ui.label(52, 84, s.risk:upper(), {size = 20, color = RISK[s.risk] or "text"})
  row(110, "MINT", s.mint and "revoked" or "LIVE", "FREEZE", s.freeze and "revoked" or "LIVE")
  row(128, "TOP 10", s.top10, "DEV", s.dev)
  if #s.why == 0 then
    ui.label(8, 150, "No flags from the audit.", {size = 14, color = "dim", w = ui.W - 16})
  else
    for k, line in ipairs(s.why) do
      ui.label(8, 132 + k * 16, "- " .. line, {size = 14, color = RISK[s.risk] or "text", w = ui.W - 16})
    end
  end
end

function T.enter(p)
  if p.m ~= mint then
    mint, symbol, info, charts, page, range = p.m, p.s, nil, {}, 1, 2
  end
  header()
  if not info then
    status = theme.notice("Loading " .. (symbol or "token") .. "...", 110)
    api.get("/v1/token/" .. mint, function(ok, d)
      if not ok then status:text(d) return end
      info = d
      symbol = d.s
      nav.redraw()
    end)
  elseif page == 1 then
    draw_chart()
  elseif page == 2 then
    draw_stats()
  else
    draw_safety()
  end
  ui.hint("^v page  <> range  SELECT trade  CANCEL back")
end

function T.key(k)
  if not info then return false end
  if k == "up" or k == "down" then
    page = (page - 1 + (k == "down" and 1 or -1)) % #PAGES + 1
    nav.redraw()
    return true
  end
  if (k == "left" or k == "right") and page == 1 then
    range = math.max(1, math.min(#RANGES, range + (k == "right" and 1 or -1)))
    nav.redraw()
    return true
  end
  if k == "select" then
    nav.push(require("screens.actions"), {info = info})
    return true
  end
  return false
end

return T
