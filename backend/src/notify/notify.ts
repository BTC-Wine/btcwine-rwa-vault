import type pg from 'pg';
import { decryptDelivery } from '../crypto/delivery.js';
import { claimFulfilled, claimReceived, repurchaseSettled, type Message } from './messages.js';
import type { Transport } from './transport.js';

// Turns reconciled status transitions into holder emails. Each transition
// has its own marker column, set once the transition is handled, sent or
// not: a row without a contact email is marked silently, and a send failure
// leaves the marker NULL so the next tick retries.

async function handle(
  db: pg.Pool | pg.Client,
  transport: Transport,
  table: 'claims' | 'repurchase_requests',
  marker: 'onchain_notified_at' | 'fulfilled_notified_at' | 'redeemed_notified_at',
  statuses: string[],
  message: Message,
): Promise<number> {
  const rows = await db.query(
    `SELECT id, contact_ciphertext FROM ${table}
     WHERE status = ANY($1) AND ${marker} IS NULL
     ORDER BY id`,
    [statuses],
  );
  let sent = 0;
  for (const row of rows.rows) {
    if (row.contact_ciphertext) {
      const email = decryptDelivery(row.contact_ciphertext);
      await transport.send(email, message.subject, message.text);
      sent++;
    } else {
      console.log(`notify: no contact email on ${table} ${row.id}, nothing sent`);
    }
    await db.query(`UPDATE ${table} SET ${marker} = now() WHERE id = $1`, [row.id]);
  }
  return sent;
}

/** Worker step: notifies every transition not yet handled. Returns sends. */
export async function notifyTransitions(
  db: pg.Pool | pg.Client,
  transport: Transport,
): Promise<number> {
  return (
    (await handle(db, transport, 'claims', 'onchain_notified_at',
      ['onchain', 'preparing', 'shipped'], claimReceived)) +
    (await handle(db, transport, 'claims', 'fulfilled_notified_at',
      ['fulfilled'], claimFulfilled)) +
    (await handle(db, transport, 'repurchase_requests', 'redeemed_notified_at',
      ['redeemed'], repurchaseSettled))
  );
}
