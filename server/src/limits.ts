// Per-badge daily caps, so one badge (or a script with its app id) can't run up
// our Claude bill or flood the swap API with builds. Counted in the KV
// store, one counter per (kind, caller, UTC day) (see state.ts).

import type { Env } from './env';

export const DAILY = {
  ask: 25,
  swap: 60,
  access: 20,
} as const;

export async function allow(env: Env, kind: keyof typeof DAILY, who: string): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const stub = env.LIMITS.getByName(`${kind}:${who}:${day}`);
  return stub.hit(DAILY[kind]);
}
