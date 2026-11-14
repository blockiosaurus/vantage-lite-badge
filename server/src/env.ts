import type { DailyLimit } from './daily-limit';
import type { SwapIntent } from './swap-intent';

export interface Env {
  PUBLIC_ORIGIN: string;
  BADGE_APP_ID: string;
  REQUIRE_BADGE_SIGNATURE?: string;
  JUPITER_ORIGIN: string;
  JUPITER_API_KEY?: string;
  SOLANA_RPC_URL: string;
  ANTHROPIC_API_KEY?: string;
  /** Origin of the badge server whose key signs badge requests. */
  BADGE_SERVER_ORIGIN?: string;
  SWAPS: DurableObjectNamespace<SwapIntent>;
  LIMITS: DurableObjectNamespace<DailyLimit>;
}

export const SOL_MINT = 'So11111111111111111111111111111111111111112';
