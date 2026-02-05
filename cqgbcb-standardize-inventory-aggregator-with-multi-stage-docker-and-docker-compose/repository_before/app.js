const express = require('express');
const redis = require('redis');
// express: Web framework for the API.
// redis: Client for the cache layer. 
// Note: The app expects REDIS_HOST and REDIS_PORT environment variables.

(async () => {
  const app = express();
  const port = process.env.PORT || 3000;
  
  const client = redis.createClient({
    url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
  });

  client.on('error', (err) => console.error('Redis Client Error', err));

  await client.connect();
  console.log('Connected to Redis successfully');

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', cache: 'connected' });
  });

  app.listen(port, () => {
    console.log(`Inventory Aggregator listening on port ${port}`);
  });
})();

// filename: package.json
{
  "name": "inventory-aggregator",
  "version": "1.0.0",
  "main": "app.js",
  "dependencies": {
    "express": "^4.18.2",
    "redis": "^4.6.10"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  },
  "scripts": {
    "start": "node app.js",
    "dev": "nodemon app.js"
  }
}
