CREATE TABLE IF NOT EXISTS inventory (
  product_id VARCHAR(255) PRIMARY KEY,
  quantity INT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(255) NOT NULL,
  charge_id VARCHAR(255) NOT NULL,
  amount INT NOT NULL,
  status VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO inventory (product_id, quantity) VALUES ('prod_1', 100) ON CONFLICT (product_id) DO UPDATE SET quantity=100;
INSERT INTO inventory (product_id, quantity) VALUES ('prod_2', 5) ON CONFLICT (product_id) DO UPDATE SET quantity=5;
