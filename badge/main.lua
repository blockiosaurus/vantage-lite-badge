-- Vantage Lite by Metaplex: the Vantage trading terminal, cut down for the
-- Solana OS badge. It runs on public APIs (Jupiter, GeckoTerminal,
-- alternative.me, Solana RPC) through its own server, not Vantage's backend.
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
nav.push(require("screens.splash"), {})
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
