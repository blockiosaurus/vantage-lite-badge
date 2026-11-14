// The Node entry point (Railway runs `npm start`): reads the environment,
// connects Redis, and serves the router in app.ts over node:http.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { handle } from './app';
import type { Env } from './env';
import { MemoryKV, redisKV, type KV } from './kv';
import { namespaces } from './state';

const MAX_BODY = 8 * 1024;

export function loadEnv(vars: NodeJS.ProcessEnv, kv: KV): Env {
  const origin =
    vars.PUBLIC_ORIGIN ?? (vars.RAILWAY_PUBLIC_DOMAIN ? `https://${vars.RAILWAY_PUBLIC_DOMAIN}` : undefined);
  if (!origin || !/^https:\/\/[^/]+$/.test(origin)) {
    throw new Error(
      'Set PUBLIC_ORIGIN to the server\'s public https origin (on Railway, generate a domain and it is set for you)',
    );
  }
  const env = {
    PUBLIC_ORIGIN: origin,
    BADGE_APP_ID: vars.BADGE_APP_ID ?? 'vantage-lite',
    REQUIRE_BADGE_SIGNATURE: vars.REQUIRE_BADGE_SIGNATURE ?? 'true',
    JUPITER_ORIGIN: vars.JUPITER_ORIGIN ?? 'https://lite-api.jup.ag',
    JUPITER_API_KEY: vars.JUPITER_API_KEY || undefined,
    SOLANA_RPC_URL: vars.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com',
    ANTHROPIC_API_KEY: vars.ANTHROPIC_API_KEY || undefined,
    BADGE_SERVER_ORIGIN: vars.BADGE_SERVER_ORIGIN || undefined,
  } as Env;
  Object.assign(env, namespaces(kv, () => env));
  return env;
}

/**
 * A node request as a fetch Request. The URL is built from PUBLIC_ORIGIN, not
 * from the proxy's view of it: the badge server signs the URL the badge asked
 * for (https://<public host>/...), and Railway's proxy hands us plain http.
 */
export async function toRequest(req: IncomingMessage, origin: string): Promise<Request> {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    for (const one of Array.isArray(v) ? v : [v]) headers.append(k, one);
  }
  const method = req.method ?? 'GET';
  let body: string | undefined; // every body this server takes is JSON text
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MAX_BODY) throw new RangeError('body too big');
      chunks.push(chunk as Buffer);
    }
    body = Buffer.concat(chunks).toString('utf8');
  }
  return new Request(`${origin}${req.url ?? '/'}`, { method, headers, body });
}

async function send(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await response.arrayBuffer()));
}

export function serve(env: Env, port: number): Server {
  const server = createServer(async (req, res) => {
    try {
      await send(res, await handle(await toRequest(req, env.PUBLIC_ORIGIN), env));
    } catch (e) {
      const tooBig = e instanceof RangeError;
      if (!tooBig) console.error('[serve]', e);
      res.statusCode = tooBig ? 413 : 500;
      res.end(tooBig ? 'request too big' : 'server error');
    }
  });
  return server.listen(port);
}

async function main() {
  const kv = process.env.REDIS_URL ? await redisKV(process.env.REDIS_URL) : new MemoryKV();
  if (!process.env.REDIS_URL) {
    console.warn('[state] REDIS_URL is not set: swaps live in memory and are lost on restart');
  }
  const env = loadEnv(process.env, kv);
  const port = Number(process.env.PORT ?? 8787);
  serve(env, port);
  console.log(`[vantage-lite] listening on :${port} as ${env.PUBLIC_ORIGIN}`);
  if (!env.ANTHROPIC_API_KEY) console.log('[vantage-lite] ANTHROPIC_API_KEY not set: Ask Vantage is off');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
