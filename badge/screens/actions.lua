-- What you can do with a token.
local nav = require("lib.nav")
local store = require("lib.store")
local text = require("lib.text")
local theme = require("lib.theme")

local A = {}

function A.enter(p)
  local t = p.info
  theme.chrome(t.s, t.p)
  local watched = store.watching(t.m) ~= nil
  local alert = store.alerts[t.m]
  local items = {
    {title = "Buy " .. t.s, sub = "Sign on your phone with Solana Pay"},
    {title = "Sell " .. t.s, sub = "A share of what your wallet holds"},
    {title = watched and "Stop watching" or "Watch", sub = watched and "Off the list and the LEDs" or "On the list and the LEDs"},
    {title = "Price alert", sub = alert and ("Set: " .. (alert.above and "above " or "below ") .. text.price(alert.above or alert.below)) or "Flash the LEDs at a price"},
    {title = "Ask Vantage", sub = "What's going on with " .. t.s .. "?"},
    {title = "Open in Vantage", sub = "A QR code for your phone"},
  }
  ui.list(0, 30, ui.W, ui.H - 46, items, {on_select = function(i)
    if i == 1 then
      nav.replace(require("screens.trade"), {side = "buy", info = t})
    elseif i == 2 then
      nav.replace(require("screens.trade"), {side = "sell", info = t})
    elseif i == 3 then
      local now = store.toggle_watch(t.m, t.s)
      if now == nil then
        ui.toast("Watchlist is full (" .. store.MAX_WATCH .. ")")
      else
        ui.toast(now and ("Watching " .. t.s) or ("Stopped watching " .. t.s))
        require("lib.ticker").refresh()
        nav.pop()
      end
    elseif i == 4 then
      nav.replace(require("screens.alert"), {info = t})
    elseif i == 5 then
      nav.replace(require("screens.ask"), {m = t.m, s = t.s})
    else
      nav.replace(require("screens.qr"), {title = t.s, text = t.url, caption = "Open " .. t.s .. " in Vantage on your phone"})
    end
  end})
  ui.hint("SELECT choose   CANCEL back")
end

return A
