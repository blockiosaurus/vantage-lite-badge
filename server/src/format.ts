// Display strings are built here, not on the badge: its Lua has 32-bit floats
// (about 7 digits) and 32-bit integers, so a price, a market cap or a lamport
// amount is formatted once, exactly, before it travels.

const SUFFIXES: [number, string][] = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

/** 1234567 -> "1.23M", 950 -> "950". */
export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  const abs = Math.abs(n);
  for (const [size, suffix] of SUFFIXES) {
    if (abs >= size) {
      const v = n / size;
      return `${trim(v.toFixed(Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2))}${suffix}`;
    }
  }
  return trim(n.toFixed(abs >= 100 ? 0 : abs >= 1 ? 2 : 4));
}

/** Money for sizes: "$1.6B", "$187.42", "$950". */
export function usd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  if (n < 0) return `-${usd(-n)}`;
  if (n >= 10_000) return `$${compact(n)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return price(n);
}

/** A price in plain decimals however small: 0.000023141 -> "$0.00002314". */
export function price(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  if (n <= 0) return '$0';
  if (n >= 1) return n >= 10_000 ? `$${compact(n)}` : `$${n.toFixed(n >= 1000 ? 0 : 2)}`;
  const digits = Math.min(12, Math.max(4, 3 - Math.floor(Math.log10(n))));
  return `$${trim(n.toFixed(digits))}`;
}

/** 12.345 -> "+12.3%", -0.04 -> "-0.04%". */
export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  const abs = Math.abs(n);
  const s = abs >= 100 ? abs.toFixed(0) : abs >= 10 ? abs.toFixed(1) : abs.toFixed(2);
  return `${n >= 0 ? '+' : '-'}${s}%`;
}

/** Base units to a human amount: ("1500000000", 9) -> "1.5". Exact. */
export function units(raw: string | bigint, decimals: number): string {
  const v = typeof raw === 'bigint' ? raw : BigInt(raw);
  const neg = v < 0n;
  if (decimals === 0) return `${neg ? '-' : ''}${neg ? -v : v}`;
  const s = (neg ? -v : v).toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

/** A token amount for a narrow screen: "812.4K", "0.0213". */
export function amount(raw: string | bigint, decimals: number): string {
  const n = Number(units(raw, decimals));
  return n >= 1000 ? compact(n) : trim(n.toPrecision(4));
}

/** Round to a value the badge's 32-bit float carries without noise. */
export function f32(n: number | null | undefined, digits = 4): number | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return Number(n.toPrecision(digits));
}

function trim(s: string): string {
  return s.includes('.') && !s.includes('e') ? s.replace(/\.?0+$/, '') : s;
}
