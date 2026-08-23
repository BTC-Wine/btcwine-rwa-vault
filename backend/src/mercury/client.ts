import { config } from '../config.js';

/** Raw event row as served by Mercury's REST API. */
export interface MercuryEvent {
  id: number;
  contract_id: string;
  topic1: string;
  topic2: string;
  topic3: string;
  topic4: string;
  data: string;
  tx: string;
  event_index: number;
}

async function get(path: string, params: Record<string, string | number>): Promise<unknown> {
  const url = new URL(config.mercuryBaseUrl + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${config.mercuryJwt()}` },
  });
  if (!res.ok) {
    throw new Error(`mercury ${path} responded ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/** Events of one contract, oldest first within a page, paginated by offset. */
export async function eventsByContract(
  contractId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<MercuryEvent[]> {
  return (await get(`/events/by-contract/${contractId}`, {
    limit: opts.limit ?? 100,
    offset: opts.offset ?? 0,
  })) as MercuryEvent[];
}

/** Events of several contracts in one call. */
export async function eventsByContracts(
  contractIds: string[],
  opts: { limit?: number; offset?: number } = {},
): Promise<MercuryEvent[]> {
  return (await get('/events/by-contracts', {
    contracts: contractIds.join(','),
    limit: opts.limit ?? 100,
    offset: opts.offset ?? 0,
  })) as MercuryEvent[];
}
