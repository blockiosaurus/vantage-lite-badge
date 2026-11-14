-- Vantage Lite: an unofficial, third-party take on the Vantage trading
-- terminal for the Solana OS badge. It uses only public APIs, nothing from
-- Vantage's own backend.
--
-- Discover trending tokens, read a token's chart, stats and safety audit,
-- watch tokens on the LEDs with price alerts, ask an assistant, and buy or
-- sell through Jupiter, signed on your phone with a Solana Pay QR code (the
-- badge never holds a key).
--
-- The data and the swap builds come from the Vantage Lite server (server/ in
-- this repo); set its address in lib/config.lua and app.json "hosts".

local nav = require("lib.nav")
local store = require("lib.store")
local ticker = require("lib.ticker")
local leds = require("lib.leds")

store.load()
nav.push(require("screens.home"), {})
ticker.start()

function on_key(k, rep)
  return nav.key(k, rep)
end

function on_tick(ms)
  nav.tick(ms)
end

function on_exit()
  store.save()
  leds.off()
end
