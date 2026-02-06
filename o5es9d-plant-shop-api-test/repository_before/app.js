const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const dataPath = path.join(__dirname, 'data.json');

function loadData() {
    const raw = fs.readFileSync(dataPath, 'utf-8');
    return JSON.parse(raw);
}

function saveData(data) {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

// GET /plants - List all plants with filters
app.get('/plants', (req, res) => {
    const data = loadData();
    let plants = [...data.plants];

    // Filter by category
    if (req.query.category) {
        plants = plants.filter(p => p.category === req.query.category);
    }

    // Filter by difficulty
    if (req.query.difficulty) {
        plants = plants.filter(p => p.difficulty === req.query.difficulty);
    }

    // Filter by light requirement
    if (req.query.light) {
        plants = plants.filter(p => p.light === req.query.light);
    }

    // Filter by pet-safe (non-toxic)
    if (req.query.petSafe === 'true') {
        plants = plants.filter(p => p.toxic === false);
    }

    // Filter by in stock
    if (req.query.inStock === 'true') {
        plants = plants.filter(p => p.stock > 0);
    }

    // Filter by price range
    if (req.query.maxPrice) {
        plants = plants.filter(p => p.price <= parseFloat(req.query.maxPrice));
    }
    if (req.query.minPrice) {
        plants = plants.filter(p => p.price >= parseFloat(req.query.minPrice));
    }

    // Sort
    if (req.query.sortBy) {
        const field = req.query.sortBy;
        const order = req.query.order === 'desc' ? -1 : 1;
        plants.sort((a, b) => {
            if (a[field] < b[field]) return -1 * order;
            if (a[field] > b[field]) return 1 * order;
            return 0;
        });
    }

    res.json({ plants, count: plants.length });
});

// GET /plants/:id - Get a specific plant
app.get('/plants/:id', (req, res) => {
    const data = loadData();
    const plant = data.plants.find(p => p.id === req.params.id);

    if (!plant) {
        return res.status(404).json({ error: 'Plant not found' });
    }

    res.json(plant);
});

// GET /plants/:id/care-guide - Get care instructions
app.get('/plants/:id/care-guide', (req, res) => {
    const data = loadData();
    const plant = data.plants.find(p => p.id === req.params.id);

    if (!plant) {
        return res.status(404).json({ error: 'Plant not found' });
    }

    const waterFrequency = {
        'weekly': 'Water once per week, allowing top inch of soil to dry between waterings.',
        'biweekly': 'Water every two weeks. These plants prefer to dry out between waterings.',
        'daily': 'Keep soil consistently moist but not waterlogged.'
    };

    const lightGuide = {
        'bright': 'Place in a bright location with direct sunlight for at least 6 hours daily.',
        'indirect': 'Bright indirect light is ideal. Avoid direct sun which can scorch leaves.',
        'low': 'Tolerates low light conditions. Perfect for offices or north-facing windows.'
    };

    const humidityGuide = {
        'high': 'Mist regularly or use a humidity tray. Consider a humidifier nearby.',
        'medium': 'Average household humidity is fine. Occasional misting appreciated.',
        'low': 'No special humidity requirements. Adapts well to dry conditions.'
    };

    res.json({
        plant: plant.name,
        species: plant.species,
        careInstructions: {
            watering: waterFrequency[plant.water] || 'Follow standard watering practices.',
            light: lightGuide[plant.light] || 'Provide appropriate light.',
            humidity: humidityGuide[plant.humidity] || 'Normal humidity is fine.',
            difficulty: plant.difficulty,
            toxicity: plant.toxic ? 'Toxic to pets and children. Keep out of reach.' : 'Non-toxic and pet-safe.'
        }
    });
});

// POST /orders - Create an order
app.post('/orders', (req, res) => {
    const { userId, items } = req.body;

    if (!userId || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'userId and items array are required' });
    }

    const data = loadData();

    const user = data.users.find(u => u.id === userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    let total = 0;
    const validatedItems = [];

    for (const item of items) {
        const plant = data.plants.find(p => p.id === item.plantId);
        if (!plant) {
            return res.status(404).json({ error: `Plant ${item.plantId} not found` });
        }

        const quantity = item.quantity || 1;
        if (quantity < 1) {
            return res.status(400).json({ error: 'Quantity must be at least 1' });
        }

        if (plant.stock < quantity) {
            return res.status(409).json({
                error: `Insufficient stock for ${plant.name}. Available: ${plant.stock}`
            });
        }

        total += plant.price * quantity;
        validatedItems.push({ plantId: plant.id, quantity, price: plant.price });
    }

    // Deduct stock
    for (const item of validatedItems) {
        const plant = data.plants.find(p => p.id === item.plantId);
        plant.stock -= item.quantity;
    }

    const order = {
        id: `ord_${Date.now()}`,
        userId,
        items: validatedItems.map(i => ({ plantId: i.plantId, quantity: i.quantity })),
        total: Math.round(total * 100) / 100,
        status: 'processing',
        createdAt: new Date().toISOString()
    };

    data.orders.push(order);
    saveData(data);

    res.status(201).json(order);
});

