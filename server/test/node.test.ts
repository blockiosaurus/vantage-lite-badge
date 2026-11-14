import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryKV } from '../src/kv';
import { loadEnv, serve } from '../src/main';
import { BONK, installWorld, WALLET } from './helpers';

afterEach(() => vi.unstubAllGlobals());

describe('loadEnv', () => {
  it('takes the public origin from Railway when PUBLIC_ORIGIN is unset', () => {
    const env = loadEnv({ RAILWAY_PUBLIC_DOMAIN: 'lite.up.railway.app' }, new MemoryKV());
    expect(env.PUBLIC_ORIGIN).toBe('https://lite.up.railway.app');
    expect(env.REQUIRE_BADGE_SIGNATURE).toBe('true');
    expect(env.JUPITER_ORIGIN).toBe('https://lite-api.jup.ag');
  });

  it('refuses to start without an https origin', () => {
    expect(() => loadEnv({}, new MemoryKV())).toThrow(/PUBLIC_ORIGIN/);
    expect(() => loadEnv({ PUBLIC_ORIGIN: 'http://x.example' }, new MemoryKV())).toThrow(/PUBLIC_ORIGIN/);
  });
});

describe('MemoryKV', () => {
  it('expires values and counters', async () => {
    let now = 0;
    const kv = new MemoryKV(() => now);
    await kv.set('a', '1', 10);
    expect(await kv.incr('n', 10)).toBe(1);
    expect(await kv.incr('n', 10)).toBe(2);
    now = 9_999;
    expect(await kv.get('a')).toBe('1');
    now = 10_000;
    expect(await kv.get('a')).toBeNull();
    expect(await kv.incr('n', 10)).toBe(1);
  });
});

describe('the node server', () => {
  it('serves the router, building URLs from PUBLIC_ORIGIN', async () => {
    const env = loadEnv({ PUBLIC_ORIGIN: 'https://lite.test', REQUIRE_BADGE_SIGNATURE: 'false', JUPITER_ORIGIN: 'https://jup.test', SOLANA_RPC_URL: 'https://rpc.test' }, new MemoryKV());
    const server = serve(env, 0);
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // Our own calls go to the real network stack; upstream ones to the fake world.
    const realFetch = globalThis.fetch;
    const world = installWorld();
    const fake = globalThis.fetch;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).startsWith(base) ? realFetch(input, init) : fake(input, init),
    );
    try {
      expect(await (await fetch(`${base}/healthz`)).text()).toBe('ok');
      const created = (await (
        await fetch(`${base}/v1/swap`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ side: 'buy', mint: BONK, lamports: '100000000' }),
        })
      ).json()) as { id: string; url: string };
      expect(created.url).toBe(`solana:https://lite.test/pay/${created.id}`);
      const tx = await fetch(`${base}/pay/${created.id}`, { method: 'POST', body: JSON.stringify({ account: WALLET }) });
      expect(tx.status).toBe(200);
      const st = await (await fetch(`${base}/v1/swap/${created.id}`)).json();
      expect(st).toMatchObject({ st: 'done', ok: true });
      const big = await fetch(`${base}/v1/ask`, { method: 'POST', body: 'x'.repeat(9000) });
      expect(big.status).toBe(413);
      expect(world.calls.length).toBeGreaterThan(0);
    } finally {
      server.close();
    }
  });
});
