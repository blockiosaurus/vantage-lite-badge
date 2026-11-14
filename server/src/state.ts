// Swap intents and daily limits over a KV store.
//
// Each intent's calls run one at a time (a per-id queue), so a wallet's build
// and the badge's poll never overwrite each other's writes. The queue is per
// process: run ONE replica on Railway.

import type { Env, SwapHandle } from './env';
import type { KV } from './kv';
import { SwapLogic, type Store } from './swap';

/** An intent's state is kept a day; nothing reads it after ten minutes. */
const INTENT_TTL = 24 * 3600;
const LIMIT_TTL = 26 * 3600;

export function namespaces(kv: KV, env: () => Env): Pick<Env, 'SWAPS' | 'LIMITS'> {
  const queues = new Map<string, Promise<unknown>>();

  function serial<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = queues.get(id) ?? Promise.resolve();
    const run = prev.then(fn);
    const tail = run.catch(() => undefined);
    queues.set(id, tail);
    void tail.then(() => {
      if (queues.get(id) === tail) queues.delete(id);
    });
    return run;
  }

  return {
    SWAPS: {
      getByName(id: string): SwapHandle {
        const store: Store = {
          get: async <T>(k: string) => {
            const v = await kv.get(`swap:${id}:${k}`);
            return v === null ? undefined : (JSON.parse(v) as T);
          },
          put: (k, v) => kv.set(`swap:${id}:${k}`, JSON.stringify(v), INTENT_TTL),
        };
        const logic = new SwapLogic(store, env());
        return {
          create: (input) => serial(id, () => logic.create(input)),
          label: () => logic.label(),
          buildFor: (account) => serial(id, () => logic.buildFor(account)),
          status: () => serial(id, () => logic.status()),
        };
      },
    },
    LIMITS: {
      getByName(name: string) {
        return { hit: async (max: number) => (await kv.incr(`limit:${name}`, LIMIT_TTL)) <= max };
      },
    },
  };
}
