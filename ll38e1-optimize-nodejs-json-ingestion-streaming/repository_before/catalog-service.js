// filename: catalog-service.js
const express = require('express');
const app = express();
// express.text: This middleware buffers the entire body into memory, which we must stop.
app.use(express.text({ limit: '500mb' })); 

/**
 * LEGACY IMPLEMENTATION
 * This function currently fails on files larger than 150MB.
 */
app.post('/upload-catalog', (req, res) => {
    try {
        // CRITICAL BUG: Loading 200MB+ JSON into memory as a string, then parsing.
        const products = JSON.parse(req.body);
        
        let processedCount = 0;
        products.forEach(product => {
            // Simulate database latency
            console.log(`Processing Product: ${product.id}`);
            processedCount++;
        });

        res.status(200).json({ status: 'success', count: processedCount });
    } catch (error) {
        console.error('Ingestion failed:', error.message);
        res.status(500).json({ error: 'Memory limit exceeded or invalid JSON' });
    }
});

app.listen(3000, () => {
    console.log('Catalog Service listening on port 3000');
});