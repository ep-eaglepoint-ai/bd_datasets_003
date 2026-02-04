const request = require('supertest');
const path = require('path');

const app = require(path.join(__dirname, '../repository_after/backend/server.js'));
const weatherService = require(path.join(__dirname, '../repository_after/backend/services/weatherService.js'));

describe('Weather Dashboard Backend API', () => {
  
  // Requirement 1: GET /api/weather?city={name} must return city name, temperature, weather condition, and humidity as JSON with HTTP 200
  describe('GET /api/weather - Success Response (Req 1)', () => {
    test('should return city name, temperature, condition, and humidity with HTTP 200 for valid city', async () => {
      const response = await request(app)
        .get('/api/weather?city=London')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('city');
      expect(response.body).toHaveProperty('temperature');
      expect(response.body).toHaveProperty('condition');
      expect(response.body).toHaveProperty('humidity');
      expect(response.body.city).toBe('London');
    });
  });

  // Requirement 2: Temperature must be a number, humidity an integer between 0–100, and condition a non-empty string
  describe('GET /api/weather - Data Types Validation (Req 2)', () => {
    test('temperature should be a number', async () => {
      const response = await request(app)
        .get('/api/weather?city=London')
        .expect(200);

      expect(typeof response.body.temperature).toBe('number');
    });

    test('humidity should be an integer between 0 and 100', async () => {
      const response = await request(app)
        .get('/api/weather?city=London')
        .expect(200);

      expect(Number.isInteger(response.body.humidity)).toBe(true);
      expect(response.body.humidity).toBeGreaterThanOrEqual(0);
      expect(response.body.humidity).toBeLessThanOrEqual(100);
    });

    test('condition should be a non-empty string', async () => {
      const response = await request(app)
        .get('/api/weather?city=London')
        .expect(200);

      expect(typeof response.body.condition).toBe('string');
      expect(response.body.condition.length).toBeGreaterThan(0);
    });
  });

  // Requirement 3: GET /api/forecast?city={name} must return exactly 5 daily forecasts with unique dates in chronological order
  describe('GET /api/forecast - 5-Day Forecast (Req 3)', () => {
    test('should return exactly 5 daily forecasts', async () => {
      const response = await request(app)
        .get('/api/forecast?city=London')
        .expect(200);

      expect(response.body).toHaveProperty('forecast');
      expect(response.body.forecast).toHaveLength(5);
    });

    test('forecasts should have unique dates in chronological order', async () => {
      const response = await request(app)
        .get('/api/forecast?city=London')
        .expect(200);

      const dates = response.body.forecast.map(f => f.date);
      const uniqueDates = [...new Set(dates)];
      
      expect(dates).toHaveLength(uniqueDates.length);
      
      for (let i = 1; i < dates.length; i++) {
        expect(new Date(dates[i]).getTime()).toBeGreaterThan(new Date(dates[i-1]).getTime());
      }
    });
  });

  // Requirement 4: Forecasts must represent 5 distinct future days—no duplicates, no missing days
  describe('GET /api/forecast - Distinct Future Days (Req 4)', () => {
    test('forecasts should represent 5 distinct days', async () => {
      const response = await request(app)
        .get('/api/forecast?city=London')
        .expect(200);

      const dates = response.body.forecast.map(f => f.date);
      const uniqueDates = new Set(dates);
      
      expect(uniqueDates.size).toBe(5);
    });

    test('each forecast day should have date, temperature, condition, humidity', async () => {
      const response = await request(app)
        .get('/api/forecast?city=London')
        .expect(200);

      response.body.forecast.forEach(day => {
        expect(day).toHaveProperty('date');
        expect(day).toHaveProperty('temperature');
        expect(day).toHaveProperty('condition');
        expect(typeof day.temperature).toBe('number');
      });
    });
  });

  // Requirement 5: Invalid cities must return HTTP 404 with message "City not found"
  describe('GET /api/weather - Invalid City (Req 5)', () => {
    test('should return 404 with "City not found" for invalid city', async () => {
      const response = await request(app)
        .get('/api/weather?city=InvalidCityXYZ123')
        .expect(404);

      expect(response.body.message).toBe('City not found');
    });

    test('should return 404 for forecast with invalid city', async () => {
      const response = await request(app)
        .get('/api/forecast?city=InvalidCityXYZ123')
        .expect(404);

      expect(response.body.message).toBe('City not found');
    });
  });

  // Requirement 6: Backend must return HTTP 503 with message "Weather service unavailable" when the weather provider fails
  describe('GET /api/weather - Service Unavailable (Req 6)', () => {
    test('weatherService should throw 503 error when service is unavailable', () => {
      const originalGetWeather = weatherService.getMockCurrentWeather;
      
      weatherService.getMockCurrentWeather = jest.fn(() => {
        const error = new Error('Weather service unavailable');
        error.status = 503;
        throw error;
      });

      expect(() => {
        weatherService.getMockCurrentWeather('London');
      }).toThrow('Weather service unavailable');

      weatherService.getMockCurrentWeather = originalGetWeather;
    });
  });

  // Requirement 7: 404 and 503 responses must be clearly distinguishable
  describe('Error Response Differentiation (Req 7)', () => {
    test('404 error should have specific message "City not found"', async () => {
      const response = await request(app)
        .get('/api/weather?city=NonExistentCity999')
        .expect(404);

      expect(response.body.message).toBe('City not found');
    });

    test('different status codes for different error types', async () => {
      const invalidCityResponse = await request(app)
        .get('/api/weather?city=InvalidCityXYZ123');
      
      expect(invalidCityResponse.status).toBe(404);
      expect(invalidCityResponse.body.message).not.toBe('Weather service unavailable');
    });
  });

  // Requirement 12: All temperatures must be rounded to whole numbers
  describe('Temperature Rounding (Req 12)', () => {
    test('current weather temperature should be a whole number', async () => {
      const response = await request(app)
        .get('/api/weather?city=London')
        .expect(200);

      expect(Number.isInteger(response.body.temperature)).toBe(true);
    });

    test('forecast temperatures should be whole numbers', async () => {
      const response = await request(app)
        .get('/api/forecast?city=London')
        .expect(200);

      response.body.forecast.forEach(day => {
        expect(Number.isInteger(day.temperature)).toBe(true);
      });
    });
  });

  // Additional backend tests
  describe('Missing City Parameter', () => {
    test('should return 400 when city parameter is missing for weather', async () => {
      const response = await request(app)
        .get('/api/weather')
        .expect(400);

      expect(response.body.message).toBe('City parameter is required');
    });

    test('should return 400 when city parameter is missing for forecast', async () => {
      const response = await request(app)
        .get('/api/forecast')
        .expect(400);

      expect(response.body.message).toBe('City parameter is required');
    });
  });

  describe('Multiple Valid Cities', () => {
    test('should return weather for Paris', async () => {
      const response = await request(app)
        .get('/api/weather?city=Paris')
        .expect(200);

      expect(response.body.city).toBe('Paris');
    });

    test('should return weather for Tokyo', async () => {
      const response = await request(app)
        .get('/api/weather?city=Tokyo')
        .expect(200);

      expect(response.body.city).toBe('Tokyo');
    });

    test('should return forecast for New York', async () => {
      const response = await request(app)
        .get('/api/forecast?city=New York')
        .expect(200);

      expect(response.body.city).toBe('New York');
      expect(response.body.forecast).toHaveLength(5);
    });
  });
});
