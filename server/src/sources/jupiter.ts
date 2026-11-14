// Jupiter's token and price APIs: the market data behind Discover, token
// pages, the watchlist and the portfolio. Free on lite-api.jup.ag; set
// JUPITER_ORIGIN=https://api.jup.ag and JUPITER_API_KEY for the keyed tier.

import type { Env } from '../env';
import { fetchJson } from '../upstream';

export interface JupStats {
  priceChange?: number;
  volumeChange?: number;
  buyVolume?: number;
  sellVolume?: number;
  numBuys?: number;
  numSells?: number;
  numTraders?: number;
  holderChange?: number;
}

export interface JupToken {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  usdPrice?: number;
  mcap?: number;
  fdv?: number;
  liquidity?: number;
  holderCount?: number;
  organicScore?: number;
  organicScoreLabel?: string;
  isVerified?: boolean;
  launchpad?: string;
  tags?: string[];
  firstPool?: { id?: string; createdAt?: string };
  audit?: {
    mintAuthorityDisabled?: boolean;
    freezeAuthorityDisabled?: boolean;
    topHoldersPercentage?: number;
    devBalancePercentage?: number;
    devMigrations?: number;
  };
  stats5m?: JupStats;
  stats1h?: JupStats;
  stats6h?: JupStats;
  stats24h?: JupStats;
}

export type ListCategory = 'toptrending' | 'toptraded' | 'toporganicscore';
export type ListInterval = '5m' | '1h' | '6h' | '24h';

export interface JupPrice {
  usdPrice: number;
  decimals?: number;
  priceChange24h?: number;
}

export interface JupHoldings {
  amount: string;
  uiAmount?: number;
  tokens: Record<string, { amount: string; uiAmount?: number; decimals: number }[]>;
}

function get<T>(env: Env, path: string, ttl: number): Promise<T> {
  const headers: Record<string, string> = {};
  if (env.JUPITER_API_KEY) headers['x-api-key'] = env.JUPITER_API_KEY;
  return fetchJson<T>(`${env.JUPITER_ORIGIN}${path}`, {
    source: 'jupiter',
    ttl,
    init: { headers },
  });
}

export function listTokens(
  env: Env,
  category: ListCategory,
  interval: ListInterval,
  limit: number,
): Promise<JupToken[]> {
  return get(env, `/tokens/v2/${category}/${interval}?limit=${limit}`, 30);
}

export function recentTokens(env: Env, limit: number): Promise<JupToken[]> {
  return get<JupToken[]>(env, '/tokens/v2/recent', 30).then((t) => t.slice(0, limit));
}

/** Search by name, ticker or mint (up to 100 comma-separated mints). */
export function searchTokens(env: Env, query: string): Promise<JupToken[]> {
  return get(env, `/tokens/v2/search?query=${encodeURIComponent(query)}`, 30);
}

export async function tokenInfo(env: Env, mint: string): Promise<JupToken | null> {
  const hits = await searchTokens(env, mint);
  return hits.find((t) => t.id === mint) ?? null;
}

export function prices(env: Env, mints: string[]): Promise<Record<string, JupPrice | null>> {
  return get(env, `/price/v3?ids=${mints.join(',')}`, 10);
}

export function holdings(env: Env, wallet: string): Promise<JupHoldings> {
  return get(env, `/ultra/v1/holdings/${wallet}`, 0);
}
