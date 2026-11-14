-- One price alert per token, relative to the price now. The ticker checks it
-- every 30 s while the app runs and flashes the LEDs when it crosses.
local nav = require("lib.nav")
local store = require("lib.store")
local text = require("lib.text")
local theme = require("lib.theme")

local AL = {}
local MOVES = {5, 10, 25, -5, -10, -25}

function AL.enter(p)
  local t = p.info
  theme.chrome("Alert", t.s .. " " .. t.p)
  local items = {}
  for i, m in ipairs(MOVES) do
    local target = t.pn and t.pn * (1 + m / 100)
    items[i] = {
      title = (m > 0 and "+" or "") .. m .. "%",
      sub = target and ((m > 0 and "above " or "below ") .. text.price(target)) or "price unknown",
    }
  end
  items[#items + 1] = {title = "Clear alert", sub = store.alerts[t.m] and "Remove the one set" or "None set"}
  ui.list(0, 30, ui.W, ui.H - 46, items, {on_select = function(i)
    if i > #MOVES then
      store.set_alert(t.m, nil)
      ui.toast("Alert cleared")
    elseif t.pn then
      local m = MOVES[i]
      local target = t.pn * (1 + m / 100)
      store.set_alert(t.m, m > 0 and {s = t.s, above = target} or {s = t.s, below = target})
      if not store.watching(t.m) then store.toggle_watch(t.m, t.s) end
      require("lib.ticker").refresh()
      ui.toast("Alert set: " .. t.s .. " " .. (m > 0 and "+" or "") .. m .. "%")
    else
      ui.toast("No price to set an alert from")
      return
    end
    nav.pop()
  end})
  ui.hint("SELECT set   CANCEL back")
end

return AL
