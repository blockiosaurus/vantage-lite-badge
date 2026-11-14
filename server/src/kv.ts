// The server's only state: swap intents and daily counters, in Redis (Railway's
// Redis service, REDIS_URL) or, without one, in memory for local development.
// In memory, every pending swap is lost when the process restarts.

export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Add one and return the new count; the key expires `ttlSeconds` after its first hit. */
  incr(key: string, ttlSeconds: number): Promise<number>;
}

export class MemoryKV implements KV {
  private readonly data = new Map<string, { value: string; expires: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  private live(key: string) {
    const e = this.data.get(key);
    if (e && e.expires <= this.now()) {
      this.data.delete(key);
      return undefined;
    }
    return e;
  }

  async get(key: string) {
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number) {
    this.data.set(key, { value, expires: this.now() + ttlSeconds * 1000 });
  }

  async incr(key: string, ttlSeconds: number) {
    const e = this.live(key);
    const n = Number(e?.value ?? 0) + 1;
    this.data.set(key, { value: String(n), expires: e?.expires ?? this.now() + ttlSeconds * 1000 });
    return n;
  }
}

export async function redisKV(url: string): Promise<KV> {
  const { Redis } = await import('ioredis');
  const redis = new Redis(url, { maxRetriesPerRequest: 2, family: 0 });
  redis.on('error', (e: Error) => console.error('[redis]', e.message));
  return {
    get: (key) => redis.get(key),
    set: async (key, value, ttl) => {
      await redis.set(key, value, 'EX', ttl);
    },
    incr: async (key, ttl) => {
      const [[, n]] = (await redis.multi().incr(key).expire(key, ttl, 'NX').exec()) as [[null, number]];
      return n;
    },
  };
}
