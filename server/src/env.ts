import type { IntentInput, SwapLogic } from './swap';

/** One swap intent's operations (see swap.ts). */
export type SwapHandle = Pick<SwapLogic, 'label' | 'buildFor' | 'status'> & {
  create(input: IntentInput): Promise<void>;
};

export interface Env {
  PUBLIC_ORIGIN: string;
  BADGE_APP_ID: string;
  REQUIRE_BADGE_SIGNATURE?: string;
  JUPITER_ORIGIN: string;
  JUPITER_API_KEY?: string;
  SOLANA_RPC_URL: string;
  ANTHROPIC_API_KEY?: string;
  /** Ed25519 private key (PKCS#8, base64) that signs Vantage access tickets. */
  VANTAGE_ACCESS_SIGNING_KEY?: string;
  /** Where tickets are redeemed: Vantage's origin (its /badge page). */
  VANTAGE_ACCESS_ORIGIN: string;
  /** Origin of the badge server whose key signs badge requests. */
  BADGE_SERVER_ORIGIN?: string;
  /** Swap intents by id. */
  SWAPS: { getByName(id: string): SwapHandle };
  /** Daily counters by name: `hit(max)` counts one and says whether it was allowed. */
  LIMITS: { getByName(name: string): { hit(max: number): Promise<boolean> } };
}

export const SOL_MINT = 'So11111111111111111111111111111111111111112';