// GET /orders/:id - Get order details
app.get('/orders/:id', (req, res) => {
    const data = loadData();
    const order = data.orders.find(o => o.id === req.params.id);

    if (!order) {
        return res.status(404).json({ error: 'Order not found' });
    }

    // Enrich with plant details
    const enrichedItems = order.items.map(item => {
        const plant = data.plants.find(p => p.id === item.plantId);
        return {
            ...item,
            plantName: plant ? plant.name : 'Unknown',
            unitPrice: plant ? plant.price : 0
        };
    });

    res.json({ ...order, items: enrichedItems });
});

// PATCH /orders/:id/status - Update order status
app.patch('/orders/:id/status', (req, res) => {
    const { status } = req.body;
    const validStatuses = ['processing', 'shipped', 'delivered', 'cancelled'];

    if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({
            error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
    }

    const data = loadData();
    const order = data.orders.find(o => o.id === req.params.id);

    if (!order) {
        return res.status(404).json({ error: 'Order not found' });
    }

    // Prevent invalid transitions
    if (order.status === 'delivered' || order.status === 'cancelled') {
        return res.status(409).json({
            error: `Cannot change status of ${order.status} order`
        });
    }

    // If cancelling, restore stock
    if (status === 'cancelled') {
        for (const item of order.items) {
            const plant = data.plants.find(p => p.id === item.plantId);
            if (plant) {
                plant.stock += item.quantity;
            }
        }
    }

    order.status = status;
    saveData(data);

    res.json(order);
});

// POST /users/:id/collection - Add plant to user collection
app.post('/users/:id/collection', (req, res) => {
    const { plantId } = req.body;

    if (!plantId) {
        return res.status(400).json({ error: 'plantId is required' });
    }

    const data = loadData();

    const user = data.users.find(u => u.id === req.params.id);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    const plant = data.plants.find(p => p.id === plantId);
    if (!plant) {
        return res.status(404).json({ error: 'Plant not found' });
    }

    if (user.collection.includes(plantId)) {
        return res.status(409).json({ error: 'Plant already in collection' });
    }

    user.collection.push(plantId);
    saveData(data);

    res.status(201).json({
        message: `${plant.name} added to collection`,
        collection: user.collection
    });
});

// GET /users/:id/care-schedule - Get user's care schedule
app.get('/users/:id/care-schedule', (req, res) => {
    const data = loadData();

    const user = data.users.find(u => u.id === req.params.id);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    let schedule = data.careSchedule.filter(s => s.userId === req.params.id);

    // Enrich with plant names
    schedule = schedule.map(s => {
        const plant = data.plants.find(p => p.id === s.plantId);
        return {
            ...s,
            plantName: plant ? plant.name : 'Unknown'
        };
    });

    // Filter overdue if requested
    if (req.query.overdue === 'true') {
        const now = new Date();
        schedule = schedule.filter(s => new Date(s.nextDue) < now);
    }

    // Sort by next due date
    schedule.sort((a, b) => new Date(a.nextDue) - new Date(b.nextDue));

    res.json({ schedule, count: schedule.length });
});

// POST /care-schedule/:id/complete - Mark care task as done
app.post('/care-schedule/:id/complete', (req, res) => {
    const data = loadData();

    const task = data.careSchedule.find(s => s.id === req.params.id);
    if (!task) {
        return res.status(404).json({ error: 'Care task not found' });
    }

    const now = new Date();
    task.lastCompleted = now.toISOString();

    // Calculate next due date based on frequency
    const frequencyDays = {
        'daily': 1,
        'weekly': 7,
        'biweekly': 14,
        'monthly': 30
    };

    const days = frequencyDays[task.frequency] || 7;
    const nextDue = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    task.nextDue = nextDue.toISOString();

    saveData(data);

    const plant = data.plants.find(p => p.id === task.plantId);

    res.json({
        message: `${task.action} completed for ${plant ? plant.name : 'plant'}`,
        nextDue: task.nextDue
    });
});

// GET /recommendations - Get plant recommendations based on criteria
app.get('/recommendations', (req, res) => {
    const data = loadData();
    let plants = [...data.plants];

    // Filter by experience level
    if (req.query.experience) {
        const difficultyMap = {
            'beginner': ['easy'],
            'intermediate': ['easy', 'medium'],
            'expert': ['easy', 'medium', 'hard']
        };
        const allowed = difficultyMap[req.query.experience] || ['easy', 'medium', 'hard'];
        plants = plants.filter(p => allowed.includes(p.difficulty));
    }

    // Filter for pet owners
    if (req.query.hasPets === 'true') {
        plants = plants.filter(p => p.toxic === false);
    }

    // Filter by light availability
    if (req.query.lightLevel) {
        plants = plants.filter(p => p.light === req.query.lightLevel);
    }

    // Only in-stock plants
    plants = plants.filter(p => p.stock > 0);

    // Sort by a recommendation score (easy plants with good stock first)
    plants.sort((a, b) => {
        const diffScore = { easy: 3, medium: 2, hard: 1 };
        return (diffScore[b.difficulty] || 0) - (diffScore[a.difficulty] || 0);
    });

    res.json({
        recommendations: plants.slice(0, 5),
        criteria: {
            experience: req.query.experience || 'any',
            petSafe: req.query.hasPets === 'true',
            light: req.query.lightLevel || 'any'
        }
    });
});

module.exports = app;
