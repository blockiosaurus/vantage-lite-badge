// Jupiter's public Swap API (`/swap/v1/quote`, `/swap/v1/swap`): quotes and
// unsigned swap transactions for any wallet, no account needed. Free on
// lite-api.jup.ag; set JUPITER_ORIGIN=https://api.jup.ag and JUPITER_API_KEY
// for the keyed tier.
//
// This app is third party: it relies on nothing from Vantage's own backend,
// only on public APIs.

import type { Env } from '../env';
import { fetchJson } from '../upstream';

export type PriorityTier = 'normal' | 'fast' | 'turbo';

export interface SwapQuote {
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

export interface BuiltSwap {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
}

/**
 * Priority tiers as Jupiter's priority levels, each with a ceiling so a busy
 * network can't run the fee up: at most 0.0005, 0.001 and 0.003 SOL.
 */
export const PRIORITY: Record<PriorityTier, { priorityLevel: string; maxLamports: number }> = {
  normal: { priorityLevel: 'medium', maxLamports: 500_000 },
  fast: { priorityLevel: 'high', maxLamports: 1_000_000 },
  turbo: { priorityLevel: 'veryHigh', maxLamports: 3_000_000 },
};

function headers(env: Env, extra: Record<string, string> = {}): Record<string, string> {
  return env.JUPITER_API_KEY ? { 'x-api-key': env.JUPITER_API_KEY, ...extra } : extra;
}

export function quote(
  env: Env,
  p: { inputMint: string; outputMint: string; amount: string; slippageBps: number },
): Promise<SwapQuote> {
  const q = new URLSearchParams({
    inputMint: p.inputMint,
    outputMint: p.outputMint,
    amount: p.amount,
    slippageBps: String(p.slippageBps),
    // Route through liquid intermediates only: fewer surprises for a swap
    // the player approves on a phone a few seconds later.
    restrictIntermediateTokens: 'true',
  });
  return fetchJson<SwapQuote>(`${env.JUPITER_ORIGIN}/swap/v1/quote?${q}`, {
    source: 'jupiter',
    timeoutMs: 10_000,
    init: { headers: headers(env) },
  });
}

export function buildSwap(
  env: Env,
  q: SwapQuote,
  userPublicKey: string,
  tier: PriorityTier,
): Promise<BuiltSwap> {
  return fetchJson<BuiltSwap>(`${env.JUPITER_ORIGIN}/swap/v1/swap`, {
    source: 'jupiter',
    timeoutMs: 12_000,
    init: {
      method: 'POST',
      headers: headers(env, { 'content-type': 'application/json' }),
      body: JSON.stringify({
        quoteResponse: q,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: { priorityLevelWithMaxLamports: PRIORITY[tier] },
      }),
    },
  });
}
