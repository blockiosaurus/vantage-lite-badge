// Ask Vantage: an assistant in the spirit of the terminal's, on a badge. The badge sends a
// question (and the token on screen, if any); we hand Claude a snapshot of the
// market and that token, and send back a short plain-text answer that fits on
// a 320x218 screen. Read-only: it can't trade, the badge's Buy/Sell can.

import Anthropic from '@anthropic-ai/sdk';
import type { Env } from './env';
import { list, pulse, token } from './market';

export const ASK_MODEL = 'claude-opus-5-5';
export const MAX_ANSWER_CHARS = 600;

const SYSTEM = `You are the assistant in Vantage Lite, an unofficial badge app inspired by the Vantage trading terminal, running on a Solana conference badge with a 320x218 screen. You are not affiliated with Vantage or Metaplex.
Answer the player's question about Solana tokens and the market using the snapshot you are given.
Rules:
- Plain text only: no markdown, no bullet symbols, no emoji. ASCII characters only.
- At most 450 characters. Two or three short sentences, most useful fact first.
- Use the numbers in the snapshot and say when the snapshot lacks what was asked.
- Point out risk flags plainly (live mint or freeze authority, concentrated holders, thin liquidity).
- You can't trade or see the player's wallet. Don't tell anyone to buy or sell; describe, don't advise.`;

export async function snapshot(env: Env, mint: string | null): Promise<string> {
  const [p, hot, t] = await Promise.all([
    pulse(env).catch(() => null),
    list(env, 'hot', 8).catch(() => null),
    mint ? token(env, mint).catch(() => null) : Promise.resolve(null),
  ]);
  return JSON.stringify({ market: p, trending1h: hot?.items, token: t });
}

/** Squeeze an answer onto the badge: ASCII, one paragraph, bounded. */
export function badgeText(s: string): string {
  const flat = s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[*_`#>]/g, '')
    .replace(/[^\x20-\x7e\n]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (flat.length <= MAX_ANSWER_CHARS) return flat;
  const cut = flat.slice(0, MAX_ANSWER_CHARS - 3);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : cut.length)}...`;
}

export async function ask(
  env: Env,
  question: string,
  mint: string | null,
  client: Anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }),
): Promise<string> {
  const context = await snapshot(env, mint);
  const response = await client.beta.messages.create({
    model: ASK_MODEL,
    max_tokens: 4000,
    output_config: { effort: 'low' },
    // On a refusal, let the API re-run the request on a fallback model it picks.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Snapshot (JSON, fetched just now):\n${context}\n\nQuestion: ${question}`,
      },
    ],
  });
  if (response.stop_reason === 'refusal') {
    return "I can't help with that one. Try asking about a token's numbers or the market.";
  }
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join(' ');
  return badgeText(text) || 'No answer this time. Try again.';
}
