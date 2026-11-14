-- What the app keeps between launches (storage.*, 16 KB): settings, the
-- watchlist, price alerts and the wallet the portfolio shows.
local S = {}

local DEFAULTS = {
  buy = 100000000,   -- lamports per buy: 0.1 SOL (fits a 32-bit integer up to ~2.1 SOL)
  slip = 100,        -- slippage, basis points
  tier = "normal",   -- Vantage priority fee tier: normal | fast | turbo
  mev = false,       -- Jito MEV protection (tips 0.001 SOL)
  ticker = true,     -- light the LEDs with the watchlist
}

S.MAX_WATCH = 7 -- /v1/prices takes 8 mints: the watchlist plus SOL

S.settings = {}
S.watch = {}    -- { {m = mint, s = symbol}, ... }
S.alerts = {}   -- [mint] = {s = symbol, above = price} or {s = symbol, below = price}
S.wallet = nil

function S.load()
  local saved = storage.get("settings") or {}
  for k, v in pairs(DEFAULTS) do
    if saved[k] == nil then S.settings[k] = v else S.settings[k] = saved[k] end
  end
  S.watch = storage.get("watch") or {}
  S.alerts = storage.get("alerts") or {}
  S.wallet = storage.get("wallet")
end

function S.save()
  storage.set("settings", S.settings)
  storage.set("watch", S.watch)
  storage.set("alerts", S.alerts)
  if S.wallet then storage.set("wallet", S.wallet) else storage.remove("wallet") end
end

function S.watching(mint)
  for i, w in ipairs(S.watch) do
    if w.m == mint then return i end
  end
  return nil
end

-- Add or remove a token; returns true when it is now watched.
function S.toggle_watch(mint, symbol)
  local i = S.watching(mint)
  if i then
    table.remove(S.watch, i)
    S.save()
    return false
  end
  if #S.watch >= S.MAX_WATCH then return nil end
  S.watch[#S.watch + 1] = {m = mint, s = symbol}
  S.save()
  return true
end

function S.set_alert(mint, alert)
  S.alerts[mint] = alert
  S.save()
end

return S
