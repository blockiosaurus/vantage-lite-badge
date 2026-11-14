// alternative.me's Crypto Fear & Greed Index, the same one Vantage's market
// mood block shows.

import { fetchJson } from '../upstream';

interface FngResponse {
  data?: { value?: string; value_classification?: string }[];
}

export async function fearGreed(): Promise<{ value: number; label: string } | null> {
  const res = await fetchJson<FngResponse>('https://api.alternative.me/fng/?limit=1', {
    source: 'alternative.me',
    ttl: 600,
  });
  const row = res.data?.[0];
  const value = Number(row?.value);
  if (!row || !Number.isFinite(value)) return null;
  return { value, label: row.value_classification ?? '' };
}
