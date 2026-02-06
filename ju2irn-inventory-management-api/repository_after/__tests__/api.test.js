const request = require('supertest');
const { app, resetData } = require('../../repository_after/index');

// Reset data before each test to ensure independence
beforeEach(() => {
  resetData();
});

// Helper function to create a product
const createProduct = async (productData = {}) => {
  const defaultProduct = {
    sku: 'TEST-SKU-001',
    name: 'Test Product',
    price: 29.99,
    category: 'electronics',
    stockLevel: 100
  };
  const response = await request(app)
    .post('/products')
    .send({ ...defaultProduct, ...productData });
  return response;
};

describe('Inventory Management API', () => {

  // ============================================
  // GET /products - List Products
  // ============================================
  describe('GET /products', () => {

    describe('Success Cases', () => {
      it('should return all products when products exist', async () => {
        await createProduct({ sku: 'SKU-001', name: 'Product 1' });
        await createProduct({ sku: 'SKU-002', name: 'Product 2' });

        const response = await request(app).get('/products');

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(2);
        expect(response.body[0]).toHaveProperty('sku', 'SKU-001');
        expect(response.body[1]).toHaveProperty('sku', 'SKU-002');
      });

      it('should return empty array when no products exist', async () => {
        const response = await request(app).get('/products');

        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
        expect(Array.isArray(response.body)).toBe(true);
      });

      it('should return filtered products when category query parameter is provided', async () => {
        await createProduct({ sku: 'SKU-001', category: 'electronics' });
        await createProduct({ sku: 'SKU-002', category: 'clothing' });
        await createProduct({ sku: 'SKU-003', category: 'electronics' });

        const response = await request(app).get('/products?category=electronics');

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(2);
        expect(response.body.every(p => p.category === 'electronics')).toBe(true);
      });

      it('should return empty array when category filter matches no products', async () => {
        await createProduct({ sku: 'SKU-001', category: 'electronics' });

        const response = await request(app).get('/products?category=nonexistent');

        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
      });
    });

    describe('Edge Cases', () => {
      it('should return all products when category parameter is empty string', async () => {
        await createProduct({ sku: 'SKU-001' });

        const response = await request(app).get('/products?category=');

        expect(response.status).toBe(200);
      });
    });
  });

  // ============================================
  // POST /products - Create Product
  // ============================================
  describe('POST /products', () => {

    describe('Success Cases', () => {
      it('should return 201 with created product when all required fields are provided', async () => {
        const productData = {
          sku: 'NEW-SKU-001',
          name: 'New Product',
          price: 49.99,
          category: 'books',
          stockLevel: 50
        };

        const response = await request(app)
          .post('/products')
          .send(productData);

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('sku', 'NEW-SKU-001');
        expect(response.body).toHaveProperty('name', 'New Product');
        expect(response.body).toHaveProperty('price', 49.99);
        expect(response.body).toHaveProperty('category', 'books');
        expect(response.body).toHaveProperty('stockLevel', 50);
        expect(response.body).toHaveProperty('createdAt');
      });

      it('should return product with default category when category is not provided', async () => {
        const response = await request(app)
          .post('/products')
          .send({ sku: 'SKU-001', name: 'Test', price: 10 });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('category', 'uncategorized');
      });

      it('should return product with zero stock when stockLevel is not provided', async () => {
        const response = await request(app)
          .post('/products')
          .send({ sku: 'SKU-001', name: 'Test', price: 10 });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('stockLevel', 0);
      });

      it('should return product with price of zero when price is zero', async () => {
        const response = await request(app)
          .post('/products')
          .send({ sku: 'SKU-001', name: 'Free Item', price: 0 });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('price', 0);
      });
    });

    describe('Error Cases', () => {
      it('should return 409 conflict error when SKU already exists', async () => {
        await createProduct({ sku: 'DUPLICATE-SKU' });

        const response = await request(app)
          .post('/products')
          .send({ sku: 'DUPLICATE-SKU', name: 'Another Product', price: 10 });

        expect(response.status).toBe(409);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('SKU already exists');
      });

      it('should return 400 with validation message when sku is missing', async () => {
        const response = await request(app)
          .post('/products')
          .send({ name: 'Test', price: 10 });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('required');
      });

      it('should return 400 with validation message when name is missing', async () => {
        const response = await request(app)
          .post('/products')
          .send({ sku: 'SKU-001', price: 10 });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('required');
      });

      it('should return 400 with validation message when price is missing', async () => {
        const response = await request(app)
          .post('/products')
          .send({ sku: 'SKU-001', name: 'Test' });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('required');
      });

      it('should return 400 when price is negative', async () => {
        const response = await request(app)
          .post('/products')
          .send({ sku: 'SKU-001', name: 'Test', price: -10 });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('non-negative');
      });

      it('should return 400 when price is not a number', async () => {
        const response = await request(app)
          .post('/products')
          .send({ sku: 'SKU-001', name: 'Test', price: 'invalid' });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      });
    });

    describe('Edge Cases', () => {
      it('should handle product creation with very long name', async () => {
        const longName = 'A'.repeat(1000);
        const response = await request(app)
          .post('/products')
          .send({ sku: 'SKU-001', name: longName, price: 10 });

        expect(response.status).toBe(201);
        expect(response.body.name).toBe(longName);
      });

      it('should handle product creation with decimal price', async () => {
        const response = await request(app)
          .post('/products')
          .send({ sku: 'SKU-001', name: 'Test', price: 19.99 });

        expect(response.status).toBe(201);
        expect(response.body.price).toBe(19.99);
      });
    });
  });

  // ============================================
  // GET /products/:id - Get Product by ID
  // ============================================
  describe('GET /products/:id', () => {

    describe('Success Cases', () => {
      it('should return correct product when valid ID is provided', async () => {
        const created = await createProduct({ sku: 'SKU-001', name: 'Test Product' });
        const productId = created.body.id;

        const response = await request(app).get(`/products/${productId}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('id', productId);
        expect(response.body).toHaveProperty('sku', 'SKU-001');
        expect(response.body).toHaveProperty('name', 'Test Product');
      });
    });

    describe('Error Cases', () => {
      it('should return 404 when product ID does not exist', async () => {
        const response = await request(app).get('/products/99999');

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('not found');
      });

      it('should return 400 when ID format is invalid (non-numeric)', async () => {
        const response = await request(app).get('/products/invalid');

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Invalid');
      });

      it('should return 404 when ID is a float string parsed as integer', async () => {
        // parseInt('1.5') returns 1, so it looks for product with ID 1
        const response = await request(app).get('/products/1.5');

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('error');
      });
    });

    describe('Edge Cases', () => {
      it('should return 404 when ID is zero', async () => {
        const response = await request(app).get('/products/0');

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('error');
      });

      it('should return 404 when ID is negative', async () => {
        const response = await request(app).get('/products/-1');

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('error');
      });
    });
  });

  // ============================================
  // PUT /products/:id - Update Product
  // ============================================
  describe('PUT /products/:id', () => {

    describe('Success Cases', () => {
      it('should return updated product when valid update data is provided', async () => {
        const created = await createProduct({ sku: 'SKU-001', name: 'Original' });
        const productId = created.body.id;

        const response = await request(app)
          .put(`/products/${productId}`)
          .send({ name: 'Updated Name', price: 99.99 });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('name', 'Updated Name');
        expect(response.body).toHaveProperty('price', 99.99);
        expect(response.body).toHaveProperty('updatedAt');
      });

      it('should allow partial updates when only some fields are provided', async () => {
        const created = await createProduct({ sku: 'SKU-001', name: 'Original', price: 50 });
        const productId = created.body.id;

        const response = await request(app)
          .put(`/products/${productId}`)
          .send({ name: 'New Name Only' });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('name', 'New Name Only');
        expect(response.body).toHaveProperty('price', 50); // unchanged
      });

      it('should update SKU when new SKU is unique', async () => {
        const created = await createProduct({ sku: 'OLD-SKU' });
        const productId = created.body.id;

        const response = await request(app)
          .put(`/products/${productId}`)
          .send({ sku: 'NEW-SKU' });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('sku', 'NEW-SKU');
      });

      it('should update category when provided', async () => {
        const created = await createProduct({ sku: 'SKU-001', category: 'old-category' });
        const productId = created.body.id;

        const response = await request(app)
          .put(`/products/${productId}`)
          .send({ category: 'new-category' });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('category', 'new-category');
      });
    });

    describe('Error Cases', () => {
      it('should return 409 when updating to duplicate SKU', async () => {
        await createProduct({ sku: 'EXISTING-SKU' });
        const created = await createProduct({ sku: 'MY-SKU' });
        const productId = created.body.id;

        const response = await request(app)
          .put(`/products/${productId}`)
          .send({ sku: 'EXISTING-SKU' });

        expect(response.status).toBe(409);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('SKU already exists');
      });

      it('should return 404 when updating non-existent product', async () => {
        const response = await request(app)
          .put('/products/99999')
          .send({ name: 'Updated' });

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('not found');
      });

      it('should return 400 when ID format is invalid', async () => {
        const response = await request(app)
          .put('/products/invalid')
          .send({ name: 'Updated' });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Invalid');
      });

      it('should return 400 when updating price to negative value', async () => {
        const created = await createProduct({ sku: 'SKU-001' });
        const productId = created.body.id;

        const response = await request(app)
          .put(`/products/${productId}`)
          .send({ price: -10 });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('non-negative');
      });

      it('should return 400 when updating price to non-number', async () => {
        const created = await createProduct({ sku: 'SKU-001' });
        const productId = created.body.id;

        const response = await request(app)
          .put(`/products/${productId}`)
          .send({ price: 'invalid' });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      });
    });

    describe('Edge Cases', () => {
      it('should allow updating price to zero', async () => {
        const created = await createProduct({ sku: 'SKU-001', price: 50 });
        const productId = created.body.id;

        const response = await request(app)
          .put(`/products/${productId}`)
          .send({ price: 0 });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('price', 0);
      });

      it('should allow updating SKU to same value', async () => {
        const created = await createProduct({ sku: 'SAME-SKU' });
        const productId = created.body.id;

        const response = await request(app)
          .put(`/products/${productId}`)
          .send({ sku: 'SAME-SKU' });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('sku', 'SAME-SKU');
      });
    });
  });

  // ============================================
  // DELETE /products/:id - Delete Product
  // ============================================
  describe('DELETE /products/:id', () => {

    describe('Success Cases', () => {
      it('should return 204 when product is successfully deleted', async () => {
        const created = await createProduct({ sku: 'SKU-001' });
        const productId = created.body.id;

        const response = await request(app).delete(`/products/${productId}`);

        expect(response.status).toBe(204);
      });

      it('should make deleted product no longer retrievable', async () => {
        const created = await createProduct({ sku: 'SKU-001' });
        const productId = created.body.id;

        await request(app).delete(`/products/${productId}`);

        const getResponse = await request(app).get(`/products/${productId}`);
        expect(getResponse.status).toBe(404);
      });

      it('should remove deleted product from product list', async () => {
        const created = await createProduct({ sku: 'SKU-001' });
        const productId = created.body.id;

        await request(app).delete(`/products/${productId}`);

        const listResponse = await request(app).get('/products');
        expect(listResponse.body).toHaveLength(0);
      });
    });

    describe('Error Cases', () => {
      it('should return 404 when deleting non-existent product', async () => {
        const response = await request(app).delete('/products/99999');

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('not found');
      });

      it('should return 400 when ID format is invalid', async () => {
        const response = await request(app).delete('/products/invalid');

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Invalid');
      });
    });

    describe('Edge Cases', () => {
      it('should return 404 when deleting already deleted product', async () => {
        const created = await createProduct({ sku: 'SKU-001' });
        const productId = created.body.id;

        await request(app).delete(`/products/${productId}`);
        const secondDelete = await request(app).delete(`/products/${productId}`);

        expect(secondDelete.status).toBe(404);
      });
    });
  });

  // ============================================
  // POST /products/:id/restock - Restock Product
  // ============================================
  describe('POST /products/:id/restock', () => {

    describe('Success Cases', () => {
      it('should increase stock level correctly when valid quantity is provided', async () => {
        const created = await createProduct({ sku: 'SKU-001', stockLevel: 10 });
        const productId = created.body.id;

        const response = await request(app)
          .post(`/products/${productId}/restock`)
          .send({ quantity: 50 });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('stockLevel', 60);
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('Restocked');
      });

      it('should handle multiple restocks correctly', async () => {
        const created = await createProduct({ sku: 'SKU-001', stockLevel: 0 });
        const productId = created.body.id;

        await request(app).post(`/products/${productId}/restock`).send({ quantity: 10 });
        const response = await request(app).post(`/products/${productId}/restock`).send({ quantity: 20 });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('stockLevel', 30);
      });

      it('should handle restock with decimal quantity', async () => {
        const created = await createProduct({ sku: 'SKU-001', stockLevel: 10 });
        const productId = created.body.id;

        const response = await request(app)
          .post(`/products/${productId}/restock`)
          .send({ quantity: 5.5 });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('stockLevel', 15.5);
      });
    });

    describe('Error Cases', () => {
      it('should return 400 when quantity is zero', async () => {
        const created = await createProduct({ sku: 'SKU-001' });
        const productId = created.body.id;

        const response = await request(app)
          .post(`/products/${productId}/restock`)
          .send({ quantity: 0 });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('positive');
      });

      it('should return 400 when quantity is negative', async () => {
        const created = await createProduct({ sku: 'SKU-001' });
        const productId = created.body.id;

        const response = await request(app)
          .post(`/products/${productId}/restock`)
          .send({ quantity: -10 });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('positive');
      });

      it('should return 404 when restocking non-existent product', async () => {
        const response = await request(app)
          .post('/products/99999/restock')
          .send({ quantity: 10 });

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('not found');
      });

      it('should return 400 when ID format is invalid', async () => {
        const response = await request(app)
          .post('/products/invalid/restock')
          .send({ quantity: 10 });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Invalid');
      });

      it('should return 400 when quantity is not a number', async () => {
        const created = await createProduct({ sku: 'SKU-001' });
        const productId = created.body.id;

        const response = await request(app)
          .post(`/products/${productId}/restock`)
          .send({ quantity: 'invalid' });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      });

      it('should return 400 when quantity is missing', async () => {
        const created = await createProduct({ sku: 'SKU-001' });
        const productId = created.body.id;

        const response = await request(app)
          .post(`/products/${productId}/restock`)
          .send({});

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      });
    });

    describe('Edge Cases', () => {
      it('should handle very large restock quantities', async () => {
        const created = await createProduct({ sku: 'SKU-001', stockLevel: 0 });
        const productId = created.body.id;

        const response = await request(app)
          .post(`/products/${productId}/restock`)
          .send({ quantity: 1000000 });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('stockLevel', 1000000);
      });
    });
  });

  // ============================================
  // POST /products/:id/fulfill - Fulfill Order
  // ============================================
  describe('POST /products/:id/fulfill', () => {

    describe('Success Cases', () => {
      it('should decrease stock level correctly when valid quantity is provided', async () => {
        const created = await createProduct({ sku: 'SKU-001', stockLevel: 100 });
        const productId = created.body.id;

        const response = await request(app)
          .post(`/products/${productId}/fulfill`)
          .send({ quantity: 30 });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('stockLevel', 70);
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('fulfilled');
      });

      it('should include updated stock level in response', async () => {
        const created = await createProduct({ sku: 'SKU-001', stockLevel: 50 });
        const productId = created.body.id;

        const response = await request(app)
          .post(`/products/${productId}/fulfill`)
          .send({ quantity: 20 });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('stockLevel');
        expect(typeof response.body.stockLevel).toBe('number');
      });

      it('should allow fulfilling entire stock', async () => {
        const created = await createProduct({ sku: 'SKU-001', stockLevel: 50 });
        const productId = created.body.id;

        const response = await request(app)
          .post(`/products/${productId}/fulfill`)
          .send({ quantity: 50 });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('stockLevel', 0);
      });
    });

    describe('Error Cases', () => {
      it('should return 400 with insufficient stock message when fulfilling more than available', async () => {
        const created = await createProduct({ sku: 'SKU-001', stockLevel: 10 });
        const productId = created.body.id;

        const response = await request(app)
          .post(`/products/${productId}/fulfill`)
          .send({ quantity: 50 });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Insufficient stock');
        expect(response.body).toHaveProperty('available', 10);
      });

      it('should return 400 when quantity is zero', async () => {
        const created = await createProduct({ sku: 'SKU-001', stockLevel: 10 });
        const productId = created.body.id;

        const response = await request(app)
          .post(`/products/${productId}/fulfill`)
          .send({ quantity: 0 });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('positive');
      });

      it('should return 400 when quantity is negative', async () => {
        const created = await createProduct({ sku: 'SKU-001', stockLevel: 10 });
        const productId = created.body.id;

        const response = await request(app)
          .post(`/products/${productId}/fulfill`)
          .send({ quantity: -5 });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('positive');
      });

      it('should return 404 when fulfilling non-existent product', async () => {
        const response = await request(app)
          .post('/products/99999/fulfill')
          .send({ quantity: 10 });

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('not found');
      });

      it('should return 400 when ID format is invalid', async () => {
        const response = await request(app)
          .post('/products/invalid/fulfill')
          .send({ quantity: 10 });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Invalid');
      });

      it('should return 400 when quantity is not a number', async () => {
        const created = await createProduct({ sku: 'SKU-001', stockLevel: 10 });
        const productId = created.body.id;

        const response = await request(app)
          .post(`/products/${productId}/fulfill`)
          .send({ quantity: 'five' });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      });
    });

    describe('Edge Cases', () => {
      it('should fail when fulfilling from zero stock', async () => {
        const created = await createProduct({ sku: 'SKU-001', stockLevel: 0 });
        const productId = created.body.id;

        const response = await request(app)
          .post(`/products/${productId}/fulfill`)
          .send({ quantity: 1 });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Insufficient stock');
      });
    });
  });

  // ============================================
  // GET /inventory/low-stock - Low Stock Report
  // ============================================
  describe('GET /inventory/low-stock', () => {

    describe('Success Cases', () => {
      it('should return products below default threshold of 10', async () => {
        await createProduct({ sku: 'SKU-001', stockLevel: 5 });
        await createProduct({ sku: 'SKU-002', stockLevel: 15 });
        await createProduct({ sku: 'SKU-003', stockLevel: 8 });

        const response = await request(app).get('/inventory/low-stock');

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(2);
        expect(response.body.every(p => p.stockLevel < 10)).toBe(true);
      });

      it('should respect custom threshold query parameter', async () => {
        await createProduct({ sku: 'SKU-001', stockLevel: 20 });
        await createProduct({ sku: 'SKU-002', stockLevel: 30 });
        await createProduct({ sku: 'SKU-003', stockLevel: 40 });

        const response = await request(app).get('/inventory/low-stock?threshold=25');

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0].stockLevel).toBe(20);
      });

      it('should return empty array when all products have sufficient stock', async () => {
        await createProduct({ sku: 'SKU-001', stockLevel: 100 });
        await createProduct({ sku: 'SKU-002', stockLevel: 200 });

        const response = await request(app).get('/inventory/low-stock');

        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
      });

      it('should return empty array when no products exist', async () => {
        const response = await request(app).get('/inventory/low-stock');

        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
      });
    });

    describe('Edge Cases', () => {
      it('should include products with exactly zero stock', async () => {
        await createProduct({ sku: 'SKU-001', stockLevel: 0 });

        const response = await request(app).get('/inventory/low-stock');

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0].stockLevel).toBe(0);
      });

      it('should not include products at exactly the threshold', async () => {
        await createProduct({ sku: 'SKU-001', stockLevel: 10 });

        const response = await request(app).get('/inventory/low-stock?threshold=10');

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(0);
      });

      it('should use default threshold when threshold is zero (falsy)', async () => {
        // Note: parseInt('0') || 10 = 10 because 0 is falsy in JavaScript
        // So threshold=0 actually falls back to default of 10
        await createProduct({ sku: 'SKU-001', stockLevel: 0 });
        await createProduct({ sku: 'SKU-002', stockLevel: 5 });

        const response = await request(app).get('/inventory/low-stock?threshold=0');

        expect(response.status).toBe(200);
        // Both products have stockLevel < 10 (the default), so both are returned
        expect(response.body).toHaveLength(2);
      });

      it('should handle very high threshold', async () => {
        await createProduct({ sku: 'SKU-001', stockLevel: 100 });
        await createProduct({ sku: 'SKU-002', stockLevel: 200 });

        const response = await request(app).get('/inventory/low-stock?threshold=1000');

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(2);
      });
    });
  });

  // ============================================
  // Integration Tests - Multi-step Workflows
  // ============================================
  describe('Integration Tests', () => {

    describe('Restock and Fulfill Workflow', () => {
      it('should correctly track stock through restock followed by fulfill', async () => {
        // Create product with initial stock
        const created = await createProduct({ sku: 'SKU-001', stockLevel: 10 });
        const productId = created.body.id;

        // Restock
        await request(app)
          .post(`/products/${productId}/restock`)
          .send({ quantity: 50 });

        // Fulfill order
        const fulfillResponse = await request(app)
          .post(`/products/${productId}/fulfill`)
          .send({ quantity: 30 });

        expect(fulfillResponse.body.stockLevel).toBe(30); // 10 + 50 - 30

        // Verify final state
        const product = await request(app).get(`/products/${productId}`);
        expect(product.body.stockLevel).toBe(30);
      });

      it('should prevent overfulfillment after partial fulfillment', async () => {
        const created = await createProduct({ sku: 'SKU-001', stockLevel: 100 });
        const productId = created.body.id;

        // First fulfill
        await request(app)
          .post(`/products/${productId}/fulfill`)
          .send({ quantity: 60 });

        // Try to fulfill more than remaining
        const response = await request(app)
          .post(`/products/${productId}/fulfill`)
          .send({ quantity: 50 });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Insufficient stock');
        expect(response.body.available).toBe(40);
      });
    });

    describe('Product Lifecycle', () => {
      it('should handle complete product lifecycle from creation to deletion', async () => {
        // Create
        const created = await request(app)
          .post('/products')
          .send({ sku: 'LIFECYCLE-SKU', name: 'Lifecycle Test', price: 25 });
        expect(created.status).toBe(201);
        const productId = created.body.id;

        // Read
        const read = await request(app).get(`/products/${productId}`);
        expect(read.status).toBe(200);

        // Update
        const updated = await request(app)
          .put(`/products/${productId}`)
          .send({ name: 'Updated Lifecycle' });
        expect(updated.status).toBe(200);

        // Restock
        const restocked = await request(app)
          .post(`/products/${productId}/restock`)
          .send({ quantity: 100 });
        expect(restocked.status).toBe(200);

        // Fulfill
        const fulfilled = await request(app)
          .post(`/products/${productId}/fulfill`)
          .send({ quantity: 25 });
        expect(fulfilled.status).toBe(200);

        // Delete
        const deleted = await request(app).delete(`/products/${productId}`);
        expect(deleted.status).toBe(204);

        // Verify deleted
        const notFound = await request(app).get(`/products/${productId}`);
        expect(notFound.status).toBe(404);
      });
    });

    describe('Low Stock Alert Workflow', () => {
      it('should correctly identify low stock products after fulfillment', async () => {
        // Create two products
        const product1 = await createProduct({ sku: 'SKU-001', stockLevel: 50 });
        const product2 = await createProduct({ sku: 'SKU-002', stockLevel: 50 });

        // Fulfill most of product1's stock
        await request(app)
          .post(`/products/${product1.body.id}/fulfill`)
          .send({ quantity: 45 });

        // Check low stock
        const lowStock = await request(app).get('/inventory/low-stock');

        expect(lowStock.body).toHaveLength(1);
        expect(lowStock.body[0].sku).toBe('SKU-001');
        expect(lowStock.body[0].stockLevel).toBe(5);
      });
    });
  });
});
