const express = require('express');
const router = express.Router();
const weatherService = require('../services/weatherService');

router.get('/weather', async (req, res) => {
  const { city } = req.query;
  
  if (!city) {
    return res.status(400).json({ message: 'City parameter is required' });
  }

  try {
    const weather = await weatherService.getCurrentWeather(city);
    res.json(weather);
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ message: 'City not found' });
    }
    if (error.status === 503) {
      return res.status(503).json({ message: 'Weather service unavailable' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/forecast', async (req, res) => {
  const { city } = req.query;
  
  if (!city) {
    return res.status(400).json({ message: 'City parameter is required' });
  }

  try {
    const forecast = await weatherService.getForecast(city);
    res.json(forecast);
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ message: 'City not found' });
    }
    if (error.status === 503) {
      return res.status(503).json({ message: 'Weather service unavailable' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
