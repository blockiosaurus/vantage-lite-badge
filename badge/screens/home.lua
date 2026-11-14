-- The launcher: a live market strip and the menu.
local api = require("lib.api")
local nav = require("lib.nav")
local store = require("lib.store")
local theme = require("lib.theme")

local H = {}
local strip, list

local function items()
  return {
    {title = "Pulse", sub = "SOL, fear & greed, top mover"},
    {title = "Discover", sub = "Trending, volume, new, organic"},
    {title = "Search", sub = "Find a token by name or ticker"},
    {title = "Watchlist", sub = "Prices, alerts, LED ticker", right = tostring(#store.watch)},
    {title = "Portfolio", sub = "What your wallet holds"},
    {title = "Ask Vantage", sub = "The assistant, on your badge"},
    {title = "Settings", sub = "Trade size, slippage, MEV, LEDs"},
  }
end

local ROUTES = {"pulse", "discover", "search", "watchlist", "portfolio", "ask", "settings"}

function H.enter()
  theme.chrome("", "lite")
  strip = ui.label(8, 31, "SOL ...", {size = 12, color = "dim", w = ui.W - 16})
  list = ui.list(0, 48, ui.W, ui.H - 64, items(), {on_select = function(i)
    nav.push(require("screens." .. ROUTES[i]), {})
  end})
  ui.hint("SELECT open   CANCEL exit")
  api.get("/v1/pulse", function(ok, d)
    if not ok then strip:text(d) return end
    local line = "SOL " .. d.sol.p .. " " .. d.sol.c
    if d.fng then line = line .. "   F&G " .. d.fng.v .. " " .. d.fng.l end
    strip:text(line)
    strip:color(theme.dir(d.sol.cn))
  end)
end

return H
