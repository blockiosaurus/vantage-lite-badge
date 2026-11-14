import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { SwapLogic, type IntentInput } from './swap';

/** One per swap intent: its state, its Solana Pay build, its landing check. */
export class SwapIntent extends DurableObject<Env> {
  private readonly logic: SwapLogic;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.logic = new SwapLogic(
      {
        get: (k) => ctx.storage.get(k),
        put: (k, v) => ctx.storage.put(k, v),
      },
      env,
    );
  }

  async create(input: IntentInput) {
    await this.logic.create(input);
    // Nothing reads an intent after a day: let storage go.
    await this.ctx.storage.setAlarm(Date.now() + 24 * 3_600_000);
  }

  label() {
    return this.logic.label();
  }

  buildFor(account: string) {
    return this.logic.buildFor(account);
  }

  status() {
    return this.logic.status();
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}
