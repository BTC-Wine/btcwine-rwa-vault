import type pg from 'pg';
import { config } from '../config.js';

// Holder notifications leave through a transport. Without a Postmark token
// the dev transport takes over: it journals the message in Postgres and logs
// it, so the whole pipeline runs identically with or without an account.

export interface Transport {
  readonly name: string;
  send(to: string, subject: string, text: string): Promise<void>;
}

export class DevTransport implements Transport {
  readonly name = 'dev';

  constructor(private readonly db: pg.Pool | pg.Client) {}

  async send(to: string, subject: string, text: string): Promise<void> {
    await this.db.query(
      `INSERT INTO notifications_log (recipient, subject, body, transport)
       VALUES ($1, $2, $3, $4)`,
      [to, subject, text, this.name],
    );
    console.log(`notify (dev): ${to}: ${subject}`);
  }
}

export class PostmarkTransport implements Transport {
  readonly name = 'postmark';

  constructor(private readonly token: string) {}

  async send(to: string, subject: string, text: string): Promise<void> {
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Postmark-Server-Token': this.token,
      },
      body: JSON.stringify({
        From: config.notifyFrom,
        To: to,
        Subject: subject,
        TextBody: text,
        MessageStream: 'outbound',
      }),
    });
    if (!res.ok) {
      throw new Error(`postmark responded ${res.status}: ${await res.text()}`);
    }
  }
}

/** Postmark when a token is configured, the journaling dev transport otherwise. */
export function makeTransport(db: pg.Pool | pg.Client): Transport {
  const token = config.postmarkToken;
  return token ? new PostmarkTransport(token) : new DevTransport(db);
}
