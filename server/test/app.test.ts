import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handle } from '../src/app';
import { BADGE_REPLY_LIMIT } from '../src/fit';
import { BONK, get, installWorld, post, SOL, testEnv, WALLET, WIF, type World } from './helpers';

let world: World;
beforeEach(() => {
  world = installWorld();
});
afterEach(() => vi.unstubAllGlobals());

async function call(req: Request, env = testEnv()) {
  const res = await handle(req, env);
  const text = await res.text();
  expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(BADGE_REPLY_LIMIT);
  return { status: res.status, body: JSON.parse(text) as Record<string, any> };
}

describe('badge routes', () => {
  it('refuses unsigned calls when signatures are required', async () => {
    const res = await call(get('/v1/pulse'), testEnv({ REQUIRE_BADGE_SIGNATURE: 'true' }));
    expect(res).toEqual({ status: 401, body: { error: 'badge signature required' } });
  });

  it('answers the market pulse', async () => {
    const { body } = await call(get('/v1/pulse'));
    expect(body).toEqual({
      sol: { p: '$187.42', c: '-2.50%', cn: -2.5 },
      fng: { v: 64, l: 'Greed' },
      top: { m: BONK, s: 'TOK9', c: '+9.00%' },
      mood: 64,
    });
  });

  it('lists tokens in badge-sized rows', async () => {
    const { body } = await call(get('/v1/list/hot'));
    expect(body.t).toBe('Trending 1h');
    expect(body.items).toHaveLength(10);
    expect(body.items[3]).toEqual({ m: BONK, s: 'TOK3', p: '$0.00002314', c: '+3.00%', cn: 3, mc: '$1.61B', v: '$118M' });
    expect((await call(get('/v1/list/everything'))).status).toBe(400);
  });

  it('strips non-ASCII from symbols', async () => {
    const { body } = await call(get('/v1/list/new'));
    expect(body.items[0].s).toBe('$WIF');
  });

  it('answers a token page with a risk read', async () => {
    const { body } = await call(get(`/v1/token/${BONK}`));
    expect(body).toMatchObject({
      s: 'Bonk',
      p: '$0.00002314',
      ch: { '5m': '+0.40%', '1h': '+2.31%', '6h': '-1.20%', '24h': '+12.3%' },
      liq: '$12.4M',
      hold: '912K',
      ver: true,
      safe: { mint: true, freeze: true, top10: '18.2%', risk: 'low', why: [] },
      url: `https://vantage.metaplex.com/token/solana/${BONK}`,
    });
  });

  it('flags a risky token', async () => {
    const { jupToken } = await import('./helpers');
    vi.stubGlobal('fetch', async () =>
      Response.json([
        jupToken({ audit: { mintAuthorityDisabled: false, freezeAuthorityDisabled: true, topHoldersPercentage: 61 }, liquidity: 9000 }),
      ]),
    );
    const { body } = await call(get(`/v1/token/${BONK}`));
    expect(body.safe.risk).toBe('high');
    expect(body.safe.why).toEqual(['Mint authority is live', 'Top 10 hold 61%', 'Thin liquidity $9000.00']);
  });

  it('draws a chart as 0..100 points', async () => {
    const { body } = await call(get(`/v1/chart/${BONK}?r=1d`));
    expect(body.pts).toHaveLength(60);
    expect(body.pts[0]).toBe(0);
    expect(body.pts.at(-1)).toBe(100);
    expect(body).toMatchObject({ r: '1d', up: true, lo: '$0.00002', hi: '$0.00002095' });
    expect((await call(get(`/v1/chart/${BONK}?r=5y`))).status).toBe(400);
  });

  it('prices a watchlist', async () => {
    const { body } = await call(get(`/v1/prices?m=${BONK},${SOL}`));
    expect(body.items).toEqual([
      { m: BONK, p: '$0.00002314', pn: 0.000023141, c: '+12.3%', cn: 12.3 },
      { m: SOL, p: '$187.42', pn: 187.42, c: '-2.50%', cn: -2.5 },
    ]);
    expect((await call(get('/v1/prices?m=nope'))).status).toBe(400);
  });

  it('values a wallet, biggest first, dust dropped', async () => {
    const { body } = await call(get(`/v1/portfolio/${WALLET}`));
    expect(body.w).toBe('Gh9Z..tKJr');
    expect(body.sol).toBe('2.5');
    expect(body.items.map((i: { s: string }) => i.s)).toEqual(['SOL', 'Bonk']);
    expect(body.items[1]).toMatchObject({ a: '1.5M', v: '$34.71' });
    expect(body.total).toBe('$503.26');
  });

  it('searches', async () => {
    const { body } = await call(get('/v1/search?q=wif'));
    expect(body.items.map((i: { m: string }) => i.m)).toEqual([WIF]);
    expect((await call(get('/v1/search?q=w'))).status).toBe(400);
  });
});

