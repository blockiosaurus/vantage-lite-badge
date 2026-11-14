// Vantage's own trade routes, `GET /api/trade/quote` and `POST /api/trade/swap`
// (packages/trade-routes in metaplex-global/genesis-app). Calling them, rather
// than an aggregator directly, gives a badge swap everything a Vantage swap
// gets: the Titan/Jupiter quote race, a fresh Genesis launch's own Raydium pool
// in its post-graduation window, priority-fee tiers and Jito MEV protection.

import type { Env } from '../env';
import { fetchJson } from '../upstream';

export type PriorityTier = 'normal' | 'fast' | 'turbo';

export interface VantageQuote {
  success: true;
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  slippageBps: number;
  priceImpactPct: string | null;
  routePlan: { swapInfo?: { label?: string } }[];
  [key: string]: unknown;
}

export interface VantageSwap {
  success: true;
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
}

export interface SwapSettings {
  priorityFeeTier: PriorityTier;
  /** Jito MEV protection: the build tips 0.001 SOL and sends as a bundle. */
  mev: boolean;
}

/** The smallest tip Vantage accepts (JITO_TIP_FLOOR_LAMPORTS). */
export const MEV_TIP_LAMPORTS = 1_000_000;

export function quote(
  env: Env,
  p: { inputMint: string; outputMint: string; amount: string; slippageBps: number },
): Promise<VantageQuote> {
  const q = new URLSearchParams({
    inputMint: p.inputMint,
    outputMint: p.outputMint,
    amount: p.amount,
    slippageBps: String(p.slippageBps),
    network: 'solana-mainnet',
  });
  return fetchJson<VantageQuote>(`${env.VANTAGE_ORIGIN}/api/trade/quote?${q}`, {
    source: 'vantage',
    timeoutMs: 10_000,
  });
}

export function buildSwap(
  env: Env,
  q: VantageQuote,
  userPublicKey: string,
  settings: SwapSettings,
): Promise<VantageSwap> {
  return fetchJson<VantageSwap>(`${env.VANTAGE_ORIGIN}/api/trade/swap`, {
    source: 'vantage',
    timeoutMs: 12_000,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: q,
        userPublicKey,
        network: 'solana-mainnet',
        maxSupportedTransactionVersion: 0,
        priorityFeeTier: settings.priorityFeeTier,
        enableMEVProtection: settings.mev,
        jitoTipLamports: settings.mev ? MEV_TIP_LAMPORTS : 0,
        // Two builds of one trade must never be byte-identical (see the
        // route's own note on `salt`): each wallet request gets its own.
        salt: crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000,
      }),
    },
  });
}
