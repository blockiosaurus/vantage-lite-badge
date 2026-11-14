// Solana JSON-RPC, for the two things only the chain can say: how much of a
// token the wallet that scanned a sell holds, and whether its swap landed.

import type { Env } from '../env';
import { fetchJson, UpstreamError } from '../upstream';

let nextId = 1;

export async function rpc<T>(env: Env, method: string, params: unknown[]): Promise<T> {
  const res = await fetchJson<{ result?: T; error?: { message?: string } }>(env.SOLANA_RPC_URL, {
    source: 'rpc',
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
    },
  });
  if (res.error) throw new UpstreamError('rpc', 502, res.error.message ?? 'rpc error');
  return res.result as T;
}

/** The wallet's whole balance of `mint`, in base units, across its token accounts. */
export async function tokenBalance(env: Env, wallet: string, mint: string): Promise<bigint> {
  const res = await rpc<{
    value: { account: { data: { parsed?: { info?: { tokenAmount?: { amount?: string } } } } } }[];
  }>(env, 'getTokenAccountsByOwner', [
    wallet,
    { mint },
    { encoding: 'jsonParsed', commitment: 'confirmed' },
  ]);
  let total = 0n;
  for (const a of res.value) {
    const amt = a.account.data.parsed?.info?.tokenAmount?.amount;
    if (amt && /^\d+$/.test(amt)) total += BigInt(amt);
  }
  return total;
}

export interface SignatureInfo {
  signature: string;
  blockTime: number | null;
  err: unknown;
}

export function recentSignatures(env: Env, wallet: string): Promise<SignatureInfo[]> {
  return rpc(env, 'getSignaturesForAddress', [wallet, { limit: 10, commitment: 'confirmed' }]);
}

export async function transactionBlockhash(
  env: Env,
  signature: string,
): Promise<{ blockhash: string; err: unknown } | null> {
  const tx = await rpc<{
    transaction?: { message?: { recentBlockhash?: string } };
    meta?: { err?: unknown };
  } | null>(env, 'getTransaction', [
    signature,
    { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
  ]);
  const blockhash = tx?.transaction?.message?.recentBlockhash;
  return blockhash ? { blockhash, err: tx?.meta?.err ?? null } : null;
}