describe('swaps', () => {
  it('opens a buy with a preview and a Solana Pay link, then serves the wallet', async () => {
    const env = testEnv();
    const created = await call(post('/v1/swap', { side: 'buy', mint: BONK, lamports: '100000000', slippageBps: 100 }), env);
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ out: '~4.32M Bonk', impact: '0.12%', route: 'Raydium CLMM > Meteora DLMM' });
    const id = created.body.id as string;
    expect(created.body.url).toBe(`solana:https://lite.test/pay/${id}`);

    const label = await handle(get(`/pay/${id}`), env);
    expect(await label.json()).toEqual({ label: 'Vantage Lite', icon: 'https://lite.test/icon.png' });

    const tx = await handle(post(`/pay/${id}`, { account: WALLET }), env);
    expect(tx.status).toBe(200);
    expect(await tx.json()).toMatchObject({ message: expect.stringMatching(/^Buy ~4.32M Bonk for 0.1 SOL/) });

    const st = await call(get(`/v1/swap/${id}`), env);
    expect(st.body).toEqual({ st: 'done', w: WALLET, sig: 'sigLanded', ok: true });
  });

  it('turns wallet errors into Solana Pay errors', async () => {
    const env = testEnv();
    const created = await call(post('/v1/swap', { side: 'buy', mint: BONK, lamports: '100000000' }), env);
    const bad = await handle(post(`/pay/${created.body.id}`, { account: 'nope' }), env);
    expect(bad.status).toBe(400);
    expect((await handle(get('/pay/0OIl'), env)).status).toBe(404);
  });

  it('caps swaps per badge per day', async () => {
    const env = testEnv();
    for (let i = 0; i < 60; i++) {
      await handle(post('/v1/swap', { side: 'sell', mint: BONK, percent: 10 }, { 'x-badge-id': 'B1' }), env);
    }
    const res = await call(post('/v1/swap', { side: 'sell', mint: BONK, percent: 10 }, { 'x-badge-id': 'B1' }), env);
    expect(res).toEqual({ status: 429, body: { error: 'daily swap limit reached' } });
  });

  it('shows why Jupiter could not route a token', async () => {
    const fake = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes('/swap/v1/quote')) {
        return Response.json({ error: 'Could not find any route', errorCode: 'COULD_NOT_FIND_ANY_ROUTE' }, { status: 400 });
      }
      return fake(input, init);
    });
    const res = await call(post('/v1/swap', { side: 'buy', mint: BONK, lamports: '100000000' }));
    expect(res).toEqual({ status: 502, body: { error: 'Could not find any route' } });
  });

  it('never calls Vantage', async () => {
    const env = testEnv();
    const created = await call(post('/v1/swap', { side: 'buy', mint: BONK, lamports: '100000000' }), env);
    await handle(post(`/pay/${created.body.id}`, { account: WALLET }), env);
    await call(get(`/v1/token/${BONK}`), env);
    expect(world.calls.length).toBeGreaterThan(0);
    expect(world.calls.filter((c) => /vantage|metaplex/i.test(c))).toEqual([]);
  });

  it('turns an upstream failure into a short error', async () => {
    vi.stubGlobal('fetch', async () => new Response('down', { status: 503 }));
    const res = await call(post('/v1/swap', { side: 'buy', mint: BONK, lamports: '100000000' }));
    expect(res).toEqual({ status: 502, body: { error: 'jupiter is unavailable' } });
  });
});

describe('ask', () => {
  it('is off without an Anthropic key', async () => {
    const res = await call(post('/v1/ask', { q: 'what is moving?' }));
    expect(res.status).toBe(404);
  });

  it('asks Claude with a market snapshot and squeezes the answer', async () => {
    let sent: Record<string, any> = {};
    world.anthropic = (body) => {
      sent = body;
      return {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: '**Bonk** is up 12.3% today — liquidity is deep at $12.4M.' }],
        usage: { input_tokens: 10, output_tokens: 10 },
      };
    };
    const res = await call(post('/v1/ask', { q: 'how is bonk doing?', mint: BONK }), testEnv({ ANTHROPIC_API_KEY: 'sk-test' }));
    expect(res.body).toEqual({ a: 'Bonk is up 12.3% today - liquidity is deep at $12.4M.' });
    expect(sent.model).toBe('claude-opus-5-5');
    expect(sent.fallbacks).toBe('default');
    expect(sent.messages[0].content).toContain('"token":{"m":"DezX');
  });
});
