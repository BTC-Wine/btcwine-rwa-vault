import pg from 'pg';
import { config } from '../config.js';
import { processAllowlist } from './allowlist.js';

// One-shot allowlist pass, for operations and integration checks. The
// continuous path is the worker.

const db = new pg.Client({ connectionString: config.databaseUrl });
await db.connect();
try {
  console.log('transitions:', await processAllowlist(db));
} finally {
  await db.end();
}
