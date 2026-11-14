// The router. Kept apart from index.ts (which also exports the Durable Object
// classes, and so imports `cloudflare:workers`) so tests can drive it in Node.
//
//   badge (signed, ~3.5 KB replies)          wallet (Solana Pay)
//   GET  /v1/pulse                           GET  /pay/:id   label + icon
//   GET  /v1/list/:name   hot|volume|organic|new
//   GET  /v1/search?q=                       POST /pay/:id   {account} -> transaction
//   GET  /v1/token/:mint
//   GET  /v1/chart/:mint?r=1h|1d|1w
//   GET  /v1/prices?m=a,b,c
//   GET  /v1/portfolio/:wallet
//   POST /v1/swap          -> {id, url, out, impact, route}
//   GET  /v1/swap/:id      -> {st, ...}
//   POST /v1/ask           {q, mint?} -> {a}

import { ask } from './ask';
import { caller } from './badge-auth';
import { isAddress } from './base58';
import type { Env } from './env';
import { badgeError, badgeJson, fitList } from './fit';
import { allow } from './limits';
import { chart, list, LISTS, portfolio, pulse, search, token, watchPrices, type ListName } from './market';
import type { ChartRange } from './sources/gecko';
import { tokenInfo } from './sources/jupiter';
import { isIntentId, newIntentId, preview, validateIntent } from './swap';
import { UpstreamError } from './upstream';
import { ICON_PNG_BASE64 } from './icon';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, accept',
};

export async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  try {
    if (path === '/healthz') return new Response('ok');
    if (path === '/icon.png') {
      return new Response(Uint8Array.from(atob(ICON_PNG_BASE64), (c) => c.charCodeAt(0)), {
        headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' },
      });
    }
    if (path.startsWith('/pay/')) return await solanaPay(req, env, path.slice(5));
    if (path.startsWith('/v1/')) return await badgeRoute(req, env, url, path.slice(4));
    return new Response('not found', { status: 404 });
  } catch (e) {
    if (e instanceof UpstreamError) {
      console.warn(`[upstream] ${e.source} ${e.status}: ${e.message}`);
      return badgeError(e.status === 429 ? 'busy, try again soon' : `${e.source} is unavailable`, 502);
    }
    console.error('[handle]', e);
    return badgeError('server error', 500);
  }
}

async function badgeRoute(req: Request, env: Env, url: URL, route: string): Promise<Response> {
  const body = req.method === 'POST' ? await req.text() : '';
  if (body.length > 2048) return badgeError('request too big', 413);
  const who = await caller(req, body, env);
  if (!who) return badgeError('badge signature required', 401);
  const parts = route.split('/');

  if (req.method === 'GET') {
    switch (parts[0]) {
      case 'pulse':
        return badgeJson(await pulse(env));
      case 'list': {
        const name = parts[1] as ListName;
        if (!(name in LISTS)) return badgeError('unknown list');
        const res = await list(env, name, 10);
        return badgeJson(fitList(res.items, (items) => ({ ...res, items })));
      }
      case 'search': {
        const q = (url.searchParams.get('q') ?? '').trim().slice(0, 44);
        if (q.length < 2) return badgeError('search needs 2+ characters');
        const res = await search(env, q);
        return badgeJson(fitList(res.items, (items) => ({ items })));
      }
      case 'token': {
        const mint = parts[1];
        if (!isAddress(mint)) return badgeError('bad mint');
        const t = await token(env, mint);
        return t ? badgeJson(t) : badgeError('token not found', 404);
      }
      case 'chart': {
        const mint = parts[1];
        if (!isAddress(mint)) return badgeError('bad mint');
        const r = (url.searchParams.get('r') ?? '1d') as ChartRange;
        if (!['1h', '1d', '1w'].includes(r)) return badgeError('r must be 1h, 1d or 1w');
        return badgeJson(await chart(mint, r));
      }
      case 'prices': {
        const mints = (url.searchParams.get('m') ?? '').split(',').filter(Boolean);
        if (mints.length === 0 || mints.length > 8 || !mints.every(isAddress)) {
          return badgeError('m: 1 to 8 mints');
        }
        const res = await watchPrices(env, mints);
        return badgeJson(fitList(res.items, (items) => ({ items })));
      }
      case 'portfolio': {
        const wallet = parts[1];
        if (!isAddress(wallet)) return badgeError('bad wallet');
        const res = await portfolio(env, wallet);
        return badgeJson(fitList(res.items, (items) => ({ ...res, items })));
      }
      case 'swap': {
        const id = parts[1] ?? '';
        if (!isIntentId(id)) return badgeError('bad swap id');
        const st = await env.SWAPS.getByName(id).status();
        return st ? badgeJson(st) : badgeError('no such swap', 404);
      }
    }
  }

  if (req.method === 'POST') {
    let json: unknown;
    try {
      json = JSON.parse(body || '{}');
    } catch {
      return badgeError('body must be JSON');
    }
    if (route === 'swap') {
      const v = validateIntent(json);
      if (typeof v === 'string') return badgeError(v);
      if (!(await allow(env, 'swap', who.badge))) return badgeError('daily swap limit reached', 429);
      const info = await tokenInfo(env, v.mint);
      if (!info) return badgeError('token not found', 404);
      const intent = {
        ...v,
        id: newIntentId(),
        badge: who.badge,
        symbol: info.symbol.replace(/[^\x20-\x7e]/g, '').slice(0, 10) || 'token',
        decimals: info.decimals,
      };
      const look = await preview(env, intent);
      await env.SWAPS.getByName(intent.id).create(intent);
      return badgeJson({
        id: intent.id,
        url: `solana:${env.PUBLIC_ORIGIN}/pay/${intent.id}`,
        ...look,
      });
    }
    if (route === 'ask') {
      if (!env.ANTHROPIC_API_KEY) return badgeError('Ask Vantage is off on this server', 404);
      const { q, mint } = (json ?? {}) as { q?: unknown; mint?: unknown };
      if (typeof q !== 'string' || q.trim().length < 3) return badgeError('ask a question');
      if (mint !== undefined && mint !== null && !isAddress(mint)) return badgeError('bad mint');
      if (!(await allow(env, 'ask', who.user === 'dev' ? who.badge : who.user))) {
        return badgeError('daily question limit reached', 429);
      }
      const a = await ask(env, q.trim().slice(0, 200), typeof mint === 'string' ? mint : null);
      return badgeJson({ a });
    }
  }

  return badgeError('not found', 404);
}

async function solanaPay(req: Request, env: Env, id: string): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (!isIntentId(id)) return Response.json({ error: 'not found' }, { status: 404, headers: CORS });
  const stub = env.SWAPS.getByName(id);
  if (req.method === 'GET') {
    const label = await stub.label();
    return label
      ? Response.json(label, { headers: CORS })
      : Response.json({ error: 'expired' }, { status: 404, headers: CORS });
  }
  if (req.method === 'POST') {
    let account: unknown;
    try {
      account = ((await req.json()) as { account?: unknown }).account;
    } catch {
      account = undefined;
    }
    if (!isAddress(account)) {
      return Response.json({ error: 'account required' }, { status: 400, headers: CORS });
    }
    const res = await stub.buildFor(account);
    if ('error' in res) {
      return Response.json({ error: res.error, message: res.error }, { status: res.status, headers: CORS });
    }
    return Response.json(res, { headers: CORS });
  }
  return new Response('method not allowed', { status: 405, headers: CORS });
}
