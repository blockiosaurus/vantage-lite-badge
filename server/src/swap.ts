// A badge swap, from intent to landed transaction.
//
// A badge holds no keys (docs/LUA_API.md: "A badge is not a wallet"), so a
// swap is signed on the player's phone through a Solana Pay *transaction
// request*:
//
//   1. The badge posts an intent: buy 0.1 SOL of BONK, or sell 50% of it.
//   2. We store it and answer a `solana:https://<us>/pay/<id>` link; the badge
//      shows it as a QR code.
//   3. The player scans it in Phantom or Solflare. The wallet GETs the label,
//      then POSTs its account. We quote and build the swap for that account
//      through Jupiter's public Swap API and hand the wallet the transaction.
//   4. The wallet signs and sends it. Nothing comes back to us, so the badge
//      polls the intent and we look for the wallet's newest transaction whose
//      blockhash is one we handed out.
//
// The logic lives here against a small storage interface so it is testable in
// Node; swap-intent.ts wraps it in a Durable Object, one per intent.

import { decodeBase58, encodeBase58, isAddress } from './base58';
import { SOL_MINT, type Env } from './env';
import { amount, pct, units } from './format';
import { recentSignatures, tokenBalance, transactionBlockhash } from './sources/rpc';
import { buildSwap, quote, type PriorityTier } from './sources/swap-api';
import { UpstreamError } from './upstream';

export type Side = 'buy' | 'sell';

export interface IntentInput {
  id: string;
  side: Side;
  mint: string;
  symbol: string;
  decimals: number;
  /** Buy: SOL to spend, in lamports. */
  lamports?: string;
  /** Sell: percent of the scanning wallet's balance, 1..100. */
  percent?: number;
  slippageBps: number;
  tier: PriorityTier;
  badge: string;
}

interface Handout {
  blockhash: string | null;
  at: number;
}

export interface IntentState extends IntentInput {
  createdAt: number;
  wallet?: string;
  handouts: Handout[];
  checked: string[];
  result?: { signature: string; ok: boolean };
  lastCheckAt?: number;
}

export type IntentStatus =
  | { st: 'waiting' }
  | { st: 'signing'; w: string }
  | { st: 'done'; w: string; sig: string; ok: boolean }
  | { st: 'expired' };

export interface Store {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

/** How long a QR code stays scannable. */
export const SCAN_WINDOW_MS = 10 * 60_000;
/** How long we look for a handed-out transaction before calling it expired. */
export const LAND_WINDOW_MS = 3 * 60_000;
/** The most a badge may buy in one swap: 5 SOL. */
export const MAX_BUY_LAMPORTS = 5_000_000_000n;
const CHECK_EVERY_MS = 2_500;

export function validateIntent(body: unknown): Omit<IntentInput, 'id' | 'badge' | 'symbol' | 'decimals'> | string {
  if (!body || typeof body !== 'object') return 'expected a JSON object';
  const b = body as Record<string, unknown>;
  if (b.side !== 'buy' && b.side !== 'sell') return 'side must be buy or sell';
  if (!isAddress(b.mint) || b.mint === SOL_MINT) return 'mint must be a token address';
  const slippageBps = Number(b.slippageBps ?? 100);
  if (!Number.isInteger(slippageBps) || slippageBps < 10 || slippageBps > 3000) {
    return 'slippageBps must be 10..3000';
  }
  const tier = (b.tier ?? 'normal') as PriorityTier;
  if (!['normal', 'fast', 'turbo'].includes(tier)) return 'tier must be normal, fast or turbo';
  if (b.side === 'buy') {
    const lamports = String(b.lamports ?? '');
    if (!/^\d{1,19}$/.test(lamports) || BigInt(lamports) < 1_000_000n) {
      return 'lamports must be at least 1000000 (0.001 SOL)';
    }
    if (BigInt(lamports) > MAX_BUY_LAMPORTS) return 'at most 5 SOL per badge swap';
    return { side: 'buy', mint: b.mint, lamports, slippageBps, tier };
  }
  const percent = Number(b.percent);
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) return 'percent must be 1..100';
  return { side: 'sell', mint: b.mint, percent, slippageBps, tier };
}

/** The 32-byte recent blockhash of a serialized legacy or v0 transaction, in base58. */
export function blockhashOf(base64Tx: string): string | null {
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(base64Tx), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  let i = 0;
  const len = (): number => {
    let n = 0;
    for (let shift = 0; shift < 21; shift += 7) {
      const b = bytes[i++];
      if (b === undefined) throw new Error('short');
      n |= (b & 0x7f) << shift;
      if (b < 0x80) return n;
    }
    throw new Error('bad length');
  };
  try {
    const sigs = len();
    i += sigs * 64; // signatures
    if (bytes[i]! & 0x80) {
      if (bytes[i] !== 0x80) return null; // only legacy and v0 have this layout
      i += 1;
    }
    i += 3; // header
    const keys = len();
    i += keys * 32; // account keys
    const hash = bytes.subarray(i, i + 32);
    return hash.length === 32 ? encodeBase58(hash) : null;
  } catch {
    return null;
  }
}

export class SwapLogic {
  constructor(
    private readonly store: Store,
    private readonly env: Env,
    private readonly now: () => number = Date.now,
  ) {}

  private state(): Promise<IntentState | undefined> {
    return this.store.get<IntentState>('intent');
  }

  async create(input: IntentInput): Promise<void> {
    const state: IntentState = { ...input, createdAt: this.now(), handouts: [], checked: [] };
    await this.store.put('intent', state);
  }

