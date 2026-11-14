# Vantage Lite

An unofficial, third-party badge app inspired by [Vantage](https://vantage.metaplex.com), the
Metaplex trading terminal, for the
[Solana Breakpoint 2026 badge](https://github.com/solana-foundation/solana-os): an ESP32-C5
with a 320×218 screen, six buttons and eight RGB LEDs.

> **Not affiliated with Vantage or Metaplex.** Vantage Lite uses only public APIs (Jupiter,
> GeckoTerminal, alternative.me, Solana RPC). It depends on nothing from Vantage's backend and
> keeps working whatever Vantage changes. The one link to Vantage is "Open in Vantage", a QR
> code for the token's public page.

| On the badge | Inspired by Vantage's |
|---|---|
| **Pulse**: SOL price, Fear & Greed, SOL's day chart, the hour's top mover. The LEDs show the mood as a red-to-green bar. | Market mood block |
| **Discover**: Trending 1h, Top volume, New pairs, Organic. LEFT/RIGHT switches tabs. | Discovery boards |
| **Search** by name, ticker or mint | Token search |
| **Token page**: price and day up top, then three pages (UP/DOWN): a chart (1H/1D/1W), stats (mcap, FDV, liquidity, volume, holders, buys and sells, organic score, age) and a safety read (mint and freeze authority, top-10 and dev holdings, a low/medium/high risk with reasons) | Token board: chart, stats, audit |
| **Buy and sell** through Jupiter's public Swap API, signed on your phone by scanning a Solana Pay QR code. Slippage and a capped priority fee come from Settings. The badge watches for the transaction to land, then shows a Solscan QR and plays a green LED chase. | Swap widget |
| **Watchlist** of up to 7 tokens. The first six light the six top LEDs (green up, red down, brighter the bigger the move); the two edge LEDs show SOL. | Watchlist |
| **Price alerts** (±5/10/25%): when the price crosses, a toast and a blue LED flash | Token alerts |
| **Portfolio**: what a wallet holds, by value. Uses the wallet you last swapped from, or the Solana address you linked at the badge site's `/profile` | Portfolio |
| **Ask Vantage**: canned or typed questions, answered by Claude from a live market and token snapshot (optional, needs your own Anthropic key) | Assistant |
| **Open in Vantage**: a QR code for the token's public page on vantage.metaplex.com | n/a |

## How it fits together

```
 badge (Lua, badge/)  ──http, signed by the badge server──►  Vantage Lite server (server/, a Cloudflare Worker)
   │                                                            ├─ Jupiter tokens + price API   (lists, token pages, prices, portfolio)
   │                                                            ├─ Jupiter Swap API             (quotes and swap transactions)
   │                                                            ├─ GeckoTerminal OHLCV          (charts)
   │                                                            ├─ alternative.me               (Fear & Greed)
   │                                                            ├─ Solana RPC                   (sell balance, did it land?)
   │                                                            └─ Claude                       (Ask Vantage, optional)
   │
   └─ shows solana:https://<server>/pay/<id> as a QR ──► phone wallet ──POST {account}──► server builds the swap for that wallet
```

The server exists for three reasons:

1. **Badge-sized replies.** The badge server hands an app at most ~3.5 KB of answer, and the
   badge's Lua has 32-bit integers and floats. The server condenses every upstream answer into
   short keys with display strings already formatted (`"$0.00002314"`, `"+12.3%"`, `"$1.61B"`),
   and trims lists until they fit (`server/src/fit.ts`).
2. **No keys on the badge.** A badge is not a wallet (`docs/LUA_API.md` in solana-os). Swaps
   use a Solana Pay *transaction request*: the server stores the badge's intent ("buy 0.1 SOL
   of BONK", "sell 50%"), and builds the transaction with Jupiter for whichever wallet scans
   the QR. It signs nothing. A sell's amount is worked out from the scanning wallet's balance,
   so the badge never needs to know the wallet in advance.
3. **Watching for the landing.** Nothing comes back from the wallet, so the badge polls the
   intent and the server looks through the wallet's newest transactions for one whose
   blockhash it handed out (`server/src/swap.ts`).

Every `/v1` route checks the badge server's Ed25519 signature on the request
(`server/src/badge-auth.ts`), so only this app on a real badge can use it. Swaps are capped at
5 SOL and 60 a day per badge; Ask Vantage at 25 questions a day per player. The priority fee
is capped at 0.0005, 0.001 or 0.003 SOL (normal, fast, turbo). The wallet broadcasts the
transaction itself, so there is no Jito bundle or MEV protection. No fee is added to swaps.

## Layout

| Path | What |
|---|---|
| `badge/` | The Solana OS app: `main.lua`, `app.json`, `lib/` (navigation, API client, LEDs, ticker, chart), `screens/` |
| `server/` | The Cloudflare Worker: routes in `src/app.ts`, swap intents in `src/swap.ts` (a Durable Object per intent), upstream clients in `src/sources/` |
| `tools/harness/` | Runs the badge app on the badge's own Lua 5.5, built natively from solana-os, against a recorded Solana OS (ui, http, timer, led, storage…) with the limits that matter checked as errors |

## Set up

### 1. Deploy the server

```bash
cd server
npm install
```

Edit `wrangler.jsonc`: set `PUBLIC_ORIGIN` to the Worker's public `https://` origin (the
Solana Pay links point there). Then:

```bash
npx wrangler deploy
```

Optional secrets:

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

```bash
npx wrangler secret put JUPITER_API_KEY
```

`ANTHROPIC_API_KEY` turns on Ask Vantage (without it the route answers 404 and the badge says so).
`JUPITER_API_KEY` goes with `JUPITER_ORIGIN=https://api.jup.ag`; the default is the free,
rate-limited `lite-api.jup.ag`. Point `SOLANA_RPC_URL` at a private RPC for anything beyond a
demo: the public one is rate-limited too.

### 2. Point the app at it

Put the Worker's host in both `badge/app.json` (`"hosts"`) and `badge/lib/config.lua`
(`SERVER`). The badge server refuses any host not in `hosts`.

### 3. Try it and publish

Drop the `badge/` folder on the badge site's `/apps/submit`. **Try in emulator** runs it in
the page; **Run on badge** copies it to a badge over USB. Both start a 12-hour test run, so
`http` works before the app is published (your account needs X linked). Publishing puts it in
the App Store.

The app needs Solana OS 0.5.3 or later (QR codes) and the `http`, `led` and `profile`
permissions.

## Develop

```bash
cd server && npm test            # 36 tests: routes, swap lifecycle, badge signatures, formatting
```

```bash
cd server && npm run typecheck
```

```bash
tools/harness/run.sh             # 19 scenarios: every screen, key by key, on the badge's Lua 5.5
```

`run.sh` clones solana-os into `.cache/` the first time (or set `SOLANA_OS=` to a checkout) and
builds its vendored Lua with the system C compiler. The harness reads `tools/harness/fixtures.json`,
which is what the server really answers. Regenerate it after changing a reply shape:

```bash
cd server && EXPORT_FIXTURES=../tools/harness/fixtures.json npx vitest run test/export-fixtures.test.ts
```

To run the server locally without badge signatures, set `REQUIRE_BADGE_SIGNATURE` to `"false"`
in `wrangler.jsonc` and run `npx wrangler dev`.

## Notes

- **Names.** "Vantage" is a Metaplex product name. If you publish this outside Metaplex, check
  that the name and the blue are fine to use, or rename the app (`badge/app.json`,
  `badge/lib/theme.lua`).
- The badge holds no secrets: `main.lua` is readable by anyone who installs the app, so every
  key lives on the server.

## License

MIT, see `LICENSE`.
