const API_KEY = process.env.OPENWEATHER_API_KEY || 'mock_api_key';
const BASE_URL = 'https://api.openweathermap.org/data/2.5';
const USE_MOCK = process.env.USE_MOCK === 'true' || !process.env.OPENWEATHER_API_KEY;
const FETCH_TIMEOUT_MS = 10000;

const mockWeatherData = {
  'london': {
    city: 'London',
    temperature: 15,
    condition: 'Cloudy',
    humidity: 72
  },
  'paris': {
    city: 'Paris',
    temperature: 18,
    condition: 'Sunny',
    humidity: 65
  },
  'new york': {
    city: 'New York',
    temperature: 22,
    condition: 'Partly Cloudy',
    humidity: 58
  },
  'tokyo': {
    city: 'Tokyo',
    temperature: 26,
    condition: 'Clear',
    humidity: 70
  },
  'sydney': {
    city: 'Sydney',
    temperature: 20,
    condition: 'Rainy',
    humidity: 80
  }
};

const mockForecastData = {
  'london': {
    city: 'London',
    forecast: generateMockForecast(15)
  },
  'paris': {
    city: 'Paris',
    forecast: generateMockForecast(18)
  },
  'new york': {
    city: 'New York',
    forecast: generateMockForecast(22)
  },
  'tokyo': {
    city: 'Tokyo',
    forecast: generateMockForecast(26)
  },
  'sydney': {
    city: 'Sydney',
    forecast: generateMockForecast(20)
  }
};

function generateMockForecast(baseTemp) {
  const forecast = [];
  const conditions = ['Sunny', 'Cloudy', 'Partly Cloudy', 'Rainy', 'Clear'];
  const today = new Date();
  
  for (let i = 1; i <= 5; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    forecast.push({
      date: date.toISOString().split('T')[0],
      temperature: Math.round(baseTemp + (Math.random() * 6 - 3)),
      condition: conditions[i % conditions.length],
      humidity: Math.round(50 + Math.random() * 40)
    });
  }
  return forecast;
}

async function getCurrentWeather(city) {
  if (USE_MOCK) {
    return getMockCurrentWeather(city);
  }
  return fetchRealWeather(city);
}

async function getForecast(city) {
  if (USE_MOCK) {
    return getMockForecast(city);
  }
  return fetchRealForecast(city);
}

function getMockCurrentWeather(city) {
  const normalizedCity = city.toLowerCase().trim();
  const data = mockWeatherData[normalizedCity];
  
  if (!data) {
    const error = new Error('City not found');
    error.status = 404;
    throw error;
  }
  
  return {
    city: data.city,
    temperature: data.temperature,
    condition: data.condition,
    humidity: data.humidity
  };
}

function getMockForecast(city) {
  const normalizedCity = city.toLowerCase().trim();
  let data = mockForecastData[normalizedCity];
  
  if (!data) {
    const error = new Error('City not found');
    error.status = 404;
    throw error;
  }
  
  data = {
    city: data.city,
    forecast: generateMockForecast(mockWeatherData[normalizedCity].temperature)
  };
  
  return data;
}

async function fetchRealWeather(city) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  
  try {
    const response = await fetch(
      `${BASE_URL}/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`,
      { signal: controller.signal }
    );
    
    if (response.status === 404) {
      const error = new Error('City not found');
      error.status = 404;
      throw error;
    }
    
    if (!response.ok) {
      const error = new Error('Weather service unavailable');
      error.status = 503;
      throw error;
    }
    
    const data = await response.json();
    clearTimeout(timeoutId);
    return {
      city: data.name,
      temperature: Math.round(data.main.temp),
      condition: data.weather[0].main,
      humidity: data.main.humidity
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.status) throw error;
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Weather service unavailable');
      timeoutError.status = 503;
      throw timeoutError;
    }
    const serviceError = new Error('Weather service unavailable');
    serviceError.status = 503;
    throw serviceError;
  }
}

async function fetchRealForecast(city) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  
  try {
    const response = await fetch(
      `${BASE_URL}/forecast?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`,
      { signal: controller.signal }
    );
    
    if (response.status === 404) {
      const error = new Error('City not found');
      error.status = 404;
      throw error;
    }
    
    if (!response.ok) {
      const error = new Error('Weather service unavailable');
      error.status = 503;
      throw error;
    }
    
    const data = await response.json();
    clearTimeout(timeoutId);
    
    const dailyForecasts = [];
    const seenDates = new Set();
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    for (const item of data.list) {
      const date = item.dt_txt.split(' ')[0];
      if (date < tomorrowStr) continue;
      if (!seenDates.has(date) && dailyForecasts.length < 5) {
        seenDates.add(date);
        dailyForecasts.push({
          date: date,
          temperature: Math.round(item.main.temp),
          condition: item.weather[0].main,
          humidity: item.main.humidity
        });
      }
    }
    
    while (dailyForecasts.length < 5) {
      const lastDate = dailyForecasts.length > 0 
        ? new Date(dailyForecasts[dailyForecasts.length - 1].date)
        : new Date(tomorrowStr);
      const nextDate = new Date(lastDate);
      nextDate.setDate(nextDate.getDate() + 1);
      const nextDateStr = nextDate.toISOString().split('T')[0];
      
      if (!seenDates.has(nextDateStr)) {
        seenDates.add(nextDateStr);
        const lastForecast = dailyForecasts[dailyForecasts.length - 1] || { temperature: 20, condition: 'Clear', humidity: 50 };
        dailyForecasts.push({
          date: nextDateStr,
          temperature: lastForecast.temperature,
          condition: lastForecast.condition,
          humidity: lastForecast.humidity
        });
      }
    }
    
    dailyForecasts.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    return {
      city: data.city.name,
      forecast: dailyForecasts.slice(0, 5)
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.status) throw error;
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Weather service unavailable');
      timeoutError.status = 503;
      throw timeoutError;
    }
    const serviceError = new Error('Weather service unavailable');
    serviceError.status = 503;
    throw serviceError;
  }
}

module.exports = {
  getCurrentWeather,
  getForecast,
  getMockCurrentWeather,
  getMockForecast
};
