// The badge's market reads. Each turns an upstream answer into the smallest
// shape the screen needs, with display strings already formatted (see
// format.ts) and short keys, because every reply has to fit in ~3.5 KB.

import { SOL_MINT, type Env } from './env';
import { compact, f32, pct, price, units, usd } from './format';
import { closes, type ChartRange } from './sources/gecko';
import { fearGreed } from './sources/fear-greed';
import {
  holdings,
  listTokens,
  prices,
  recentTokens,
  searchTokens,
  tokenInfo,
  type JupToken,
} from './sources/jupiter';

/** One row of a token list. */
export interface TokenRow {
  m: string; // mint
  s: string; // symbol
  p: string; // price
  c: string; // 24h change, formatted
  cn: number | null; // 24h change, a number for colour and LEDs
  mc: string; // market cap
  v: string; // 24h volume
}

export function row(t: JupToken, change: 'stats1h' | 'stats24h' = 'stats24h'): TokenRow {
  const ch = t[change]?.priceChange;
  return {
    m: t.id,
    s: clip(t.symbol, 10),
    p: price(t.usdPrice),
    c: pct(ch),
    cn: f32(ch, 3),
    mc: usd(t.mcap),
    v: usd(volume(t.stats24h)),
  };
}

export const LISTS = {
  hot: { title: 'Trending 1h', change: 'stats1h' as const },
  volume: { title: 'Top volume 24h', change: 'stats24h' as const },
  organic: { title: 'Organic 24h', change: 'stats24h' as const },
  new: { title: 'New pairs', change: 'stats1h' as const },
};
export type ListName = keyof typeof LISTS;

export async function list(env: Env, name: ListName, limit = 10): Promise<{ t: string; items: TokenRow[] }> {
  const tokens =
    name === 'hot'
      ? await listTokens(env, 'toptrending', '1h', limit)
      : name === 'volume'
        ? await listTokens(env, 'toptraded', '24h', limit)
        : name === 'organic'
          ? await listTokens(env, 'toporganicscore', '24h', limit)
          : await recentTokens(env, limit);
  return { t: LISTS[name].title, items: tokens.slice(0, limit).map((t) => row(t, LISTS[name].change)) };
}

export async function search(env: Env, query: string): Promise<{ items: TokenRow[] }> {
  const hits = await searchTokens(env, query);
  return { items: hits.slice(0, 6).map((t) => row(t)) };
}

export type Risk = 'low' | 'medium' | 'high';

export interface TokenDetail {
  m: string;
  s: string;
  n: string;
  p: string;
  pn: number | null;
  ch: { '5m': string; '1h': string; '6h': string; '24h': string };
  cn: number | null;
  mc: string;
  fdv: string;
  liq: string;
  vol: string;
  hold: string;
  buys: string;
  sells: string;
  org: number | null;
  orgl: string;
  ver: boolean;
  lp: string;
  age: string;
  safe: {
    mint: boolean;
    freeze: boolean;
    top10: string;
    dev: string;
    risk: Risk;
    why: string[];
  };
  url: string;
}

export function riskOf(t: JupToken): { risk: Risk; why: string[] } {
  const a = t.audit ?? {};
  const why: string[] = [];
  let risk: Risk = 'low';
  const raise = (to: Risk, reason: string) => {
    why.push(reason);
    if (to === 'high' || (to === 'medium' && risk === 'low')) risk = to;
  };
  if (a.mintAuthorityDisabled === false) raise('high', 'Mint authority is live');
  if (a.freezeAuthorityDisabled === false) raise('high', 'Freeze authority is live');
  const top = a.topHoldersPercentage;
  if (top !== undefined && top > 50) raise('high', `Top 10 hold ${top.toFixed(0)}%`);
  else if (top !== undefined && top > 30) raise('medium', `Top 10 hold ${top.toFixed(0)}%`);
  if ((t.liquidity ?? 0) < 50_000) raise('medium', `Thin liquidity ${usd(t.liquidity ?? 0)}`);
  if (t.organicScore !== undefined && t.organicScore < 30) raise('medium', 'Low organic activity');
  if (a.devBalancePercentage !== undefined && a.devBalancePercentage > 10) {
    raise('medium', `Dev holds ${a.devBalancePercentage.toFixed(0)}%`);
  }
  return { risk, why: why.slice(0, 3) };
}