  /** What the wallet shows before the player approves (Solana Pay GET). */
  async label(): Promise<{ label: string; icon: string } | null> {
    const s = await this.state();
    if (!s || this.now() - s.createdAt > SCAN_WINDOW_MS) return null;
    return { label: 'Vantage Lite', icon: `${this.env.PUBLIC_ORIGIN}/icon.png` };
  }

  /** Quote and build the swap for the wallet that scanned (Solana Pay POST). */
  async buildFor(account: string): Promise<{ transaction: string; message: string } | { error: string; status: number }> {
    const s = await this.state();
    if (!s || this.now() - s.createdAt > SCAN_WINDOW_MS) {
      return { error: 'This swap expired. Open it again on the badge.', status: 404 };
    }
    if (s.result) return { error: 'This swap already went through.', status: 409 };
    if (!isAddress(account)) return { error: 'Not a wallet address', status: 400 };
    if (s.wallet && s.wallet !== account) {
      return { error: 'Another wallet already scanned this code.', status: 409 };
    }

    try {
      let inAmount: string;
      if (s.side === 'buy') {
        inAmount = s.lamports!;
      } else {
        const held = await tokenBalance(this.env, account, s.mint);
        const sell = (held * BigInt(s.percent!)) / 100n;
        if (sell <= 0n) return { error: `No ${s.symbol} in this wallet to sell.`, status: 400 };
        inAmount = sell.toString();
      }
      const q = await quote(this.env, {
        inputMint: s.side === 'buy' ? SOL_MINT : s.mint,
        outputMint: s.side === 'buy' ? s.mint : SOL_MINT,
        amount: inAmount,
        slippageBps: s.slippageBps,
      });
      const built = await buildSwap(this.env, q, account, s.tier);
      s.wallet = account;
      s.handouts.push({ blockhash: blockhashOf(built.swapTransaction), at: this.now() });
      await this.store.put('intent', s);
      const message =
        s.side === 'buy'
          ? `Buy ~${amount(q.outAmount, s.decimals)} ${s.symbol} for ${units(inAmount, 9)} SOL`
          : `Sell ${amount(inAmount, s.decimals)} ${s.symbol} for ~${amount(q.outAmount, 9)} SOL`;
      return { transaction: built.swapTransaction, message: `${message} · from badge ${s.badge}` };
    } catch (e) {
      if (e instanceof UpstreamError) {
        return { error: e.status === 451 || e.status === 403 ? 'Trading this token is not available here.' : e.message, status: 502 };
      }
      throw e;
    }
  }

  /** Where the swap stands, for the badge's poll. */
  async status(): Promise<IntentStatus | null> {
    const s = await this.state();
    if (!s) return null;
    if (s.result) return { st: 'done', w: s.wallet!, sig: s.result.signature, ok: s.result.ok };
    const now = this.now();
    if (!s.wallet || s.handouts.length === 0) {
      return now - s.createdAt > SCAN_WINDOW_MS ? { st: 'expired' } : { st: 'waiting' };
    }
    if (!s.lastCheckAt || now - s.lastCheckAt >= CHECK_EVERY_MS) {
      s.lastCheckAt = now;
      const landed = await this.findLanded(s);
      await this.store.put('intent', s);
      if (landed) return { st: 'done', w: s.wallet, sig: landed.signature, ok: landed.ok };
    }
    const lastHandout = s.handouts[s.handouts.length - 1]!.at;
    return now - lastHandout > LAND_WINDOW_MS ? { st: 'expired' } : { st: 'signing', w: s.wallet };
  }

  private async findLanded(s: IntentState): Promise<IntentState['result']> {
    const hashes = new Set(s.handouts.map((h) => h.blockhash).filter((h): h is string => !!h));
    if (hashes.size === 0) return undefined;
    const since = Math.floor(s.handouts[0]!.at / 1000) - 30;
    const sigs = await recentSignatures(this.env, s.wallet!).catch(() => []);
    let looked = 0;
    for (const sig of sigs) {
      if (s.checked.includes(sig.signature)) continue;
      if (sig.blockTime !== null && sig.blockTime < since) continue;
      if (looked++ >= 3) break; // a few per poll: the badge polls again
      const tx = await transactionBlockhash(this.env, sig.signature).catch(() => null);
      if (!tx) continue; // not visible yet: look again next poll
      s.checked.push(sig.signature);
      if (hashes.has(tx.blockhash)) {
        s.result = { signature: sig.signature, ok: tx.err === null };
        return s.result;
      }
    }
    return undefined;
  }
}

/** A short random id for a pay link. */
export function newIntentId(): string {
  return encodeBase58(crypto.getRandomValues(new Uint8Array(12)));
}

export function isIntentId(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{8,24}$/.test(s) && (decodeBase58(s)?.length ?? 0) <= 12;
}

/** The badge's preview line for an intent, before any wallet has scanned. */
export async function preview(
  env: Env,
  i: Pick<IntentInput, 'side' | 'mint' | 'symbol' | 'decimals' | 'lamports' | 'percent' | 'slippageBps'>,
): Promise<{ out: string; impact: string; route: string }> {
  if (i.side === 'sell') {
    return { out: `${i.percent}% of your ${i.symbol}`, impact: '-', route: 'Jupiter' };
  }
  const q = await quote(env, {
    inputMint: SOL_MINT,
    outputMint: i.mint,
    amount: i.lamports!,
    slippageBps: i.slippageBps,
  });
  const impact = q.priceImpactPct === null ? '-' : pct(Number(q.priceImpactPct) * 100).replace('+', '');
  const labels = q.routePlan.map((r) => r.swapInfo?.label).filter((l): l is string => !!l);
  return {
    out: `~${amount(q.outAmount, i.decimals)} ${i.symbol}`,
    impact,
    route: [...new Set(labels)].slice(0, 2).join(' > ') || 'Jupiter',
  };
}
