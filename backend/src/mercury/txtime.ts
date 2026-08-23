import { config } from '../config.js';

// Mercury serves events without any time information, so the ledger close
// time comes from the chain itself: RPC getTransaction first, then Horizon,
// which keeps the full history since the last testnet reset while the RPC
// only retains about seven days. Successful lookups are cached per tx for
// the process lifetime; failures are not, so the next tick retries them.

const cache = new Map<string, Date>();

async function fromRpc(tx: string): Promise<Date | null> {
  const res = await fetch(config.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: { hash: tx } }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { result?: { status?: string; createdAt?: string } };
  const r = body.result;
  if (!r || r.status === 'NOT_FOUND' || !r.createdAt) return null;
  return new Date(Number(r.createdAt) * 1000);
}

async function fromHorizon(tx: string): Promise<Date | null> {
  const res = await fetch(`${config.horizonUrl}/transactions/${tx}`);
  if (!res.ok) return null;
  const body = (await res.json()) as { created_at?: string };
  return body.created_at ? new Date(body.created_at) : null;
}

/** Ledger close time of a transaction, or null when no source knows it. */
export async function ledgerTime(tx: string): Promise<Date | null> {
  const hit = cache.get(tx);
  if (hit) return hit;
  let at: Date | null = null;
  try {
    at = await fromRpc(tx);
    if (!at) at = await fromHorizon(tx);
  } catch {
    return null;
  }
  if (at) cache.set(tx, at);
  return at;
}
