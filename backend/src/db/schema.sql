-- Business data only: chain history lives at Mercury, this base stores what
-- the platform owns (claims, repurchase requests, kyc statuses) plus a light
-- mirror of decoded events for joins and offline queries.

CREATE TABLE IF NOT EXISTS sync_cursor (
  contract_id text PRIMARY KEY,
  last_mercury_id bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chain_events (
  mercury_id bigint PRIMARY KEY,
  contract_id text NOT NULL,
  kind text NOT NULL,
  topics jsonb NOT NULL,
  data jsonb,
  tx text NOT NULL,
  event_index int NOT NULL,
  -- ledger close time, resolved from RPC or Horizon (Mercury does not serve it)
  ledger_ts timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE chain_events ADD COLUMN IF NOT EXISTS ledger_ts timestamptz;
CREATE INDEX IF NOT EXISTS chain_events_contract_kind
  ON chain_events (contract_id, kind);
CREATE INDEX IF NOT EXISTS chain_events_topics
  ON chain_events USING gin (topics);

-- Delivery claims: the address travels encrypted, only its hash is on-chain.
-- The optional contact email is encrypted the same way, never stored clear.
CREATE TABLE IF NOT EXISTS claims (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wallet text NOT NULL,
  vault_contract text NOT NULL,
  lots int NOT NULL CHECK (lots > 0),
  delivery_ciphertext bytea NOT NULL,
  delivery_hash bytea NOT NULL,
  contact_ciphertext bytea,
  onchain_tx text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'onchain', 'preparing', 'shipped', 'fulfilled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS claims_wallet ON claims (wallet);
ALTER TABLE claims ADD COLUMN IF NOT EXISTS contact_ciphertext bytea;
-- one marker per notified transition, set even without an email on file so
-- the worker never reprocesses a transition
ALTER TABLE claims ADD COLUMN IF NOT EXISTS onchain_notified_at timestamptz;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS fulfilled_notified_at timestamptz;

-- Producer repurchase requests, settled on demand (~72h, never guaranteed).
CREATE TABLE IF NOT EXISTS repurchase_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wallet text NOT NULL,
  vault_contract text NOT NULL,
  lots int NOT NULL CHECK (lots > 0),
  contact_ciphertext bytea,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'notified', 'funded', 'redeemed', 'cancelled')),
  -- redeem tx that closed this request, so one redeem closes only one request
  closing_tx text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE repurchase_requests ADD COLUMN IF NOT EXISTS closing_tx text;
CREATE INDEX IF NOT EXISTS repurchase_wallet ON repurchase_requests (wallet);
ALTER TABLE repurchase_requests ADD COLUMN IF NOT EXISTS contact_ciphertext bytea;
ALTER TABLE repurchase_requests ADD COLUMN IF NOT EXISTS redeemed_notified_at timestamptz;

-- KYC: status and provider reference only, never documents.
CREATE TABLE IF NOT EXISTS kyc_status (
  wallet text PRIMARY KEY,
  provider_ref text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  allowlisted_tx text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Outbound notifications journal: the dev transport writes here instead of
-- sending, and it doubles as an audit trail of what left the platform.
CREATE TABLE IF NOT EXISTS notifications_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipient text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  transport text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ops console audit: every mutation through /admin leaves a line.
CREATE TABLE IF NOT EXISTS admin_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action text NOT NULL,
  target text NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Oracle submissions journal: audit trail on top of the on-chain record.
CREATE TABLE IF NOT EXISTS oracle_reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vault_contract text NOT NULL,
  value numeric NOT NULL,
  tx text,
  status text NOT NULL CHECK (status IN ('submitted', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
