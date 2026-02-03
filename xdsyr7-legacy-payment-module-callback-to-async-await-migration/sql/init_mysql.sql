CREATE TABLE IF NOT EXISTS inventory (
  product_id VARCHAR(255) PRIMARY KEY,
  quantity INT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(255) NOT NULL,
  charge_id VARCHAR(255) NOT NULL,
  amount INT NOT NULL,
  status VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO inventory (product_id, quantity) VALUES ('prod_1', 100) ON DUPLICATE KEY UPDATE quantity=100;
INSERT INTO inventory (product_id, quantity) VALUES ('prod_2', 5) ON DUPLICATE KEY UPDATE quantity=5;
