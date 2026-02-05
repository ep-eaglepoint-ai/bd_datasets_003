const express = require('express');
const app = express();

app.use(express.json());

let products = [];
let nextId = 1;

app.get('/products', (req, res) => {
    const { category } = req.query;
    if (category) {
        const filtered = products.filter(p => p.category === category);
        return res.json(filtered);
    }
    res.json(products);
});

app.post('/products', (req, res) => {
    const { sku, name, price, category, stockLevel } = req.body;

    if (!sku || !name || price === undefined) {
        return res.status(400).json({ error: 'Missing required fields: sku, name, and price are required' });
    }

    if (typeof price !== 'number' || price < 0) {
        return res.status(400).json({ error: 'Price must be a non-negative number' });
    }

    const existingProduct = products.find(p => p.sku === sku);
    if (existingProduct) {
        return res.status(409).json({ error: 'Product with this SKU already exists' });
    }

    const product = {
        id: nextId++,
        sku,
        name,
        price,
        category: category || 'uncategorized',
        stockLevel: stockLevel || 0,
        createdAt: new Date().toISOString()
    };

    products.push(product);
    res.status(201).json(product);
});

app.get('/products/:id', (req, res) => {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid product ID format' });
    }

    const product = products.find(p => p.id === id);
    if (!product) {
        return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
});

app.put('/products/:id', (req, res) => {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid product ID format' });
    }

    const productIndex = products.findIndex(p => p.id === id);
    if (productIndex === -1) {
        return res.status(404).json({ error: 'Product not found' });
    }

    const { sku, name, price, category } = req.body;

    if (sku && sku !== products[productIndex].sku) {
        const existingProduct = products.find(p => p.sku === sku);
        if (existingProduct) {
            return res.status(409).json({ error: 'Product with this SKU already exists' });
        }
    }

    if (price !== undefined && (typeof price !== 'number' || price < 0)) {
        return res.status(400).json({ error: 'Price must be a non-negative number' });
    }

    const updatedProduct = {
        ...products[productIndex],
        ...(sku && { sku }),
        ...(name && { name }),
        ...(price !== undefined && { price }),
        ...(category && { category }),
        updatedAt: new Date().toISOString()
    };

    products[productIndex] = updatedProduct;
    res.json(updatedProduct);
});

app.delete('/products/:id', (req, res) => {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid product ID format' });
    }

    const productIndex = products.findIndex(p => p.id === id);
    if (productIndex === -1) {
        return res.status(404).json({ error: 'Product not found' });
    }

    products.splice(productIndex, 1);
    res.status(204).send();
});

app.post('/products/:id/restock', (req, res) => {
    const id = parseInt(req.params.id);
    const { quantity } = req.body;

    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid product ID format' });
    }

    const product = products.find(p => p.id === id);
    if (!product) {
        return res.status(404).json({ error: 'Product not found' });
    }

    if (typeof quantity !== 'number' || quantity <= 0) {
        return res.status(400).json({ error: 'Quantity must be a positive number' });
    }

    product.stockLevel += quantity;
    res.json({ message: 'Restocked successfully', stockLevel: product.stockLevel });
});

app.post('/products/:id/fulfill', (req, res) => {
    const id = parseInt(req.params.id);
    const { quantity } = req.body;

    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid product ID format' });
    }

    const product = products.find(p => p.id === id);
    if (!product) {
        return res.status(404).json({ error: 'Product not found' });
    }

    if (typeof quantity !== 'number' || quantity <= 0) {
        return res.status(400).json({ error: 'Quantity must be a positive number' });
    }

    if (quantity > product.stockLevel) {
        return res.status(400).json({ error: 'Insufficient stock', available: product.stockLevel });
    }

    product.stockLevel -= quantity;
    res.json({ message: 'Order fulfilled successfully', stockLevel: product.stockLevel });
});

app.get('/inventory/low-stock', (req, res) => {
    const threshold = parseInt(req.query.threshold) || 10;
    const lowStockProducts = products.filter(p => p.stockLevel < threshold);
    res.json(lowStockProducts);
});

const resetData = () => {
    products = [];
    nextId = 1;
};

module.exports = { app, resetData };
