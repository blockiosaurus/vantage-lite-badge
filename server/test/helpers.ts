// Test doubles: a fake upstream world behind `fetch`, and in-memory stand-ins
// for the two Durable Object namespaces, so the router runs in plain Node.

import { vi } from 'vitest';
import type { Env } from '../src/env';
import { SwapLogic, type Store } from '../src/swap';

export const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
export const WIF = 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm';
export const SOL = 'So11111111111111111111111111111111111111112';
export const WALLET = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';
export const POOL = '6oFWm7KPLfxnwMb3z5xwBoXNSPP3JJyirAPqPSiVcnsp';

export function jupToken(over: Record<string, unknown> = {}) {
  return {
    id: BONK,
    name: 'Bonk',
    symbol: 'Bonk',
    decimals: 5,
    usdPrice: 0.000023141,
    mcap: 1_612_000_000,
    fdv: 1_830_000_000,
    liquidity: 12_400_000,
    holderCount: 912_345,
    organicScore: 92.4,
    organicScoreLabel: 'high',
    isVerified: true,
    firstPool: { id: POOL, createdAt: '2022-12-25T00:00:00Z' },
    audit: { mintAuthorityDisabled: true, freezeAuthorityDisabled: true, topHoldersPercentage: 18.2 },
    stats5m: { priceChange: 0.4 },
    stats1h: { priceChange: 2.31 },
    stats6h: { priceChange: -1.2 },
    stats24h: { priceChange: 12.345, buyVolume: 60_000_000, sellVolume: 58_000_000, numBuys: 41_000, numSells: 39_500 },
    ...over,
  };
}

export const WIF_TOKEN = jupToken({
  id: WIF,
  name: 'dogwifhat',
  symbol: '$WIF',
  decimals: 6,
  usdPrice: 1.234,
  stats1h: { priceChange: 9.9 },
});

export function v0Transaction(blockhash: Uint8Array): string {
  const bytes = [1, ...new Array(64).fill(0), 0x80, 1, 0, 1, 2, ...new Array(64).fill(7), ...blockhash, 0, 0];
  return btoa(String.fromCharCode(...bytes));
}

export const HANDED_BLOCKHASH = new Uint8Array(32).fill(9);

export interface World {
  calls: string[];
  swapBodies: Record<string, any>[];
  rpc: Record<string, (params: unknown[]) => unknown>;
  anthropic?: (body: Record<string, unknown>) => unknown;
}

