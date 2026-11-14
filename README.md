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
 badge (Lua, badge/)  ──http, signed by the badge server──►  Vantage Lite server (server/, Node on Railway)
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
| `server/` | The Node server: routes in `src/app.ts`, swap intents in `src/swap.ts`, state in Redis (`src/kv.ts`, `src/state.ts`), upstream clients in `src/sources/`, entry point `src/main.ts` |
| `tools/harness/` | Runs the badge app on the badge's own Lua 5.5, built natively from solana-os, against a recorded Solana OS (ui, http, timer, led, storage…) with the limits that matter checked as errors |

## Set up

### 1. Deploy the server on Railway

The server is plain Node (`server/`, `npm start`) with Redis for its state.

1. In [Railway](https://railway.com), **New Project → Deploy from GitHub repo**, and pick this
   repo.
2. In the new service's **Settings**, set **Root Directory** to `/server`. Railway picks up
   `server/railway.json`: `npm start`, a health check on `/healthz`, one replica.
3. **Settings → Networking → Generate Domain.** That gives the service a public
   `https://<name>.up.railway.app` address. The server reads it from Railway's
   `RAILWAY_PUBLIC_DOMAIN`, and the Solana Pay QR codes point there. If you use a custom
   domain instead, set `PUBLIC_ORIGIN` to `https://<your domain>`.
4. Add Redis: in the project, **+ New → Database → Redis**. Then in the server service's
   **Variables**, add `REDIS_URL` with the value `${{Redis.REDIS_URL}}`. Without Redis the
   server still runs, but pending swaps and daily limits live in memory and reset on every
   deploy.
5. Optional variables:

| Variable | What it does |
|---|---|
| `ANTHROPIC_API_KEY` | Turns on Ask Vantage. Without it the route answers 404 and the badge says so. |
| `SOLANA_RPC_URL` | A private mainnet RPC. The public default is rate-limited; use your own for anything beyond a demo. |
| `JUPITER_API_KEY` | With `JUPITER_ORIGIN=https://api.jup.ag`, Jupiter's keyed tier. The default is the free, rate-limited `lite-api.jup.ag`. |
| `PUBLIC_ORIGIN` | Only for a custom domain (see step 3). |

6. Deploy, then check it's up. It should print `ok`; the `/v1/...` routes answer 401 to
   anything that isn't a badge.

```bash
curl https://<name>.up.railway.app/healthz
```

Keep it at **one replica**: each swap's calls are queued in the process (`src/state.ts`), so
two replicas could step on each other's writes.

### 2. Point the app at it

Put the server's host (e.g. `<name>.up.railway.app`) in both `badge/app.json` (`"hosts"`) and `badge/lib/config.lua`
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
cd server && npm test            # 40 tests: routes, swap lifecycle, badge signatures, the Node server, formatting
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

To run the server locally on port 8787, without badge signatures and with in-memory state:

```bash
cd server && npm run dev
```

## Notes

- **Names.** "Vantage" is a Metaplex product name. If you publish this outside Metaplex, check
  that the name and the blue are fine to use, or rename the app (`badge/app.json`,
  `badge/lib/theme.lua`).
- The badge holds no secrets: `main.lua` is readable by anyone who installs the app, so every
  key lives on the server.

## License

MIT, see `LICENSE`.