export function detail(t: JupToken): TokenDetail {
  const s24 = t.stats24h ?? {};
  const { risk, why } = riskOf(t);
  return {
    m: t.id,
    s: clip(t.symbol, 10),
    n: clip(t.name, 24),
    p: price(t.usdPrice),
    pn: f32(t.usdPrice, 6),
    ch: {
      '5m': pct(t.stats5m?.priceChange),
      '1h': pct(t.stats1h?.priceChange),
      '6h': pct(t.stats6h?.priceChange),
      '24h': pct(s24.priceChange),
    },
    cn: f32(s24.priceChange, 3),
    mc: usd(t.mcap),
    fdv: usd(t.fdv),
    liq: usd(t.liquidity),
    vol: usd(volume(s24)),
    hold: compact(t.holderCount),
    buys: compact(s24.numBuys),
    sells: compact(s24.numSells),
    org: t.organicScore === undefined ? null : Math.round(t.organicScore),
    orgl: t.organicScoreLabel ?? '',
    ver: t.isVerified === true,
    lp: clip(t.launchpad ?? '', 16),
    age: age(t.firstPool?.createdAt),
    safe: {
      mint: t.audit?.mintAuthorityDisabled !== false,
      freeze: t.audit?.freezeAuthorityDisabled !== false,
      top10: t.audit?.topHoldersPercentage === undefined ? '-' : `${t.audit.topHoldersPercentage.toFixed(1)}%`,
      dev: t.audit?.devBalancePercentage === undefined ? '-' : `${t.audit.devBalancePercentage.toFixed(1)}%`,
      risk,
      why,
    },
    url: `https://vantage.metaplex.com/token/solana/${t.id}`,
  };
}

export async function token(env: Env, mint: string): Promise<TokenDetail | null> {
  const t = await tokenInfo(env, mint);
  return t ? detail(t) : null;
}

/** Closing prices squeezed to at most `n` points of 0..100, for a canvas. */
export function shape(series: number[], n = 60): number[] {
  if (series.length === 0) return [];
  const step = series.length / Math.min(n, series.length);
  const picked: number[] = [];
  for (let i = 0; i < Math.min(n, series.length); i++) {
    picked.push(series[Math.min(series.length - 1, Math.floor(i * step))]!);
  }
  picked[picked.length - 1] = series[series.length - 1]!;
  const lo = Math.min(...picked);
  const hi = Math.max(...picked);
  const span = hi - lo || 1;
  return picked.map((v) => Math.round(((v - lo) / span) * 100));
}

export async function chart(mint: string, range: ChartRange) {
  const series = await closes(mint, range);
  if (series.length < 2) return { r: range, pts: [] as number[] };
  const first = series[0]!;
  const last = series[series.length - 1]!;
  return {
    r: range,
    pts: shape(series),
    lo: price(Math.min(...series)),
    hi: price(Math.max(...series)),
    up: last >= first,
    chg: pct(((last - first) / first) * 100),
  };
}

/** Watchlist prices: the badge keeps the symbols, so this is numbers only. */
export async function watchPrices(env: Env, mints: string[]) {
  const res = await prices(env, mints);
  return {
    items: mints.map((m) => {
      const p = res[m];
      return {
        m,
        p: price(p?.usdPrice),
        pn: f32(p?.usdPrice, 6),
        c: pct(p?.priceChange24h),
        cn: f32(p?.priceChange24h, 3),
      };
    }),
  };
}

