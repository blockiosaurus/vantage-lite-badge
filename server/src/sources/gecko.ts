// GeckoTerminal's free OHLCV: the badge's price chart. A token's chart is its
// deepest pool's candles, priced in the token (token=<mint>), in USD.

import { fetchJson } from '../upstream';

const ORIGIN = 'https://api.geckoterminal.com/api/v2';
const HEADERS = { accept: 'application/json;version=20230302' };

export type ChartRange = '1h' | '1d' | '1w';

const RANGES: Record<ChartRange, { timeframe: string; aggregate: number; limit: number }> = {
  '1h': { timeframe: 'minute', aggregate: 1, limit: 60 },
  '1d': { timeframe: 'minute', aggregate: 15, limit: 96 },
  '1w': { timeframe: 'hour', aggregate: 4, limit: 42 },
};

interface PoolsResponse {
  data?: { attributes?: { address?: string; reserve_in_usd?: string } }[];
}

interface OhlcvResponse {
  data?: { attributes?: { ohlcv_list?: [number, number, number, number, number, number][] } };
}

export async function topPool(mint: string): Promise<string | null> {
  const res = await fetchJson<PoolsResponse>(
    `${ORIGIN}/networks/solana/tokens/${mint}/pools?page=1`,
    { source: 'geckoterminal', ttl: 3600, init: { headers: HEADERS } },
  );
  let best: { address: string; reserve: number } | null = null;
  for (const p of res.data ?? []) {
    const address = p.attributes?.address;
    const reserve = Number(p.attributes?.reserve_in_usd ?? 0);
    if (address && (!best || reserve > best.reserve)) best = { address, reserve };
  }
  return best?.address ?? null;
}

/** Closing prices, oldest first. */
export async function closes(mint: string, range: ChartRange): Promise<number[]> {
  const pool = await topPool(mint);
  if (!pool) return [];
  const r = RANGES[range];
  const res = await fetchJson<OhlcvResponse>(
    `${ORIGIN}/networks/solana/pools/${pool}/ohlcv/${r.timeframe}` +
      `?aggregate=${r.aggregate}&limit=${r.limit}&currency=usd&token=${mint}`,
    { source: 'geckoterminal', ttl: range === '1h' ? 30 : 120, init: { headers: HEADERS } },
  );
  const list = res.data?.attributes?.ohlcv_list ?? [];
  return list
    .slice()
    .sort((a, b) => a[0] - b[0])
    .map((c) => c[4])
    .filter((c) => Number.isFinite(c) && c > 0);
}
