-- Walks Vantage Lite through its screens on the harness and records each one
-- (H.snapshot) for render.py. Run from the repo root:
--
--   tools/harness/run.sh tools/screens/shots.lua tools/screens/out/shots.json
--
-- The server's test fixtures use placeholder tokens (TOK0, TOK1, ...). For
-- pictures a person looks at, the routes below answer sample data instead:
-- real token names with made-up numbers. None of it is a live price.

local OUT = arg[4] or "tools/screens/out/shots.json"
local shots = {}

local function snap(name, caption, opts)
  opts = opts or {}
  opts.caption = caption
  shots[#shots + 1] = H.snapshot(name, opts)
end

local BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
local WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm"
local JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"
local POPCAT = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr"
local PENGU = "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv"
local RAY = "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R"
local SOL = "So11111111111111111111111111111111111111112"

local function row(m, s, p, c, cn, mc, v) return {m = m, s = s, p = p, c = c, cn = cn, mc = mc, v = v} end

local HOT = {
  t = "Trending 1h",
  items = {
    row(POPCAT, "POPCAT", "$0.4127", "+18.4%", 18.4, "$405M", "$61.2M"),
    row(BONK, "Bonk", "$0.00002314", "+12.3%", 12.3, "$1.61B", "$118M"),
    row(WIF, "$WIF", "$1.234", "-4.21%", -4.21, "$1.23B", "$96.4M"),
    row(PENGU, "PENGU", "$0.01582", "+6.70%", 6.7, "$994M", "$54.8M"),
    row(JUP, "JUP", "$0.5481", "+1.92%", 1.92, "$1.65B", "$42.1M"),
    row(RAY, "RAY", "$2.87", "-0.84%", -0.84, "$768M", "$31.5M"),
  },
}

-- A deterministic, market-looking walk for the chart.
local function walk(n, seed, drift)
  local pts, v, s = {}, 40, seed
  for i = 1, n do
    s = (s * 1103515245 + 12345) % 2147483648
    v = v + ((s // 65536) % 11 - 5) + drift
    pts[i] = v
  end
  local lo, hi = math.huge, -math.huge
  for _, p in ipairs(pts) do lo = math.min(lo, p) hi = math.max(hi, p) end
  for i, p in ipairs(pts) do pts[i] = (p - lo) * 100 // math.max(1, hi - lo) end
  return pts
end

local TOKEN = H.fixtures.token
local RISKY = {}
for k, v in pairs(TOKEN) do RISKY[k] = v end
RISKY.s, RISKY.n, RISKY.p, RISKY.cn, RISKY.ver = "MOONDOG", "Moon Dog", "$0.0004117", 214, false
RISKY.ch = {["5m"] = "+8.10%", ["1h"] = "+61.2%", ["6h"] = "+140%", ["24h"] = "+214%"}
RISKY.safe = {
  mint = false, freeze = true, top10 = "63.4%", dev = "14.0%", risk = "high",
  why = {"Mint authority is live", "Top 10 hold 63%", "Dev holds 14%"},
}

local function token_like(base, over)
  local t = {}
  for k, v in pairs(base) do t[k] = v end
  for k, v in pairs(over) do t[k] = v end
  return t
end

local TOKENS = {
  [WIF] = token_like(TOKEN, {m = WIF, s = "$WIF", n = "dogwifhat", p = "$1.234", pn = 1.234, cn = -4.21,
    ch = {["5m"] = "-0.30%", ["1h"] = "-1.10%", ["6h"] = "-2.80%", ["24h"] = "-4.21%"}}),
  [POPCAT] = token_like(TOKEN, {m = POPCAT, s = "POPCAT", n = "Popcat", p = "$0.4127", pn = 0.4127, cn = 18.4,
    ch = {["5m"] = "+1.20%", ["1h"] = "+6.40%", ["6h"] = "+11.9%", ["24h"] = "+18.4%"}}),
}

local function sample(b)
  for mint, t in pairs(TOKENS) do b.overrides["^/v1/token/" .. mint] = {status = 200, data = t} end
  b.overrides["^/v1/list/hot"] = {status = 200, data = HOT}
  b.overrides["^/v1/pulse"] = {status = 200, data = {
    sol = {p = "$187.42", c = "-2.50%", cn = -2.5},
    fng = {v = 64, l = "Greed"},
    top = {m = POPCAT, s = "POPCAT", c = "+18.4%"},
    mood = 64,
  }}
  b.overrides["^/v1/chart/" .. SOL] = {status = 200, data = {r = "1d", pts = walk(60, 7, -0.4), lo = "$181.20", hi = "$193.05", up = false, chg = "-2.50%"}}
  b.overrides["^/v1/chart/"] = {status = 200, data = {r = "1d", pts = walk(60, 42, 0.9), lo = "$0.00001982", hi = "$0.00002371", up = true, chg = "+12.3%"}}
  b.overrides["^/v1/prices"] = {status = 200, data = {items = {
    {m = BONK, p = "$0.00002314", pn = 0.00002314, c = "+12.3%", cn = 12.3},
    {m = WIF, p = "$1.234", pn = 1.234, c = "-4.21%", cn = -4.21},
    {m = POPCAT, p = "$0.4127", pn = 0.4127, c = "+18.4%", cn = 18.4},
    {m = SOL, p = "$187.42", pn = 187.42, c = "-2.50%", cn = -2.5},
  }}}
end

local function boot(saved)
  local b = H.boot(saved)
  sample(b)
  H.flush()
  return b
end

------------------------------------------------------------------ the tour
H.boot(nil, nil, {splash = true})
H.advance(560)
snap("00-launch", "Launch: Metaplex, then Vantage Lite, with a blue LED sweep")

local b = boot()
snap("01-home", "The menu, with a live market strip")

H.choose("Get Vantage")
H.advance(1000)
snap("01b-get-vantage", "Get Vantage: scan, sign in, and that account gets the full terminal")
H.press("back")

H.choose("Pulse")
snap("02-pulse", "Pulse: SOL, Fear & Greed, SOL's day; the LEDs show the mood")
H.press("back")

H.choose("Discover")
snap("03-discover", "Discover: trending, volume, new and organic tabs")

H.choose("Bonk")
H.advance(100)
snap("04-token-chart", "A token page: price, day, and its chart (1H, 1D, 1W)")
H.press("down")
snap("05-token-stats", "Stats: market cap, liquidity, volume, holders, flow")
H.press("down")
snap("06-token-safety", "Safety: the audit and a risk read")
H.press("down")

H.press("select")
snap("07-actions", "SELECT on a token: trade, watch, alert, ask, open in Vantage")
H.choose("Buy Bonk")
snap("08-buy", "Buy: pick an amount; slippage and priority come from Settings")
H.choose("0.25 SOL")
snap("09-swap-scan", "Scan the code in Phantom or Solflare; the phone signs")
H.advance(3000) H.advance(3000)
snap("10-swap-signing", "The wallet asked for the transaction: approve it there")
H.advance(3000)
H.advance(250) -- mid-chase
snap("11-swap-done", "Landed: a green LED chase and a Solscan code")
H.advance(5000)

-- Watch three tokens, so the LED ticker has something to show.
local function watch(name)
  H.choose(name)
  H.advance(100)
  H.press("select")
  H.choose("Watch")
end
H.press("back") -- swap -> token
H.press("select") H.choose("Watch")
H.press("back") -- token -> discover
watch("$WIF") H.press("back")
watch("POPCAT") H.press("back")
H.press("back") -- discover -> home
H.advance(30000)
H.choose("Watchlist")
snap("12-watchlist", "Watchlist: the first six light the top LEDs, SOL the edge two")
H.press("back")

H.choose("Discover")
H.choose("Bonk")
H.press("select")
H.choose("Price alert")
H.press("down") H.press("down") H.press("down")
snap("13-alert", "Price alerts: the LEDs flash when it crosses")
H.press("back")

H.press("select")
H.choose("Ask Vantage")
snap("14-ask", "Ask Vantage: pick a question or type one")
H.choose("Is Bonk safe to trade?")
snap("15-answer", "The answer, from a live market and token snapshot")
for _ = 1, 4 do H.press("back") end

H.choose("Portfolio")
snap("16-portfolio", "Portfolio: the wallet you last swapped from")
H.press("back")

H.choose("Search")
-- (the d-pad keyboard is Solana OS's own UI, not drawn here)
H.answer("wif")
snap("18-search", "Search results")
H.press("back")

H.choose("Settings")
snap("19-settings", "Settings: trade defaults, LED ticker, wallet")
H.press("back")

-- A token that fails the audit.
b.overrides["^/v1/token/"] = {status = 200, data = RISKY}
H.choose("Discover")
H.choose("PENGU")
H.press("down") H.press("down")
snap("20-token-risky", "A token that fails the audit: live mint authority, concentrated holders")

write_file(OUT, H.json.encode(shots))
print(#shots .. " screens -> " .. OUT)
