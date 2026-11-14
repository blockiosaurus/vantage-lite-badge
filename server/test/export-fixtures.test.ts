// Writes what the server really answers the badge, for the Lua harness in
// tools/harness, so the badge app is tested against the server's actual reply
// shapes rather than hand-copied ones. Runs only with EXPORT_FIXTURES=<path>.

import { writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { handle } from '../src/app';
import { BONK, get, installWorld, post, SOL, testEnv, WALLET } from './helpers';

const out = process.env.EXPORT_FIXTURES;

describe.runIf(out)('export fixtures for the badge harness', () => {
  afterAll(() => vi.unstubAllGlobals());

  it('records every badge route', async () => {
    const world = installWorld();
    world.anthropic = () => ({
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      stop_reason: 'end_turn',
      content: [
        {
          type: 'text',
          text:
            'Bonk is up 12.3% on the day with $118M of volume, and its liquidity is deep at $12.4M. ' +
            'The audit is clean: mint and freeze authority are revoked and the top 10 wallets hold 18%. ' +
            'Buys outnumber sells 41K to 39.5K, so the move has broad participation rather than one whale. ' +
            'Memecoins swing hard, so size positions for a fast reversal.',
        },
      ],
      usage: { input_tokens: 10, output_tokens: 10 },
    });
    const env = testEnv({ ANTHROPIC_API_KEY: 'sk-test' });
    const json = async (req: Request) => {
      const res = await handle(req, env);
      expect(res.status).toBe(200);
      return res.json();
    };
    const fixtures: Record<string, unknown> = {
      pulse: await json(get('/v1/pulse')),
      'list/hot': await json(get('/v1/list/hot')),
      'list/volume': await json(get('/v1/list/volume')),
      'list/new': await json(get('/v1/list/new')),
      'list/organic': await json(get('/v1/list/organic')),
      search: await json(get('/v1/search?q=wif')),
      token: await json(get(`/v1/token/${BONK}`)),
      chart: await json(get(`/v1/chart/${BONK}?r=1d`)),
      prices: await json(get(`/v1/prices?m=${BONK},${SOL}`)),
      portfolio: await json(get(`/v1/portfolio/${WALLET}`)),
      swap: await json(post('/v1/swap', { side: 'buy', mint: BONK, lamports: '100000000' })),
      ask: await json(post('/v1/ask', { q: 'Is Bonk safe to trade?', mint: BONK })),
      'swap-status': [{ st: 'waiting' }, { st: 'signing', w: WALLET }, { st: 'done', w: WALLET, sig: '5UfgJ5vVZxUxefDGqzqkVLHzHxVTyYH9StYyHKgvHYmXJgqJKxEqy7k4', ok: true }],
    };
    // The intent id is random: pin it so the file only changes when a shape does.
    const swap = fixtures.swap as { id: string; url: string };
    swap.url = swap.url.replace(swap.id, 'FixtureSwap1');
    swap.id = 'FixtureSwap1';
    writeFileSync(out!, `${JSON.stringify(fixtures, null, 2)}\n`);
  });
});
