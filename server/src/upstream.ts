// One fetch helper for every upstream: a timeout, a JSON parse, a typed error,
// and an in-process cache for the GETs many badges ask at once.

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
  /** Seconds to keep a GET cached. 0 or absent: no cache. */
  ttl?: number;
  timeoutMs?: number;
  init?: RequestInit;
}

// A small in-process cache for GETs that every badge asks (trending, pulse,
// charts), so a room full of badges costs one upstream read per TTL.
const CACHE_MAX = 500;
const cache = new Map<string, { text: string; expires: number }>();

function cached(url: string): string | null {
  const e = cache.get(url);
  if (!e) return null;
  if (e.expires <= Date.now()) {
    cache.delete(url);
    return null;
  }
  return e.text;
}

function remember(url: string, text: string, ttl: number) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(url, { text, expires: Date.now() + ttl * 1000 });
}

/** For tests. */
export function clearUpstreamCache(): void {
  cache.clear();
}

export async function fetchJson<T>(url: string, opts: FetchJsonOptions): Promise<T> {
  const method = (opts.init?.method ?? 'GET').toUpperCase();
  const cacheable = method === 'GET' && !!opts.ttl;
  if (cacheable) {
    const hit = cached(url);
    if (hit !== null) return JSON.parse(hit) as T;
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
  if (cacheable) remember(url, text, opts.ttl!);
  return data;
}
