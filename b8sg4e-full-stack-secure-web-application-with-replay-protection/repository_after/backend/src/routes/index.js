const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Secure API with Replay Protection',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
            auth: '/api/auth',
            users: '/api/users',
            payments: '/api/payments',
        },
    });
});

router.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
    });
});

module.exports = router;
