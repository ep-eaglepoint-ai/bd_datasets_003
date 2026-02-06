const request = require('supertest');
const fs = require('fs');
const path = require('path');

// Import the app
const app = require('../repository_before/app.js');

describe('Plant Shop API Tests', () => {
  // Store original data for restoration
  let originalData;
  const dataPath = path.join(__dirname, '../repository_before/data.json');

  beforeEach(() => {
    // Backup original data
    originalData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    // Load fresh copy for each test
    const testData = JSON.parse(JSON.stringify(originalData));
    fs.writeFileSync(dataPath, JSON.stringify(testData, null, 2));
  });

  afterAll(() => {
    // Restore original data
    fs.writeFileSync(dataPath, JSON.stringify(originalData, null, 2));
  });

  // Helper function to get a plant by ID
  const getPlantById = (plantId) => {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    return data.plants.find((p) => p.id === plantId);
  };

  // Helper function to get a user by ID
  const getUserById = (userId) => {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    return data.users.find((u) => u.id === userId);
  };

  describe('GET /plants', () => {
    test('should return all plants with count', async () => {
      const response = await request(app)
        .get('/plants')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('plants');
      expect(response.body).toHaveProperty('count');
      expect(Array.isArray(response.body.plants)).toBe(true);
      expect(response.body.count).toBe(response.body.plants.length);
    });

    test('should filter by category', async () => {
      const response = await request(app)
        .get('/plants?category=succulent')
        .expect(200);

      // All returned plants should be succulents
      response.body.plants.forEach((plant) => {
        expect(plant.category).toBe('succulent');
      });
    });

    test('should filter by difficulty', async () => {
      const response = await request(app)
        .get('/plants?difficulty=easy')
        .expect(200);

      response.body.plants.forEach((plant) => {
        expect(plant.difficulty).toBe('easy');
      });
    });

    test('should filter by light requirement', async () => {
      const response = await request(app)
        .get('/plants?light=bright')
        .expect(200);

      response.body.plants.forEach((plant) => {
        expect(plant.light).toBe('bright');
      });
    });

    test('should filter pet-safe plants only', async () => {
      const response = await request(app)
        .get('/plants?petSafe=true')
        .expect(200);

      response.body.plants.forEach((plant) => {
        expect(plant.toxic).toBe(false);
      });
    });

    test('should filter in-stock plants only', async () => {
      const response = await request(app)
        .get('/plants?inStock=true')
        .expect(200);

      response.body.plants.forEach((plant) => {
        expect(plant.stock).toBeGreaterThan(0);
      });
    });

    test('should filter by max price', async () => {
      const maxPrice = 25;
      const response = await request(app)
        .get(`/plants?maxPrice=${maxPrice}`)
        .expect(200);

      response.body.plants.forEach((plant) => {
        expect(plant.price).toBeLessThanOrEqual(maxPrice);
      });
    });

    test('should filter by min price', async () => {
      const minPrice = 15;
      const response = await request(app)
        .get(`/plants?minPrice=${minPrice}`)
        .expect(200);

      response.body.plants.forEach((plant) => {
        expect(plant.price).toBeGreaterThanOrEqual(minPrice);
      });
    });

    test('should sort by price ascending', async () => {
      const response = await request(app)
        .get('/plants?sortBy=price&order=asc')
        .expect(200);

      // Check if prices are in ascending order
      for (let i = 1; i < response.body.plants.length; i++) {
        expect(response.body.plants[i].price).toBeGreaterThanOrEqual(
          response.body.plants[i - 1].price,
        );
      }
    });

    test('should sort by price descending', async () => {
      const response = await request(app)
        .get('/plants?sortBy=price&order=desc')
        .expect(200);

      // Check if prices are in descending order
      for (let i = 1; i < response.body.plants.length; i++) {
        expect(response.body.plants[i].price).toBeLessThanOrEqual(
          response.body.plants[i - 1].price,
        );
      }
    });

    test('should sort by name', async () => {
      const response = await request(app)
        .get('/plants?sortBy=name')
        .expect(200);

      // Check if names are in alphabetical order
      for (let i = 1; i < response.body.plants.length; i++) {
        expect(
          response.body.plants[i].name.localeCompare(
            response.body.plants[i - 1].name,
          ),
        ).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('GET /plants/:id', () => {
    test('should return plant details for valid ID', async () => {
      // First get all plants to get a valid ID
      const allPlants = await request(app).get('/plants');
      const plantId = allPlants.body.plants[0].id;

      const response = await request(app).get(`/plants/${plantId}`).expect(200);

      expect(response.body).toHaveProperty('id', plantId);
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('species');
      expect(response.body).toHaveProperty('category');
      expect(response.body).toHaveProperty('difficulty');
      expect(response.body).toHaveProperty('price');
      expect(response.body).toHaveProperty('stock');
      expect(response.body).toHaveProperty('light');
      expect(response.body).toHaveProperty('water');
      expect(response.body).toHaveProperty('humidity');
      expect(response.body).toHaveProperty('toxic');
    });

    test('should return 404 for non-existent plant ID', async () => {
      const response = await request(app)
        .get('/plants/nonexistent123')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Plant not found');
    });
  });

  describe('GET /plants/:id/care-guide', () => {
    test('should return care guide for valid plant', async () => {
      // Find a plant with known properties
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const plant = data.plants.find(
        (p) => p.water === 'weekly' && p.light === 'bright',
      );

      if (plant) {
        const response = await request(app)
          .get(`/plants/${plant.id}/care-guide`)
          .expect(200);

        expect(response.body).toHaveProperty('plant', plant.name);
        expect(response.body).toHaveProperty('species', plant.species);
        expect(response.body.careInstructions).toHaveProperty('watering');
        expect(response.body.careInstructions).toHaveProperty('light');
        expect(response.body.careInstructions).toHaveProperty('humidity');
        expect(response.body.careInstructions).toHaveProperty('difficulty');
        expect(response.body.careInstructions).toHaveProperty('toxicity');

        // Check that watering guidance matches frequency
        expect(response.body.careInstructions.watering).toContain('week');

        // Check toxicity warning
        if (plant.toxic) {
          expect(response.body.careInstructions.toxicity).toContain('Toxic');
        } else {
          expect(response.body.careInstructions.toxicity).toContain(
            'Non-toxic',
          );
        }
      }
    });

    test('should return 404 for non-existent plant', async () => {
      await request(app).get('/plants/nonexistent123/care-guide').expect(404);
    });
  });

  describe('POST /orders', () => {
    test('should create order successfully and deduct stock', async () => {
      // Get a plant with sufficient stock
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const plant = data.plants.find((p) => p.stock >= 2);
      const user = data.users[0];

      if (plant && user) {
        const initialStock = plant.stock;
        const orderData = {
          userId: user.id,
          items: [{ plantId: plant.id, quantity: 2 }],
        };

        const response = await request(app)
          .post('/orders')
          .send(orderData)
          .expect(201);

        // Check response
        expect(response.body).toHaveProperty('id');
        expect(response.body.userId).toBe(user.id);
        expect(response.body.status).toBe('processing');
        expect(response.body.total).toBe(plant.price * 2);
        expect(response.body.items).toHaveLength(1);
        expect(response.body.items[0].plantId).toBe(plant.id);
        expect(response.body.items[0].quantity).toBe(2);

        // Verify stock was deducted
        const updatedPlant = getPlantById(plant.id);
        expect(updatedPlant.stock).toBe(initialStock - 2);
      }
    });

    test('should calculate total correctly for multiple items', async () => {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const plants = data.plants.filter((p) => p.stock >= 1).slice(0, 2);
      const user = data.users[0];

      if (plants.length >= 2 && user) {
        const orderData = {
          userId: user.id,
          items: [
            { plantId: plants[0].id, quantity: 1 },
            { plantId: plants[1].id, quantity: 2 },
          ],
        };

        const expectedTotal = plants[0].price * 1 + plants[1].price * 2;

        const response = await request(app)
          .post('/orders')
          .send(orderData)
          .expect(201);

        expect(response.body.total).toBe(expectedTotal);
      }
    });

    test('should return 400 for missing userId', async () => {
      const response = await request(app)
        .post('/orders')
        .send({ items: [{ plantId: 'test', quantity: 1 }] })
        .expect(400);

      expect(response.body.error).toContain('userId');
    });

    test('should return 400 for empty items array', async () => {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const user = data.users[0];

      const response = await request(app)
        .post('/orders')
        .send({ userId: user.id, items: [] })
        .expect(400);

      expect(response.body.error).toContain('items array');
    });

    test('should return 404 for non-existent user', async () => {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const plant = data.plants[0];

      const response = await request(app)
        .post('/orders')
        .send({
          userId: 'nonexistent_user',
          items: [{ plantId: plant.id, quantity: 1 }],
        })
        .expect(404);

      expect(response.body.error).toContain('User not found');
    });

    test('should return 404 for non-existent plant', async () => {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const user = data.users[0];

      const response = await request(app)
        .post('/orders')
        .send({
          userId: user.id,
          items: [{ plantId: 'nonexistent_plant', quantity: 1 }],
        })
        .expect(404);

      expect(response.body.error).toContain('Plant');
    });

    test('should return 409 for insufficient stock', async () => {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const plant = data.plants.find((p) => p.stock > 0);
      const user = data.users[0];

      if (plant && user) {
        const orderData = {
          userId: user.id,
          items: [{ plantId: plant.id, quantity: plant.stock + 10 }],
        };

        const response = await request(app)
          .post('/orders')
          .send(orderData)
          .expect(409);

        expect(response.body.error).toContain('Insufficient stock');
        expect(response.body.error).toContain(plant.stock.toString());
      }
    });

    test('should default quantity to 1 when quantity is 0', async () => {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const plant = data.plants.find((p) => p.stock >= 1);
      const user = data.users[0];

      if (!plant || !user) {
        return;
      }

      const response = await request(app)
        .post('/orders')
        .send({
          userId: user.id,
          items: [{ plantId: plant.id, quantity: 0 }],
        })
        .expect(201);

      expect(response.body.items[0].quantity).toBe(1);
    });
  });

  describe('GET /orders/:id', () => {
    test('should return order details with enriched items', async () => {
      // First create an order
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const plant = data.plants.find((p) => p.stock >= 1);
      const user = data.users[0];

      if (plant && user) {
        // Create order
        const orderResponse = await request(app)
          .post('/orders')
          .send({
            userId: user.id,
            items: [{ plantId: plant.id, quantity: 1 }],
          })
          .expect(201);

        const orderId = orderResponse.body.id;

        // Get order details
        const response = await request(app)
          .get(`/orders/${orderId}`)
          .expect(200);

        expect(response.body.id).toBe(orderId);
        expect(response.body.userId).toBe(user.id);
        expect(response.body.items).toHaveLength(1);
        expect(response.body.items[0]).toHaveProperty('plantName');
        expect(response.body.items[0]).toHaveProperty('unitPrice');
        expect(response.body.items[0].plantName).toBe(plant.name);
        expect(response.body.items[0].unitPrice).toBe(plant.price);
      }
    });

    test('should return 404 for non-existent order', async () => {
      await request(app).get('/orders/nonexistent_order').expect(404);
    });
  });

  describe('PATCH /orders/:id/status', () => {
    test('should update status from processing to shipped', async () => {
      // Create an order first
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const plant = data.plants.find((p) => p.stock >= 1);
      const user = data.users[0];

      if (plant && user) {
        const orderResponse = await request(app)
          .post('/orders')
          .send({
            userId: user.id,
            items: [{ plantId: plant.id, quantity: 1 }],
          })
          .expect(201);

        const orderId = orderResponse.body.id;
        const initialStock = plant.stock;

        // Update status
        const response = await request(app)
          .patch(`/orders/${orderId}/status`)
          .send({ status: 'shipped' })
          .expect(200);

        expect(response.body.status).toBe('shipped');
        expect(response.body.id).toBe(orderId);

        // Stock should remain deducted (not restored)
        const updatedPlant = getPlantById(plant.id);
        expect(updatedPlant.stock).toBe(initialStock - 1);
      }
    });

    test('should restore stock when cancelling order', async () => {
      // Create an order first
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const plant = data.plants.find((p) => p.stock >= 2);
      const user = data.users[0];

      if (plant && user) {
        const initialStock = plant.stock;
        const orderResponse = await request(app)
          .post('/orders')
          .send({
            userId: user.id,
            items: [{ plantId: plant.id, quantity: 2 }],
          })
          .expect(201);

        const orderId = orderResponse.body.id;

        // Verify stock was deducted
        let updatedPlant = getPlantById(plant.id);
        expect(updatedPlant.stock).toBe(initialStock - 2);

        // Cancel order
        const response = await request(app)
          .patch(`/orders/${orderId}/status`)
          .send({ status: 'cancelled' })
          .expect(200);

        expect(response.body.status).toBe('cancelled');

        // Verify stock was restored
        updatedPlant = getPlantById(plant.id);
        expect(updatedPlant.stock).toBe(initialStock);
      }
    });

    test('should return 409 when trying to change delivered order status', async () => {
      // Create and deliver an order
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const plant = data.plants.find((p) => p.stock >= 1);
      const user = data.users[0];

      if (plant && user) {
        const orderResponse = await request(app)
          .post('/orders')
          .send({
            userId: user.id,
            items: [{ plantId: plant.id, quantity: 1 }],
          })
          .expect(201);

        const orderId = orderResponse.body.id;

        // Update to shipped
        await request(app)
          .patch(`/orders/${orderId}/status`)
          .send({ status: 'shipped' })
          .expect(200);

        // Update to delivered
        await request(app)
          .patch(`/orders/${orderId}/status`)
          .send({ status: 'delivered' })
          .expect(200);

        // Try to change delivered order (should fail)
        const response = await request(app)
          .patch(`/orders/${orderId}/status`)
          .send({ status: 'processing' })
          .expect(409);

        expect(response.body.error).toContain('Cannot change status');
      }
    });

    test('should return 400 for invalid status', async () => {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const plant = data.plants.find((p) => p.stock >= 1);
      const user = data.users[0];

      if (plant && user) {
        const orderResponse = await request(app)
          .post('/orders')
          .send({
            userId: user.id,
            items: [{ plantId: plant.id, quantity: 1 }],
          })
          .expect(201);

        const orderId = orderResponse.body.id;

        const response = await request(app)
          .patch(`/orders/${orderId}/status`)
          .send({ status: 'invalid_status' })
          .expect(400);

        expect(response.body.error).toContain('Invalid status');
      }
    });

    test('should return 404 for non-existent order', async () => {
      await request(app)
        .patch('/orders/nonexistent/status')
        .send({ status: 'cancelled' })
        .expect(404);
    });
  });

  describe('POST /users/:id/collection', () => {
    test('should add plant to user collection', async () => {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const plant = data.plants[0];
      const user = data.users[0];

      // Remove plant from collection if already there
      const initialCollection = [...user.collection];
      const collectionWithoutPlant = initialCollection.filter(
        (id) => id !== plant.id,
      );

      // Update user in data file
      const updatedData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const userIndex = updatedData.users.findIndex((u) => u.id === user.id);
      updatedData.users[userIndex].collection = collectionWithoutPlant;
      fs.writeFileSync(dataPath, JSON.stringify(updatedData, null, 2));

      // Add plant to collection
      const response = await request(app)
        .post(`/users/${user.id}/collection`)
        .send({ plantId: plant.id })
        .expect(201);

      expect(response.body.message).toContain(plant.name);
      expect(response.body.collection).toContain(plant.id);

      // Verify user was updated
      const updatedUser = getUserById(user.id);
      expect(updatedUser.collection).toContain(plant.id);
    });

    test('should return 409 when plant already in collection', async () => {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const user = data.users.find((u) => u.collection.length > 0);

      if (user && user.collection.length > 0) {
        const plantId = user.collection[0];

        const response = await request(app)
          .post(`/users/${user.id}/collection`)
          .send({ plantId })
          .expect(409);

        expect(response.body.error).toContain('already in collection');
      }
    });

    test('should return 404 for non-existent user', async () => {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const plant = data.plants[0];

      await request(app)
        .post('/users/nonexistent/collection')
        .send({ plantId: plant.id })
        .expect(404);
    });

    test('should return 404 for non-existent plant', async () => {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const user = data.users[0];

      await request(app)
        .post(`/users/${user.id}/collection`)
        .send({ plantId: 'nonexistent_plant' })
        .expect(404);
    });

    test('should return 400 for missing plantId', async () => {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const user = data.users[0];

      await request(app)
        .post(`/users/${user.id}/collection`)
        .send({})
        .expect(400);
    });
  });

  describe('GET /users/:id/care-schedule', () => {
    test('should return care schedule sorted by next due date', async () => {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const user = data.users.find((u) =>
        data.careSchedule.some((s) => s.userId === u.id),
      );

      if (user) {
        const response = await request(app)
          .get(`/users/${user.id}/care-schedule`)
          .expect(200);

        expect(response.body).toHaveProperty('schedule');
        expect(response.body).toHaveProperty('count');
        expect(Array.isArray(response.body.schedule)).toBe(true);

        // Check sorting by next due date
        for (let i = 1; i < response.body.schedule.length; i++) {
          const currentDate = new Date(response.body.schedule[i].nextDue);
          const prevDate = new Date(response.body.schedule[i - 1].nextDue);
          expect(currentDate >= prevDate).toBe(true);
        }

        // Check that plant names are included
        response.body.schedule.forEach((task) => {
          expect(task).toHaveProperty('plantName');
        });
      }
    });

    test('should filter overdue tasks', async () => {
      // Create a task with past due date
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const user = data.users[0];
      const plant = data.plants[0];

      // Add a care schedule task with past date
      const pastDate = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const taskId = `task_${Date.now()}`;

      data.careSchedule.push({
        id: taskId,
        userId: user.id,
        plantId: plant.id,
        action: 'water',
        frequency: 'weekly',
        lastCompleted: pastDate,
        nextDue: pastDate,
      });

      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

      // Get overdue tasks
      const response = await request(app)
        .get(`/users/${user.id}/care-schedule?overdue=true`)
        .expect(200);

      // All returned tasks should be overdue
      response.body.schedule.forEach((task) => {
        const dueDate = new Date(task.nextDue);
        const now = new Date();
        expect(dueDate < now).toBe(true);
      });
    });

    test('should return 404 for non-existent user', async () => {
      await request(app).get('/users/nonexistent/care-schedule').expect(404);
    });
  });

  describe('POST /care-schedule/:id/complete', () => {
    test('should update task and calculate next due date for weekly frequency', async () => {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const task = data.careSchedule.find((s) => s.frequency === 'weekly');

      if (task) {
        const initialLastCompleted = task.lastCompleted;
        const initialNextDue = task.nextDue;

        const response = await request(app)
          .post(`/care-schedule/${task.id}/complete`)
          .expect(200);

        expect(response.body.message).toContain('completed');
        expect(response.body).toHaveProperty('nextDue');

        // Verify task was updated in data
        const updatedData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        const updatedTask = updatedData.careSchedule.find(
          (s) => s.id === task.id,
        );

        expect(updatedTask.lastCompleted).not.toBe(initialLastCompleted);
        expect(updatedTask.nextDue).not.toBe(initialNextDue);

        // Check that next due is approximately 7 days from now
        const nextDueDate = new Date(updatedTask.nextDue);
        const now = new Date();
        const daysDiff = (nextDueDate - now) / (1000 * 60 * 60 * 24);
        expect(daysDiff).toBeCloseTo(7, 0); // Approximately 7 days
      }
    });

    test('should handle biweekly frequency correctly', async () => {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

      // Create a biweekly task if none exists
      let task = data.careSchedule.find((s) => s.frequency === 'biweekly');
      if (!task) {
        task = {
          id: `test_biweekly_${Date.now()}`,
          userId: data.users[0].id,
          plantId: data.plants[0].id,
          action: 'water',
          frequency: 'biweekly',
          lastCompleted: new Date().toISOString(),
          nextDue: new Date().toISOString(),
        };
        data.careSchedule.push(task);
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
      }

      const response = await request(app)
        .post(`/care-schedule/${task.id}/complete`)
        .expect(200);

      // Check that next due is approximately 14 days from now
      const nextDueDate = new Date(response.body.nextDue);
      const now = new Date();
      const daysDiff = (nextDueDate - now) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeCloseTo(14, 0); // Approximately 14 days
    });

    test('should return 404 for non-existent task', async () => {
      await request(app)
        .post('/care-schedule/nonexistent_task/complete')
        .expect(404);
    });
  });

  describe('GET /recommendations', () => {
    test('should filter by experience level - beginner', async () => {
      const response = await request(app)
        .get('/recommendations?experience=beginner')
        .expect(200);

      response.body.recommendations.forEach((plant) => {
        expect(plant.difficulty).toBe('easy');
      });
    });

    test('should filter by experience level - intermediate', async () => {
      const response = await request(app)
        .get('/recommendations?experience=intermediate')
        .expect(200);

      response.body.recommendations.forEach((plant) => {
        expect(['easy', 'medium']).toContain(plant.difficulty);
      });
    });

    test('should exclude toxic plants when hasPets=true', async () => {
      const response = await request(app)
        .get('/recommendations?hasPets=true')
        .expect(200);

      response.body.recommendations.forEach((plant) => {
        expect(plant.toxic).toBe(false);
      });
    });

    test('should filter by light level', async () => {
      const lightLevel = 'bright';
      const response = await request(app)
        .get(`/recommendations?lightLevel=${lightLevel}`)
        .expect(200);

      response.body.recommendations.forEach((plant) => {
        expect(plant.light).toBe(lightLevel);
      });
    });

    test('should only return in-stock plants', async () => {
      const response = await request(app).get('/recommendations').expect(200);

      response.body.recommendations.forEach((plant) => {
        expect(plant.stock).toBeGreaterThan(0);
      });
    });

    test('should return criteria in response', async () => {
      const response = await request(app)
        .get(
          '/recommendations?experience=beginner&hasPets=true&lightLevel=bright',
        )
        .expect(200);

      expect(response.body).toHaveProperty('criteria');
      expect(response.body.criteria.experience).toBe('beginner');
      expect(response.body.criteria.petSafe).toBe(true);
      expect(response.body.criteria.light).toBe('bright');
    });

    test('should return maximum 5 recommendations', async () => {
      const response = await request(app).get('/recommendations').expect(200);

      expect(response.body.recommendations.length).toBeLessThanOrEqual(5);
    });
  });
});
