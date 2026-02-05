-- Payments table only. No idempotency table (pre-feature state).
CREATE TABLE IF NOT EXISTS payments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount_cents BIGINT NOT NULL,
  currency   VARCHAR(3) NOT NULL,
  reference  VARCHAR(255),
  status     VARCHAR(20) NOT NULL DEFAULT 'created',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
