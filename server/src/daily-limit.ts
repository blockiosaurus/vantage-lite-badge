import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';

/** A counter for one (kind, caller, day). `hit` counts and says whether it was allowed. */
export class DailyLimit extends DurableObject<Env> {
  async hit(max: number): Promise<boolean> {
    const used = ((await this.ctx.storage.get<number>('n')) ?? 0) + 1;
    if (used > max) return false;
    await this.ctx.storage.put('n', used);
    if (used === 1) await this.ctx.storage.setAlarm(Date.now() + 26 * 3_600_000);
    return true;
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}
