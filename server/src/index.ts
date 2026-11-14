import { handle } from './app';
import type { Env } from './env';

export { DailyLimit } from './daily-limit';
export { SwapIntent } from './swap-intent';

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return handle(req, env);
  },
} satisfies ExportedHandler<Env>;
