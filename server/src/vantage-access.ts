// Vantage access for badge owners. The badge asks this server (a request the
// badge server signed, so we know it is a real badge and which owner holds
// it); we answer a link to Vantage's /badge page carrying a ticket signed with
// our key. Vantage checks the ticket with our public key and grants the
// signed-in account access, one account per badge owner
// (metaplex-global/genesis-app, apps/terminal/lib/badge-access/ticket.ts).
//
// The ticket rides in a QR code, so it is binary and small: 85 bytes,
// base64url without padding (114 characters).
//
//   byte 0       version, 1
//   bytes 1..16  owner: the first 16 bytes of SHA-256(badge server user id)
//   bytes 17..20 expiry, unix seconds, big-endian u32
//   bytes 21..84 Ed25519 signature over DOMAIN || bytes 0..20

export const TICKET_VERSION = 1;
export const TICKET_TTL_SECONDS = 600;
export const DOMAIN = new TextEncoder().encode('vantage-badge-access-v1');

let cached: { raw: string; key: Promise<CryptoKey | null> } | null = null;

/** The signing key from VANTAGE_ACCESS_SIGNING_KEY (PKCS#8, base64), or null. */
export function signingKey(raw: string | undefined): Promise<CryptoKey | null> {
  if (!raw) return Promise.resolve(null);
  if (cached?.raw === raw) return cached.key;
  const key = crypto.subtle
    .importKey('pkcs8', Buffer.from(raw, 'base64'), 'Ed25519', false, ['sign'])
    .catch(() => null);
  cached = { raw, key };
  return key;
}

export async function mintTicket(
  key: CryptoKey,
  badgeUser: string,
  now: number = Math.floor(Date.now() / 1000),
): Promise<{ ticket: string; expiresAt: number }> {
  const expiresAt = now + TICKET_TTL_SECONDS;
  const payload = new Uint8Array(21);
  payload[0] = TICKET_VERSION;
  const owner = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(badgeUser)));
  payload.set(owner.subarray(0, 16), 1);
  new DataView(payload.buffer).setUint32(17, expiresAt);
  const message = new Uint8Array(DOMAIN.length + payload.length);
  message.set(DOMAIN);
  message.set(payload, DOMAIN.length);
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', key, message));
  const ticket = new Uint8Array(85);
  ticket.set(payload);
  ticket.set(signature, 21);
  return { ticket: Buffer.from(ticket).toString('base64url'), expiresAt };
}
