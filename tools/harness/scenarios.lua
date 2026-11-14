-- What a player does with Vantage Lite, key by key. Each scenario boots a
-- fresh badge (storage can carry over) against the server's real replies.

local function expect(cond, msg)
  if not cond then error(msg or "expectation failed", 2) end
end

local function shows(text)
  local s = H.labels()
  if not s:find(text, 1, true) then error("expected '" .. text .. "' on screen, got: " .. s, 2) end
end

local function count(t) local n = 0 for _ in pairs(t) do n = n + 1 end return n end

local function lit()
  local n = 0
  for _, c in ipairs(H.badge().leds) do if c[1] + c[2] + c[3] > 0 then n = n + 1 end end
  return n
end

local BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"

return {
  {name = "boots to the menu with a live market strip", run = function()
    local b = H.boot()
    expect(H.rows() == "Pulse | Discover | Search | Watchlist | Portfolio | Ask Vantage | Settings", H.rows())
    H.flush()
    shows("SOL $187.42 -2.50%   F&G 64 Greed")
    expect(b.hint == "SELECT open   CANCEL exit")
    expect(count(b.timers) == 1, "only the ticker runs in the background")
  end},

  {name = "CANCEL on the menu exits", run = function()
    local b = H.boot()
    H.flush()
    H.press("back")
    expect(b.exited, "app should exit")
  end},

  {name = "Pulse shows SOL, fear & greed, the chart and the mood on the LEDs", run = function()
    H.boot()
    H.flush()
    H.choose("Pulse")
    shows("$187.42")
    shows("-2.50% 24h")
    shows("64")
    shows("Greed")
    shows("Top mover 1h: TOK9 +9.00%")
    expect(#H.find("canvas") == 1, "SOL chart drawn")
    expect(lit() == 5, "mood 64 lights 5 of 8 LEDs, lit " .. lit())
    H.press("select")
    expect(H.top() == H.screen("token"), "SELECT opens the top mover")
  end},

  {name = "Discover: tabs, rows, and into a token", run = function()
    local b = H.boot()
    H.flush()
    H.choose("Discover")
    expect(H.rows():find("^TOK0  %$0%.00002314 | TOK1"), H.rows())
    shows("Trending 1h")
    H.press("right")
    shows("Top volume 24h")
    H.press("right")
    expect(H.rows():find("^%$WIF"), "New tab: " .. H.rows())
    H.press("left")
    H.press("left")
    -- cached: going back to Hot asks nothing new
    local asked = #b.requests
    H.press("right") H.press("left")
    expect(#b.requests == asked, "tabs within 30 s come from the cache")
    H.press("down")
    H.press("select")
    expect(H.top() == H.screen("token"))
  end},

  {name = "Token page: chart ranges, stats and safety pages", run = function()
    local b = H.boot()
    H.flush()
    H.choose("Discover")
    H.press("select")
    shows("Bonk")
    shows("$0.00002314")
    shows("+12.3%")
    shows("VERIFIED")
    expect(#H.find("canvas") == 1, "chart drawn")
    shows("L $0.00002   H $0.00002095")
    shows("Chart  1/3")
    H.press("left")
    expect(b.requests[#b.requests]:find("r=1h"), b.requests[#b.requests])
    H.press("down")
    shows("Stats  2/3")
    shows("MCAP") shows("$1.61B") shows("HOLDERS") shows("912K") shows("92 high")
    H.press("down")
    shows("Safety  3/3")
    shows("LOW") shows("revoked") shows("18.2%") shows("No flags from the audit.")
    H.press("down")
    shows("Chart  1/3")
    H.press("back")
    expect(H.top() == H.screen("discover"))
  end},

  {name = "Watch a token: it joins the list and lights its LED", run = function()
    local b = H.boot()
    H.flush()
    H.choose("Discover")
    H.press("select")
    H.press("select")
    H.choose("Watch")
    expect(b.toasts[#b.toasts] == "Watching Bonk", b.toasts[#b.toasts])
    expect(H.top() == H.screen("token"))
    shows("watching")
    H.press("back") H.press("back")
    H.choose("Watchlist")
    expect(H.rows() == "Bonk  $0.00002314", H.rows())
    expect(b.leds[1][2] > 0 and b.leds[1][1] == 0, "LED 1 green for +12.3%")
    expect(b.leds[7][1] > 0 and b.leds[7][2] == 0, "LEDs 7-8 red for SOL -2.5%")
    local saved = json and nil
    -- survives a restart
    local storage = b.storage
    H.boot(storage)
    H.flush()
    expect(H.rows():find("Watchlist"))
    H.choose("Watchlist")
    expect(H.rows() == "Bonk  $0.00002314", "watchlist kept: " .. H.rows())
  end},

  {name = "Buy: amount, Solana Pay QR, signing, landed", run = function()
    local b = H.boot()
    H.flush()
    H.choose("Discover")
    H.press("select")
    H.press("select")
    H.choose("Buy Bonk")
    shows("Slippage 1%   Priority normal")
    expect(H.rows():find("0.1 SOL"), H.rows())
    H.choose("0.25 SOL")
    expect(b.requests[#b.requests] == "POST /v1/swap", b.requests[#b.requests])
    local qr = H.find("qr")[1]
    expect(qr and qr.value == H.fixtures.swap.url, "QR holds the Solana Pay link")
    shows("BUY Bonk") shows("0.25 SOL") shows("~4.32M Bonk") shows("SCAN")
    H.advance(3000)
    shows("SCAN")
    H.advance(3000)
    shows("SIGNING")
    shows("Gh9Z..tKJr")
    H.advance(3000)
    shows("DONE")
    shows("Landed!")
    expect(qr.value:find("^https://solscan.io/tx/5Ufg"), qr.value)
    expect(b.toasts[#b.toasts] == "Wallet Gh9Z..tKJr saved for Portfolio", b.toasts[#b.toasts])
    -- the poll stops once it has landed
    local asked = #b.requests
    H.advance(9000)
    local polls = 0
    for i = asked + 1, #b.requests do if b.requests[i]:find("/v1/swap/") then polls = polls + 1 end end
    expect(polls == 0, "still polling after done")
    H.advance(3000)
    H.press("back")
    expect(H.top() == H.screen("token"), "back goes to the token")
    -- the saved wallet feeds the portfolio
    H.press("back") H.press("back")
    H.choose("Portfolio")
    shows("$503.26") shows("2.5 SOL")
    expect(H.rows() == "SOL  $468.55 | Bonk  $34.71", H.rows())
  end},

  {name = "Sell sends a percent and the server picks the amount", run = function()
    local b = H.boot()
    H.flush()
    H.choose("Discover")
    H.press("select") H.press("select")
    H.choose("Sell Bonk")
    expect(H.rows() == "25% | 50% | 100%", H.rows())
    H.choose("50%")
    shows("SELL Bonk") shows("50% of it")
  end},

  {name = "A failed quote shows why and flashes red", run = function()
    local b = H.boot()
    H.flush()
    H.choose("Discover")
    H.press("select") H.press("select")
    H.choose("Buy Bonk")
    b.overrides["^/v1/swap$"] = {status = 502, data = {error = "jupiter is unavailable"}}
    H.choose("0.1 SOL")
    shows("NO QUOTE") shows("jupiter is unavailable")
    expect(#H.find("qr") == 0)
  end},

  {name = "Price alert fires from the ticker", run = function()
    local b = H.boot()
    H.flush()
    H.choose("Discover")
    H.press("select") H.press("select")
    H.choose("Price alert")
    H.choose("-5%")
    expect(b.toasts[#b.toasts] == "Alert set: Bonk -5%", b.toasts[#b.toasts])
    -- the price drops 10% before the next tick
    local items = {
      {m = BONK, p = "$0.00002083", pn = 0.00002083, c = "-10.0%", cn = -10},
      {m = "So11111111111111111111111111111111111111112", p = "$187.42", pn = 187.42, c = "-2.50%", cn = -2.5},
    }
    b.overrides["^/v1/prices"] = {status = 200, data = {items = items}}
    H.advance(30000)
    expect(b.toasts[#b.toasts] == "Bonk is below $0.00002198", b.toasts[#b.toasts])
    H.advance(30000)
    expect(b.toasts[#b.toasts] == "Bonk is below $0.00002198" and #b.toasts == 2, "fires once")
  end},

  {name = "Ask Vantage about a token, paged", run = function()
    H.boot()
    H.flush()
    H.choose("Discover")
    H.press("select") H.press("select")
    H.choose("Ask Vantage")
    H.choose("Is Bonk safe to trade?")
    shows("Is Bonk safe to trade?")
    shows("Bonk is up 12.3%")
    shows("1/2")
    H.press("down")
    shows("2/2")
    shows("size positions")
    H.press("down")
    shows("2/2")
  end},

  {name = "Ask with a typed question", run = function()
    local b = H.boot()
    H.flush()
    H.choose("Ask Vantage")
    H.choose("Type a question")
    H.answer("what is pumping")
    shows("what is pumping")
    expect(b.requests[#b.requests] == "POST /v1/ask")
  end},

  {name = "Search", run = function()
    local b = H.boot()
    H.flush()
    H.choose("Search")
    H.answer("wif")
    expect(b.requests[#b.requests] == "GET /v1/search?q=wif", b.requests[#b.requests])
    expect(H.rows():find("^%$WIF"), H.rows())
    H.press("select")
    expect(H.top() == H.screen("token"))
  end},

  {name = "Search cancelled with nothing found goes back", run = function()
    H.boot()
    H.flush()
    H.choose("Search")
    H.answer(nil)
    expect(H.top() == H.screen("home"))
  end},

  {name = "Portfolio falls back to the wallet linked at /profile", run = function()
    local b = H.boot(nil, H.WALLET)
    H.flush()
    H.choose("Portfolio")
    shows("Gh9Z..tKJr") shows("$503.26")
  end},

  {name = "Portfolio with no wallet explains how to get one", run = function()
    H.boot()
    H.flush()
    H.choose("Portfolio")
    shows("No wallet yet")
  end},

  {name = "Settings cycle and persist; the ticker can go dark", run = function()
    local b = H.boot()
    H.flush()
    H.choose("Settings")
    H.choose("Default buy")
    H.choose("Slippage")
    H.choose("Priority fee")
    H.choose("LED ticker")
    expect(lit() == 0, "LEDs off with the ticker off")
    local s = H.json.decode(b.storage.settings)
    expect(s.buy == 250000000 and s.slip == 300 and s.tier == "fast" and s.mev == nil and s.ticker == false,
      b.storage.settings)
    H.boot(b.storage)
    H.flush()
    H.choose("Discover")
    H.press("select") H.press("select")
    H.choose("Buy Bonk")
    shows("Slippage 3%   Priority fast")
    expect(H.find("list")[1].sel == 3, "default buy preselected")
  end},

  {name = "Offline: every screen says so instead of breaking", run = function()
    local b = H.boot()
    b.offline = true
    H.flush()
    shows("Wi-Fi is off")
    H.choose("Discover")
    shows("Wi-Fi is off")
    H.press("back")
    H.choose("Pulse")
    shows("Wi-Fi is off")
  end},

  {name = "Late answers for a screen that's gone are dropped", run = function()
    local b = H.boot()
    H.flush()
    H.choose("Discover")
    -- leave before the list arrives
    H.press("back")
    expect(H.top() == H.screen("home"))
    expect(not H.labels():find("Trending"), "discover's answer drew on the menu")
  end},
}
