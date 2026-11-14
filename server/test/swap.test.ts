import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blockhashOf, LAND_WINDOW_MS, SCAN_WINDOW_MS, SwapLogic, validateIntent, type IntentInput } from '../src/swap';
import { base58, BONK, HANDED_BLOCKHASH, installWorld, memoryStore, testEnv, v0Transaction, WALLET, type World } from './helpers';

const BUY: IntentInput = {
  id: 'abc123def456',
  side: 'buy',
  mint: BONK,
  symbol: 'Bonk',
  decimals: 5,
  lamports: '100000000',
  slippageBps: 100,
  tier: 'normal',
  mev: false,
  badge: '7K2Q9M',
};

describe('validateIntent', () => {
  it('accepts a buy and a sell', () => {
    expect(validateIntent({ side: 'buy', mint: BONK, lamports: '100000000' })).toMatchObject({ side: 'buy', slippageBps: 100 });
    expect(validateIntent({ side: 'sell', mint: BONK, percent: 50, mev: true })).toMatchObject({ percent: 50, mev: true });
  });

  it('refuses what a badge should not send', () => {
    expect(validateIntent({ side: 'buy', mint: BONK, lamports: '6000000000' })).toBe('at most 5 SOL per badge swap');
    expect(validateIntent({ side: 'buy', mint: BONK, lamports: 100 })).toMatch(/at least/);
    expect(validateIntent({ side: 'sell', mint: BONK, percent: 101 })).toMatch(/percent/);
    expect(validateIntent({ side: 'buy', mint: 'nope', lamports: '100000000' })).toMatch(/mint/);
    expect(validateIntent({ side: 'buy', mint: 'So11111111111111111111111111111111111111112', lamports: '100000000' })).toMatch(/mint/);
    expect(validateIntent({ side: 'buy', mint: BONK, lamports: '100000000', tier: 'ludicrous' })).toMatch(/tier/);
  });
});

describe('blockhashOf', () => {
  it('reads a v0 transaction', () => {
    expect(blockhashOf(v0Transaction(HANDED_BLOCKHASH))).toBe(base58(HANDED_BLOCKHASH));
  });

  it('reads a legacy transaction', () => {
    const bytes = [1, ...new Array(64).fill(0), 1, 0, 1, 2, ...new Array(64).fill(3), ...HANDED_BLOCKHASH, 0];
    expect(blockhashOf(btoa(String.fromCharCode(...bytes)))).toBe(base58(HANDED_BLOCKHASH));
  });

  it('gives null for garbage', () => {
    expect(blockhashOf('!!!')).toBeNull();
    expect(blockhashOf(btoa('\x01'))).toBeNull();
  });
});

describe('SwapLogic', () => {
  let world: World;
  let now: number;
  const clock = () => now;

  beforeEach(() => {
    world = installWorld();
    now = 1_790_000_000_000;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('walks a buy from scan to landed', async () => {
    const logic = new SwapLogic(memoryStore(), testEnv(), clock);
    await logic.create(BUY);
    expect(await logic.status()).toEqual({ st: 'waiting' });
    expect(await logic.label()).toEqual({ label: 'Vantage Lite', icon: 'https://lite.test/icon.png' });

    const built = await logic.buildFor(WALLET);
    expect(built).toMatchObject({ transaction: v0Transaction(HANDED_BLOCKHASH) });
    expect('message' in built && built.message).toBe('Buy ~4.32M Bonk for 0.1 SOL · from badge 7K2Q9M');
    expect(world.calls).toContain('POST vantage.test/api/trade/swap');

    world.rpc.getSignaturesForAddress = () => [{ signature: 'sigLanded', blockTime: Math.floor(now / 1000), err: null }];
    now += 3000;
    expect(await logic.status()).toEqual({ st: 'done', w: WALLET, sig: 'sigLanded', ok: true });
    // A second scan after it landed is refused.
    expect(await logic.buildFor(WALLET)).toMatchObject({ status: 409 });
  });

  it('ignores the wallet\'s other transactions', async () => {
    world.rpc.getTransaction = () => ({ transaction: { message: { recentBlockhash: '11111111111111111111111111111111' } }, meta: { err: null } });
    const logic = new SwapLogic(memoryStore(), testEnv(), clock);
    await logic.create(BUY);
    await logic.buildFor(WALLET);
    now += 3000;
    expect(await logic.status()).toEqual({ st: 'signing', w: WALLET });
    now += LAND_WINDOW_MS + 1;
    expect(await logic.status()).toEqual({ st: 'expired' });
  });

  it('reports a failed transaction as done but not ok', async () => {
    world.rpc.getTransaction = () => ({
      transaction: { message: { recentBlockhash: base58(HANDED_BLOCKHASH) } },
      meta: { err: { InstructionError: [2, { Custom: 6001 }] } },
    });
    const logic = new SwapLogic(memoryStore(), testEnv(), clock);
    await logic.create(BUY);
    await logic.buildFor(WALLET);
    now += 3000;
    expect(await logic.status()).toMatchObject({ st: 'done', ok: false });
  });

  it('sells a percent of whatever the scanning wallet holds', async () => {
    const logic = new SwapLogic(memoryStore(), testEnv(), clock);
    await logic.create({ ...BUY, side: 'sell', lamports: undefined, percent: 50 });
    const built = await logic.buildFor(WALLET);
    expect('message' in built && built.message).toMatch(/^Sell 5 Bonk for ~432.1 SOL/);
    expect(world.calls.some((c) => c.startsWith('GET vantage.test/api/trade/quote'))).toBe(true);
  });

  it('refuses a sell from a wallet that holds none', async () => {
    world.rpc.getTokenAccountsByOwner = () => ({ value: [] });
    const logic = new SwapLogic(memoryStore(), testEnv(), clock);
    await logic.create({ ...BUY, side: 'sell', lamports: undefined, percent: 100 });
    expect(await logic.buildFor(WALLET)).toEqual({ error: 'No Bonk in this wallet to sell.', status: 400 });
  });

  it('keeps one wallet per code, and expires unscanned codes', async () => {
    const logic = new SwapLogic(memoryStore(), testEnv(), clock);
    await logic.create(BUY);
    await logic.buildFor(WALLET);
    expect(await logic.buildFor(BONK)).toMatchObject({ status: 409 });

    const idle = new SwapLogic(memoryStore(), testEnv(), clock);
    await idle.create(BUY);
    now += SCAN_WINDOW_MS + 1;
    expect(await idle.status()).toEqual({ st: 'expired' });
    expect(await idle.label()).toBeNull();
    expect(await idle.buildFor(WALLET)).toMatchObject({ status: 404 });
  });
});