export async function pulse(env: Env) {
  const [sol, fng, hot] = await Promise.all([
    prices(env, [SOL_MINT]).then((r) => r[SOL_MINT] ?? null),
    fearGreed().catch(() => null),
    listTokens(env, 'toptrending', '1h', 10).catch(() => [] as JupToken[]),
  ]);
  const top = hot
    .filter((t) => t.stats1h?.priceChange !== undefined)
    .sort((a, b) => (b.stats1h!.priceChange ?? 0) - (a.stats1h!.priceChange ?? 0))[0];
  const solChange = sol?.priceChange24h;
  // One number for the LEDs: the index when it answers, else SOL's day.
  const mood = fng
    ? fng.value
    : Math.max(0, Math.min(100, Math.round(50 + (solChange ?? 0) * 5)));
  return {
    sol: { p: price(sol?.usdPrice), c: pct(solChange), cn: f32(solChange, 3) },
    fng: fng ? { v: fng.value, l: fng.label } : null,
    top: top ? { m: top.id, s: clip(top.symbol, 10), c: pct(top.stats1h?.priceChange) } : null,
    mood,
  };
}

export interface Holding {
  m: string;
  s: string;
  a: string; // amount held
  v: string; // value
  cn: number | null;
}

export async function portfolio(env: Env, wallet: string) {
  const h = await holdings(env, wallet);
  const amounts = new Map<string, { raw: bigint; decimals: number }>();
  amounts.set(SOL_MINT, { raw: BigInt(h.amount || '0'), decimals: 9 });
  for (const [mint, accounts] of Object.entries(h.tokens ?? {})) {
    for (const acc of accounts) {
      if (!/^\d+$/.test(acc.amount)) continue;
      const cur = amounts.get(mint);
      // Wrapped SOL counts with native SOL.
      amounts.set(mint, { raw: (cur?.raw ?? 0n) + BigInt(acc.amount), decimals: acc.decimals });
    }
  }
  const held = [...amounts.entries()].filter(([, a]) => a.raw > 0n);
  const info = new Map<string, JupToken>();
  // Jupiter search takes up to 100 comma-separated mints in one call.
  for (let i = 0; i < held.length && i < 100; i += 100) {
    const batch = held.slice(i, i + 100).map(([m]) => m);
    for (const t of await searchTokens(env, batch.join(','))) info.set(t.id, t);
  }
  let total = 0;
  const rows: (Holding & { value: number })[] = [];
  for (const [mint, a] of held) {
    const t = info.get(mint);
    const ui = Number(units(a.raw, a.decimals));
    const value = ui * (t?.usdPrice ?? 0);
    total += value;
    if (value < 0.01 && mint !== SOL_MINT) continue;
    rows.push({
      m: mint,
      s: mint === SOL_MINT ? 'SOL' : clip(t?.symbol ?? `${mint.slice(0, 4)}..`, 10),
      a: ui >= 1000 ? compact(ui) : String(Number(ui.toPrecision(4))),
      v: usd(value),
      cn: f32(t?.stats24h?.priceChange, 3),
      value,
    });
  }
  rows.sort((x, y) => y.value - x.value);
  const sol = amounts.get(SOL_MINT);
  return {
    w: `${wallet.slice(0, 4)}..${wallet.slice(-4)}`,
    total: usd(total),
    sol: sol ? units(sol.raw, 9).replace(/(\.\d{4})\d+$/, '$1') : '0',
    items: rows.slice(0, 12).map(({ value: _value, ...r }) => r),
  };
}

function volume(s?: { buyVolume?: number; sellVolume?: number }): number | undefined {
  if (!s || (s.buyVolume === undefined && s.sellVolume === undefined)) return undefined;
  return (s.buyVolume ?? 0) + (s.sellVolume ?? 0);
}

function clip(s: string, n: number): string {
  // Badge labels are UTF-8 but its fonts carry ASCII and Latin: drop the rest.
  const ascii = (s ?? '').replace(/[^\x20-\x7e]/g, '').trim();
  return ascii.length > n ? `${ascii.slice(0, n - 1)}.` : ascii;
}

function age(createdAt?: string): string {
  if (!createdAt) return '-';
  const ms = Date.now() - Date.parse(createdAt);
  if (!Number.isFinite(ms) || ms < 0) return '-';
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))}m`;
  if (h < 48) return `${Math.round(h)}h`;
  const d = h / 24;
  return d < 60 ? `${Math.round(d)}d` : d < 730 ? `${Math.round(d / 30)}mo` : `${Math.round(d / 365)}y`;
}
