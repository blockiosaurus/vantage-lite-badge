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
local RISK = {low = theme.UP, medium = theme.AMBER, high = theme.DOWN}

local mint, symbol
local info = nil        -- /v1/token answer
local charts = {}       -- [range] = /v1/chart answer
local page, range = 1, 2
local status

local function header()
  local note = theme.chrome(symbol or "", "")
  note:text(PAGES[page] .. "  " .. page .. "/" .. #PAGES)
  if not info then return end
  local name = info.n .. (store.watching(mint) and "  *  watching" or "")
  theme.label(12, 31, theme.fit(name, 220, 12), {size = 12, color = theme.MUTED_FG})
  if info.ver then theme.pill(ui.W - 82, 29, 74, "Verified", {size = 12}) end
  theme.label(12, 46, info.p, {size = 32})
  theme.label(196, 54, info.ch["24h"], {size = 20, color = theme.dir(info.cn), w = 116, align = "right"})
end

-- A stats row: two key/value pairs, keys muted, values right-aligned
-- (Vantage's data rows read across like a table).
-- A change ("+2.31%") takes market colour; a live authority reads as a risk.
local function tone(v)
  if v:match("^%+%d") then return theme.UP end
  if v:match("^%-%d") or v == "LIVE" then return theme.DOWN end
  return theme.FG
end

local function row(y, k1, v1, k2, v2)
  theme.label(12, y + 2, k1, {size = 12, color = theme.MUTED_FG})
  theme.label(70, y, v1, {size = 14, w = 84, align = "right", color = tone(v1)})
  if k2 then
    theme.label(170, y + 2, k2, {size = 12, color = theme.MUTED_FG})
    theme.label(228, y, v2, {size = 14, w = 84, align = "right", color = tone(v2)})
  end
end

local function draw_chart()
  local r = RANGES[range]
  for i, name in ipairs(RANGES) do
    theme.pill(12 + (i - 1) * 42, 86, 38, name:upper(), {size = 12, quiet = i ~= range})
  end
  -- the page's one primary action, in Metaplex Blue
  theme.pill(ui.W - 84, 86, 76, "Trade", {primary = true})
  local c = charts[r]
  if not c then
    status = theme.notice("Loading chart...", 136)
    api.get("/v1/chart/" .. mint .. "?r=" .. r, function(ok, d)
      if not ok then status:text(d) return end
      charts[r] = d
      nav.redraw()
    end)
    return
  end
  if not c.pts or #c.pts < 2 then
    theme.notice("No chart for this token yet", 136)
    return
  end
  chart.draw(8, 112, ui.W - 16, 68, c.pts, c.up)
  theme.label(12, 184, "L " .. c.lo .. "   H " .. c.hi, {size = 12, color = theme.MUTED_FG})
  theme.label(212, 184, r:upper() .. " " .. c.chg, {size = 12, color = c.up and theme.UP or theme.DOWN, w = 100, align = "right"})
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
  theme.label(12, 90, "RISK", {size = 12, color = theme.MUTED_FG})
  theme.label(56, 85, s.risk:upper(), {size = 20, color = RISK[s.risk] or theme.FG})
  row(110, "MINT", s.mint and "revoked" or "LIVE", "FREEZE", s.freeze and "revoked" or "LIVE")
  row(128, "TOP 10", s.top10, "DEV", s.dev)
  if #s.why == 0 then
    theme.label(12, 152, "No flags from the audit.", {size = 14, color = theme.MUTED_FG, w = ui.W - 16})
  else
    for k, line in ipairs(s.why) do
      theme.label(12, 134 + k * 16, "- " .. line, {size = 14, color = RISK[s.risk] or theme.FG, w = ui.W - 16})
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
  theme.hint("^v page  <> range  SELECT trade  CANCEL back")
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
