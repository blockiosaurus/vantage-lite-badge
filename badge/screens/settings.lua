-- Trade defaults: buy size, slippage and priority fee; plus the LED ticker
-- and the remembered wallet.
local config = require("lib.config")
local store = require("lib.store")
local text = require("lib.text")
local listui = require("lib.list")
local theme = require("lib.theme")
local ticker = require("lib.ticker")

local ST = {}
local BUYS = {50000000, 100000000, 250000000, 500000000, 1000000000}
local SLIPS = {50, 100, 300, 500}
local TIERS = {"normal", "fast", "turbo"}
local list

local function next_of(options, value)
  for i, v in ipairs(options) do
    if v == value then return options[i % #options + 1] end
  end
  return options[1]
end

local function items()
  local s = store.settings
  return {
    {title = "Default buy", right = text.sol(s.buy) .. " SOL"},
    {title = "Slippage", right = text.bps(s.slip)},
    {title = "Priority fee", sub = "Capped at 0.0005 / 0.001 / 0.003 SOL", right = s.tier},
    {title = "LED ticker", sub = "Watchlist on the LEDs", right = s.ticker and "on" or "off"},
    {title = "Wallet", sub = store.wallet and "SELECT to forget" or "Set by your first swap", right = store.wallet and text.short(store.wallet) or "none"},
    {title = "About", sub = "Vantage Lite by Metaplex", right = "v" .. config.VERSION},
  }
end

function ST.enter()
  theme.chrome("Settings", "")
  list = listui.new(0, 30, ui.W, ui.H - 46, items(), {on_select = function(i)
    local s = store.settings
    if i == 1 then s.buy = next_of(BUYS, s.buy)
    elseif i == 2 then s.slip = next_of(SLIPS, s.slip)
    elseif i == 3 then s.tier = next_of(TIERS, s.tier)
    elseif i == 4 then
      s.ticker = not s.ticker
      ticker.relight()
    elseif i == 5 and store.wallet then
      store.wallet = nil
      ui.toast("Wallet forgotten")
    end
    store.save()
    list:items(items())
    list:select(i)
  end})
  theme.hint("SELECT change   CANCEL back")
end

return ST
