import { createHash } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { handle } from '../src/app';
import { DOMAIN, TICKET_TTL_SECONDS, mintTicket, signingKey } from '../src/vantage-access';
import { installWorld, post, testEnv } from './helpers';

let pair: CryptoKeyPair;
let pkcs8: string;
let publicKey: CryptoKey;

beforeAll(async () => {
  pair = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair;
  pkcs8 = Buffer.from((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer).toString('base64');
  publicKey = pair.publicKey;
});
afterEach(() => vi.unstubAllGlobals());

/**
 * Vantage's check, written out independently of mintTicket (the real one is
 * apps/terminal/lib/badge-access/ticket.ts in genesis-app): if either side's
 * layout drifts, this test fails.
 */
async function vantageVerify(ticket: string, now: number) {
  const bytes = Buffer.from(ticket, 'base64url');
  if (bytes.length !== 85 || bytes[0] !== 1) return null;
  const message = Buffer.concat([Buffer.from(DOMAIN), bytes.subarray(0, 21)]);
  const ok = await crypto.subtle.verify('Ed25519', publicKey, bytes.subarray(21), message);
  const exp = bytes.readUInt32BE(17);
  if (!ok || now > exp + 60) return null;
  return { owner: bytes.subarray(1, 17).toString('hex'), exp };
}

describe('mintTicket', () => {
  it('mints the 85-byte ticket Vantage verifies, keyed by a hash of the badge owner', async () => {
    const key = (await signingKey(pkcs8))!;
    const { ticket, expiresAt } = await mintTicket(key, 'owner-uuid', 1_790_000_000);
    expect(ticket).toMatch(/^[A-Za-z0-9_-]{114}$/);
    expect(expiresAt).toBe(1_790_000_000 + TICKET_TTL_SECONDS);
    expect(await vantageVerify(ticket, 1_790_000_000)).toEqual({
      owner: createHash('sha256').update('owner-uuid').digest('hex').slice(0, 32),
      exp: expiresAt,
    });
    expect(await vantageVerify(ticket, expiresAt + 61)).toBeNull();
  });

  it('reads the signing key from base64 PKCS#8, and refuses anything else', async () => {
    expect(await signingKey(undefined)).toBeNull();
    expect(await signingKey('AAAA')).toBeNull();
    expect(await signingKey(pkcs8)).not.toBeNull();
  });
});

describe('POST /v1/vantage-access', () => {
  it('answers a Vantage /badge link for the badge owner', async () => {
    installWorld();
    const env = testEnv({ VANTAGE_ACCESS_SIGNING_KEY: pkcs8 });
    const res = await handle(post('/v1/vantage-access', {}, { 'x-badge-id': 'B1' }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; exp: number };
    const ticket = body.url.match(/^https:\/\/vantage\.test\/badge#t=([A-Za-z0-9_-]{114})$/)?.[1];
    expect(ticket).toBeDefined();
    expect(body.url.length).toBeLessThanOrEqual(256); // fits a badge QR code
    expect((await vantageVerify(ticket!, Math.floor(Date.now() / 1000)))?.owner).toBe(
      createHash('sha256').update('dev').digest('hex').slice(0, 32),
    );
  });

  it('is off without a signing key', async () => {
    const res = await handle(post('/v1/vantage-access', {}), testEnv());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Get Vantage is off on this server' });
  });

  it('caps links per badge per day', async () => {
    installWorld();
    const env = testEnv({ VANTAGE_ACCESS_SIGNING_KEY: pkcs8 });
    for (let i = 0; i < 20; i++) await handle(post('/v1/vantage-access', {}, { 'x-badge-id': 'B2' }), env);
    const res = await handle(post('/v1/vantage-access', {}, { 'x-badge-id': 'B2' }), env);
    expect(res.status).toBe(429);
  });
});
