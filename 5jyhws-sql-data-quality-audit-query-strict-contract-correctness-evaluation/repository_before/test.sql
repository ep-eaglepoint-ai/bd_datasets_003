Schema + Sample Tables (Use Exactly These)
-- Customers
CREATE TABLE customers (
  customer_id   BIGINT PRIMARY KEY,
  email         TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL
);

-- Orders
CREATE TABLE orders (
  order_id      BIGINT PRIMARY KEY,
  customer_id   BIGINT NOT NULL,
  status        TEXT NOT NULL, -- allowed: 'CREATED','PAID','CANCELLED','FULFILLED'
  total_amount  NUMERIC(12,2) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL,
  fulfilled_at  TIMESTAMPTZ NULL
);

-- Payments
CREATE TABLE payments (
  payment_id    BIGINT PRIMARY KEY,
  order_id      BIGINT NOT NULL,
  status        TEXT NOT NULL, -- allowed: 'PENDING','CAPTURED','FAILED','REFUNDED'
  amount        NUMERIC(12,2) NOT NULL,
  paid_at       TIMESTAMPTZ NULL,
  created_at    TIMESTAMPTZ NOT NULL
);

-- Foreign key constraints intentionally NOT present in this legacy DB.
-- Your audit should detect violations that FK constraints would normally prevent.
