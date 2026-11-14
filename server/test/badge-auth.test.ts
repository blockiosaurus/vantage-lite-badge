import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromBadge, resetBadgeAuth } from '../src/badge-auth';
import { testEnv } from './helpers';

let pair: CryptoKeyPair;

async function signed(url: string, body: string, over: Record<string, string> = {}) {
  const h: Record<string, string> = {
    'x-badge-app': 'vantage-lite',
    'x-badge-id': '7K2Q9M',
    'x-badge-user': 'user-1',
    'x-badge-time': String(Date.now()),
    'x-badge-request': crypto.randomUUID().replace(/-/g, '').slice(0, 16),
    'x-badge-key': 'k1',
    ...over,
  };
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const method = body ? 'POST' : 'GET';
  const msg = ['badge-http-v1', method, url, hash, 'vantage-lite', h['x-badge-id'], h['x-badge-user'], h['x-badge-time'], h['x-badge-request']].join('\n');
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(msg)));
  h['x-badge-signature'] = btoa(String.fromCharCode(...sig));
  return new Request(url, { method, headers: h, ...(body ? { body } : {}) });
}

beforeEach(async () => {
  resetBadgeAuth();
  pair = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  vi.stubGlobal('fetch', async () => Response.json({ id: 'k1', alg: 'Ed25519', key: btoa(String.fromCharCode(...raw)) }));
});
afterEach(() => vi.unstubAllGlobals());

describe('fromBadge', () => {
  it('accepts a request the badge server signed, once', async () => {
    const req = await signed('https://lite.test/v1/pulse', '');
    expect(await fromBadge(req, '', testEnv())).toEqual({ badge: '7K2Q9M', user: 'user-1' });
    expect(await fromBadge(req, '', testEnv())).toBeNull(); // a replay
  });

  it('covers the body', async () => {
    const req = await signed('https://lite.test/v1/swap', '{"side":"buy"}');
    expect(await fromBadge(req, '{"side":"sell"}', testEnv())).toBeNull();
  });

  it('refuses another app, a stale clock and an unknown key', async () => {
    expect(await fromBadge(await signed('https://lite.test/v1/pulse', '', { 'x-badge-app': 'snake' }), '', testEnv())).toBeNull();
    expect(await fromBadge(await signed('https://lite.test/v1/pulse', '', { 'x-badge-time': String(Date.now() - 120_000) }), '', testEnv())).toBeNull();
    expect(await fromBadge(await signed('https://lite.test/v1/pulse', '', { 'x-badge-key': 'k2' }), '', testEnv())).toBeNull();
  });
});
