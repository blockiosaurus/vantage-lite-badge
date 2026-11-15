-- The launcher: Vantage Lite by Metaplex, a live market strip and the menu.
local api = require("lib.api")
local nav = require("lib.nav")
local store = require("lib.store")
local listui = require("lib.list")
local theme = require("lib.theme")

local H = {}
local strip, list

local function items()
  return {
    {title = "Get Vantage", sub = "Unlock the full terminal on your phone"},
    {title = "Pulse", sub = "SOL, fear & greed, top mover"},
    {title = "Discover", sub = "Trending, volume, new, organic"},
    {title = "Search", sub = "Find a token by name or ticker"},
    {title = "Watchlist", sub = "Prices, alerts, LED ticker", right = tostring(#store.watch)},
    {title = "Portfolio", sub = "What your wallet holds"},
    {title = "Ask Vantage", sub = "The assistant, on your badge"},
    {title = "Settings", sub = "Trade size, slippage, priority, LEDs"},
  }
end

local ROUTES = {"vantage", "pulse", "discover", "search", "watchlist", "portfolio", "ask", "settings"}

function H.enter()
  theme.chrome("Vantage Lite", "by Metaplex")
  strip = theme.label(12, 32, "SOL ...", {size = 12, color = theme.MUTED_FG, w = ui.W - 24})
  list = listui.new(0, 50, ui.W, ui.H - 66, items(), {on_select = function(i)
    nav.push(require("screens." .. ROUTES[i]), {})
  end})
  theme.hint("SELECT open   CANCEL exit")
  api.get("/v1/pulse", function(ok, d)
    if not ok then strip:text(d) return end
    -- the change in market colour on its own label, the rest muted
    strip:text("SOL " .. d.sol.p)
    theme.label(12 + (#("SOL " .. d.sol.p) + 1) * 7, 32, d.sol.c, {size = 12, color = theme.dir(d.sol.cn)})
    if d.fng then
      theme.label(12 + (#("SOL " .. d.sol.p .. " " .. d.sol.c) + 3) * 7, 32,
        "F&G " .. d.fng.v .. " " .. d.fng.l, {size = 12, color = theme.MUTED_FG})
    end
  end)
end

return H
