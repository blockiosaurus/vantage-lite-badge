// The badge server hands an app at most about 3.5 KB of answer and cuts the
// rest, and half a JSON document is no use to it. Every badge-facing reply goes
// through `badgeJson`; lists go through `fitList` first, which drops entries
// from the end until the reply fits.

export const BADGE_REPLY_LIMIT = 3300;

export function fitList<T>(list: T[], wrap: (items: T[]) => unknown): unknown {
  let items = list.slice();
  let body = wrap(items);
  while (items.length > 0 && byteLength(JSON.stringify(body)) > BADGE_REPLY_LIMIT) {
    items = items.slice(0, -1);
    body = wrap(items);
  }
  return body;
}

export function badgeJson(body: unknown, init: ResponseInit = {}): Response {
  const text = JSON.stringify(body);
  if (byteLength(text) > BADGE_REPLY_LIMIT) {
    return Response.json({ error: 'reply too big for a badge' }, { status: 500 });
  }
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  return new Response(text, { ...init, headers });
}

export function badgeError(message: string, status = 400): Response {
  return badgeJson({ error: message.slice(0, 160) }, { status });
}

export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}
