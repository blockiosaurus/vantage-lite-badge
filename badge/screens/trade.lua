-- Pick how much: SOL amounts for a buy, a share of the wallet for a sell.
local nav = require("lib.nav")
local store = require("lib.store")
local text = require("lib.text")
local theme = require("lib.theme")

local TR = {}
local BUYS = {50000000, 100000000, 250000000, 500000000, 1000000000}
local SELLS = {25, 50, 100}

local function settings_line()
  local s = store.settings
  return "Slippage " .. text.bps(s.slip) .. "  " .. s.tier .. "  MEV " .. (s.mev and "on" or "off")
end

function TR.enter(p)
  local t = p.info
  theme.chrome((p.side == "buy" and "Buy " or "Sell ") .. t.s, t.p)
  ui.label(8, 30, settings_line(), {size = 12, color = "dim", w = ui.W - 16})
  local items, start = {}, 1
  if p.side == "buy" then
    for i, l in ipairs(BUYS) do
      items[i] = {title = text.sol(l) .. " SOL", sub = "Buy " .. t.s .. " with SOL"}
      if l == store.settings.buy then start = i end
    end
  else
    for i, pc in ipairs(SELLS) do
      items[i] = {title = pc .. "%", sub = pc == 100 and ("All the " .. t.s .. " in the wallet you scan with") or ("Of the " .. t.s .. " in the wallet you scan with")}
    end
  end
  local list = ui.list(0, 46, ui.W, ui.H - 62, items, {on_select = function(i)
    nav.replace(require("screens.swap"), {
      side = p.side,
      info = t,
      lamports = p.side == "buy" and BUYS[i] or nil,
      percent = p.side == "sell" and SELLS[i] or nil,
    })
  end})
  list:select(start)
  ui.hint("SELECT continue   CANCEL back")
end

return TR
