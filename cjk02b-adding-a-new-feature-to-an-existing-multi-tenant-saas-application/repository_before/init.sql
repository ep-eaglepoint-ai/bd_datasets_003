-- Key serialization explicit ordering is handled in the app layer, not DB schema.
-- But we need the tables to exist.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'active'
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  total_cents INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE line_items (
  id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES orders(id),
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_cents INTEGER NOT NULL
);

-- Seed some initial data
INSERT INTO users (id, name, email) VALUES
('u1', 'Alice', 'alice@example.com'),
('u2', 'Bob', 'bob@example.com');

INSERT INTO orders (id, user_id, total_cents) VALUES
('o1', 'u1', 5000),
('o2', 'u1', 2500),
('o3', 'u2', 10000);

INSERT INTO line_items (id, order_id, product_id, quantity, unit_cents) VALUES
('li1', 'o1', 'p1', 2, 2500),
('li2', 'o2', 'p2', 1, 2500),
('li3', 'o3', 'p3', 1, 10000);
