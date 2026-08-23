import type pg from 'pg';

// Off-chain rows follow what the chain says, never the other way round: the
// mirror of decoded events is the source of truth for every transition.

/** draft -> onchain when the delivery hash appears in a claim event, then
 *  -> fulfilled when the admin closes the delivery on-chain. */
export async function reconcileClaims(db: pg.Pool | pg.Client): Promise<number> {
  const onchain = await db.query(
    `UPDATE claims c
     SET status = 'onchain', onchain_tx = e.tx, updated_at = now()
     FROM chain_events e
     WHERE c.status = 'draft'
       AND e.kind = 'claim'
       AND e.contract_id = c.vault_contract
       AND e.data->>1 = encode(c.delivery_hash, 'hex')`,
  );
  const fulfilled = await db.query(
    `UPDATE claims c
     SET status = 'fulfilled', updated_at = now()
     FROM chain_events e
     WHERE c.status IN ('onchain', 'preparing', 'shipped')
       AND e.kind = 'fulfilled'
       AND e.contract_id = c.vault_contract
       AND e.topics->>0 = c.wallet
       AND e.ingested_at >= c.created_at`,
  );
  return (onchain.rowCount ?? 0) + (fulfilled.rowCount ?? 0);
}

/** Each on-chain redeem closes exactly one open repurchase request: the oldest
 *  matching one. Pairing the request to the redeem tx (per vault) stops one
 *  redeem from closing every open request a wallet has on that vault. */
export async function reconcileRepurchases(db: pg.Pool | pg.Client): Promise<number> {
  const events = await db.query(
    `SELECT e.tx, e.topics->>0 AS wallet, e.contract_id, e.ingested_at
     FROM chain_events e
     WHERE e.kind = 'redeem'
       AND NOT EXISTS (
         SELECT 1 FROM repurchase_requests r
         WHERE r.closing_tx = e.tx AND r.vault_contract = e.contract_id
       )
     ORDER BY e.mercury_id`,
  );
  let closed = 0;
  for (const ev of events.rows) {
    // ingested_at is compared inside SQL: reading it back through a JS Date
    // would truncate the timestamp to milliseconds and could wrongly reject a
    // request created in the same millisecond as the event.
    const res = await db.query(
      `UPDATE repurchase_requests
       SET status = 'redeemed', updated_at = now(), closing_tx = $1
       WHERE id = (
         SELECT id FROM repurchase_requests
         WHERE status IN ('requested', 'notified', 'funded')
           AND wallet = $2 AND vault_contract = $3
           AND requested_at <= (
             SELECT ingested_at FROM chain_events
             WHERE tx = $1 AND contract_id = $3 AND kind = 'redeem'
             LIMIT 1
           )
         ORDER BY requested_at LIMIT 1
       )`,
      [ev.tx, ev.wallet, ev.contract_id],
    );
    closed += res.rowCount ?? 0;
  }
  return closed;
}