export function installWorld(over: Partial<World> = {}): World {
  const world: World = {
    calls: [],
    swapBodies: [],
    rpc: {
      getTokenAccountsByOwner: () => ({
        value: [{ account: { data: { parsed: { info: { tokenAmount: { amount: '1000000' } } } } } }],
      }),
      getSignaturesForAddress: () => [{ signature: 'sigLanded', blockTime: Math.floor(Date.now() / 1000), err: null }],
      getTransaction: () => ({
        transaction: { message: { recentBlockhash: base58(HANDED_BLOCKHASH) } },
        meta: { err: null },
      }),
    },
    ...over,
  };
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    world.calls.push(`${init?.method ?? 'GET'} ${url.host}${url.pathname}`);
    const json = (v: unknown, status = 200) =>
      new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });

    if (url.host === 'jup.test') {
      if (url.pathname.startsWith('/tokens/v2/search')) {
        const q = url.searchParams.get('query') ?? '';
        const all = [jupToken(), WIF_TOKEN, jupToken({ id: SOL, name: 'Wrapped SOL', symbol: 'SOL', decimals: 9, usdPrice: 187.42 })];
        return json(all.filter((t) => q.split(',').includes(t.id) || t.symbol.toLowerCase().includes(q.toLowerCase())));
      }
      if (url.pathname.startsWith('/tokens/v2/recent')) return json([WIF_TOKEN, jupToken()]);
      if (url.pathname.startsWith('/tokens/v2/')) {
        const many = Array.from({ length: 30 }, (_, i) => jupToken({ symbol: `TOK${i}`, stats1h: { priceChange: i } }));
        return json(many.slice(0, Number(url.searchParams.get('limit') ?? 30)));
      }
      if (url.pathname === '/price/v3') {
        const out: Record<string, unknown> = {};
        for (const id of (url.searchParams.get('ids') ?? '').split(',')) {
          out[id] = { usdPrice: id === SOL ? 187.42 : 0.000023141, priceChange24h: id === SOL ? -2.5 : 12.3 };
        }
        return json(out);
      }
      if (url.pathname.startsWith('/ultra/v1/holdings/')) {
        return json({
          amount: '2500000000',
          tokens: {
            [BONK]: [{ amount: '150000000000', decimals: 5 }],
            [WIF]: [{ amount: '1', decimals: 6 }],
          },
        });
      }
    }
    if (url.host === 'api.geckoterminal.com') {
      if (url.pathname.endsWith('/pools')) {
        return json({ data: [{ attributes: { address: POOL, reserve_in_usd: '12000000' } }] });
      }
      const now = 1_790_000_000;
      const list = Array.from({ length: 96 }, (_, i) => [now - i * 900, 1, 1, 1, 0.00002 + (95 - i) * 1e-8, 10]);
      return json({ data: { attributes: { ohlcv_list: list } } });
    }
    if (url.host === 'api.alternative.me') {
      return json({ data: [{ value: '64', value_classification: 'Greed' }] });
    }
    if (url.host === 'jup.test' && url.pathname.startsWith('/swap/v1/')) {
      if (url.pathname === '/swap/v1/quote') {
        return json({
          inputMint: url.searchParams.get('inputMint'),
          inAmount: url.searchParams.get('amount'),
          outputMint: url.searchParams.get('outputMint'),
          outAmount: '432100000000',
          otherAmountThreshold: '430000000000',
          swapMode: 'ExactIn',
          slippageBps: Number(url.searchParams.get('slippageBps')),
          priceImpactPct: '0.0012',
          routePlan: [{ swapInfo: { label: 'Raydium CLMM' } }, { swapInfo: { label: 'Meteora DLMM' } }],
        });
      }
      if (url.pathname === '/swap/v1/swap') {
        world.swapBodies.push(JSON.parse(String(init?.body)));
        return json({
          swapTransaction: v0Transaction(HANDED_BLOCKHASH),
          lastValidBlockHeight: 300_000_000,
          prioritizationFeeLamports: 5000,
        });
      }
    }
    if (url.host === 'rpc.test') {
      const body = JSON.parse(String(init?.body)) as { method: string; params: unknown[]; id: number };
      const fn = world.rpc[body.method];
      if (!fn) return json({ jsonrpc: '2.0', id: body.id, error: { message: 'unknown' } });
      return json({ jsonrpc: '2.0', id: body.id, result: fn(body.params) });
    }
    if (url.host === 'api.anthropic.com' && world.anthropic) {
      return json(world.anthropic(JSON.parse(String(init?.body))));
    }
    return json({ error: `no fake for ${url.href}` }, 599);
  });
  return world;
}

export function memoryStore(): Store {
  const m = new Map<string, unknown>();
  return {
    get: async <T>(k: string) => structuredClone(m.get(k)) as T | undefined,
    put: async <T>(k: string, v: T) => {
      m.set(k, structuredClone(v));
    },
  };
}

export function testEnv(over: Partial<Env> = {}): Env {
  const intents = new Map<string, SwapLogic>();
  const counters = new Map<string, number>();
  const env = {
    PUBLIC_ORIGIN: 'https://lite.test',
    BADGE_APP_ID: 'vantage-lite',
    REQUIRE_BADGE_SIGNATURE: 'false',
    JUPITER_ORIGIN: 'https://jup.test',
    SOLANA_RPC_URL: 'https://rpc.test',
    BADGE_SERVER_ORIGIN: 'https://badge.test',
    SWAPS: {
      getByName(name: string) {
        let logic = intents.get(name);
        if (!logic) {
          logic = new SwapLogic(memoryStore(), env);
          intents.set(name, logic);
        }
        return logic;
      },
    },
    LIMITS: {
      getByName(name: string) {
        return {
          async hit(max: number) {
            const n = (counters.get(name) ?? 0) + 1;
            if (n > max) return false;
            counters.set(name, n);
            return true;
          },
        };
      },
    },
    ...over,
  } as unknown as Env;
  return env;
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = '';
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}

export function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://lite.test${path}`, { headers });
}

export function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://lite.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
