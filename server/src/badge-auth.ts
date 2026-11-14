// Every `http` request a badge app makes reaches us through the Solana OS badge
// server, which signs who is calling (docs/LUA_API.md, "What your server
// receives"). We check that signature on every /v1 route so that only our app
// on a real badge can spend our upstream quota, open swaps, or ask Claude.
//
// Replays are remembered per isolate for a minute. That is enough for what the
// signature guards here: data reads are harmless to replay, and swap intents
// and Ask answers are bounded by the per-badge daily limits on top.

import type { Env } from './env';

export interface BadgeCaller {
  badge: string;
  user: string;
}

const DEFAULT_BADGE_SERVER = 'https://badge-api.solana.com';
const keys = new Map<string, CryptoKey>();
const seen = new Map<string, number>();
let fetching: Promise<void> | null = null;
let fetchedAt = 0;

async function badgeKey(env: Env, id: string): Promise<CryptoKey | null> {
  if (!keys.has(id) && !fetching && Date.now() - fetchedAt > 60_000) {
    fetchedAt = Date.now();
    const origin = env.BADGE_SERVER_ORIGIN ?? DEFAULT_BADGE_SERVER;
    fetching = (async () => {
      const k = (await (await fetch(`${origin}/api/http/key`)).json()) as {
        id: string;
        key: string;
      };
      const raw = Uint8Array.from(atob(k.key), (c) => c.charCodeAt(0));
      keys.set(k.id, await crypto.subtle.importKey('raw', raw, 'Ed25519', false, ['verify']));
    })()
      .catch(() => {
        fetchedAt = 0;
      })
      .finally(() => {
        fetching = null;
      });
  }
  if (!keys.has(id) && fetching) await fetching;
  return keys.get(id) ?? null;
}

/** True the first time `id` comes, false again until a minute after `time`. */
function once(id: string, time: number): boolean {
  const now = Date.now();
  for (const [k, t] of seen) if (now - t > 60_000) seen.delete(k);
  if (seen.has(id)) return false;
  seen.set(id, time);
  return true;
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The badge and player behind a request from our app, or null.
 * `body` is the raw body as received ("" for none).
 */
export async function fromBadge(req: Request, body: string, env: Env): Promise<BadgeCaller | null> {
  const h = (n: string) => req.headers.get(n) ?? '';
  const app = env.BADGE_APP_ID;
  const time = Number(h('x-badge-time'));
  const id = h('x-badge-request');
  if (h('x-badge-app') !== app || !(Math.abs(Date.now() - time) < 60_000) || !id) return null;
  const key = await badgeKey(env, h('x-badge-key'));
  if (!key) return null;
  const hash = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)));
  const signed = [
    'badge-http-v1',
    req.method,
    req.url.split('#')[0],
    hash,
    app,
    h('x-badge-id'),
    h('x-badge-user'),
    h('x-badge-time'),
    id,
  ].join('\n');
  let sig: Uint8Array<ArrayBuffer>;
  try {
    sig = Uint8Array.from(atob(h('x-badge-signature')), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  if (!(await crypto.subtle.verify('Ed25519', key, sig, new TextEncoder().encode(signed)))) {
    return null;
  }
  if (!once(id, time)) return null;
  return { badge: h('x-badge-id'), user: h('x-badge-user') };
}

/**
 * The caller of a /v1 route. With REQUIRE_BADGE_SIGNATURE=false (local
 * development only) an unsigned request is let through as a "dev" badge.
 */
export async function caller(req: Request, body: string, env: Env): Promise<BadgeCaller | null> {
  if (env.REQUIRE_BADGE_SIGNATURE === 'false' && !req.headers.has('x-badge-signature')) {
    return { badge: req.headers.get('x-badge-id') ?? 'dev', user: 'dev' };
  }
  return fromBadge(req, body, env);
}

// For tests: forget cached keys and seen requests.
export function resetBadgeAuth(): void {
  keys.clear();
  seen.clear();
  fetching = null;
  fetchedAt = 0;
}
