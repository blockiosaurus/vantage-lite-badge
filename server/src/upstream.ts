// One fetch helper for every upstream: a timeout, a JSON parse, a typed error,
// and for GETs that many badges ask at once (trending, pulse, charts), the
// Cloudflare cache, so a room full of badges costs one upstream read per TTL.

export class UpstreamError extends Error {
  constructor(
    readonly source: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface FetchJsonOptions {
  source: string;
  /** Seconds to keep a GET in the colo cache. 0 or absent: no cache. */
  ttl?: number;
  timeoutMs?: number;
  init?: RequestInit;
}

function colo(): Cache | null {
  const c = (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches;
  return c?.default ?? null;
}

export async function fetchJson<T>(url: string, opts: FetchJsonOptions): Promise<T> {
  const method = (opts.init?.method ?? 'GET').toUpperCase();
  const cache = method === 'GET' && opts.ttl ? colo() : null;
  const key = cache ? new Request(url, { method: 'GET' }) : null;
  if (cache && key) {
    const hit = await cache.match(key);
    if (hit) return (await hit.json()) as T;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...opts.init,
      headers: { accept: 'application/json', ...(opts.init?.headers ?? {}) },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
    });
  } catch (e) {
    throw new UpstreamError(opts.source, 0, e instanceof Error ? e.message : 'unreachable');
  }
  const text = await res.text();
  if (!res.ok) {
    let message = `${opts.source} ${res.status}`;
    try {
      const j = JSON.parse(text) as { error?: unknown; message?: unknown };
      const m = j.error ?? j.message;
      if (typeof m === 'string') message = m;
    } catch {
      // not JSON: keep the status
    }
    throw new UpstreamError(opts.source, res.status, message);
  }
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new UpstreamError(opts.source, 502, `${opts.source} answered something that isn't JSON`);
  }
  if (cache && key) {
    await cache.put(
      key,
      new Response(text, {
        headers: { 'content-type': 'application/json', 'cache-control': `max-age=${opts.ttl}` },
      }),
    );
  }
  return data;
}
