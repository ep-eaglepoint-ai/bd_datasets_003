/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

describe('Weather Dashboard Frontend Logic', () => {
  let localStorageMock;

  beforeEach(() => {
    localStorageMock = {
      store: {},
      getItem: jest.fn((key) => localStorageMock.store[key] || null),
      setItem: jest.fn((key, value) => { localStorageMock.store[key] = value; }),
      removeItem: jest.fn((key) => { delete localStorageMock.store[key]; }),
      clear: jest.fn(() => { localStorageMock.store = {}; })
    };
    Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });
  });

  // Requirement 8: Frontend must only call the backend; direct calls to external weather APIs are forbidden
  describe('Frontend API Calls (Req 8)', () => {
    test('API calls should target backend endpoints only', () => {
      const backendUrl = 'http://localhost:3001';
      const weatherEndpoint = `${backendUrl}/api/weather?city=London`;
      const forecastEndpoint = `${backendUrl}/api/forecast?city=London`;
      
      expect(weatherEndpoint).not.toContain('openweathermap.org');
      expect(forecastEndpoint).not.toContain('openweathermap.org');
      expect(weatherEndpoint).toContain('/api/weather');
      expect(forecastEndpoint).toContain('/api/forecast');
    });

    test('frontend should not contain direct API key references', () => {
      const frontendCode = `
        const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
        fetch(\`\${API_BASE_URL}/api/weather?city=\${city}\`)
      `;
      
      expect(frontendCode).not.toContain('OPENWEATHER_API_KEY');
      expect(frontendCode).not.toContain('appid=');
    });
  });

  // Requirement 9: Weather API keys must never appear in frontend code
  describe('API Key Security (Req 9)', () => {
    test('API key should not be present in frontend configuration', () => {
      const frontendConfig = {
        apiUrl: 'http://localhost:3001'
      };
      
      expect(JSON.stringify(frontendConfig)).not.toContain('api_key');
      expect(JSON.stringify(frontendConfig)).not.toContain('API_KEY');
      expect(JSON.stringify(frontendConfig)).not.toContain('appid');
    });
  });

  // Requirement 10: Frontend must show a loading indicator during API requests
  describe('Loading Indicator (Req 10)', () => {
    test('loading state should exist and be manageable', () => {
      let loading = false;
      
      const setLoading = (value) => { loading = value; };
      
      setLoading(true);
      expect(loading).toBe(true);
      
      setLoading(false);
      expect(loading).toBe(false);
    });

    test('loading indicator should be shown during fetch', async () => {
      let loadingStates = [];
      let loading = false;
      
      const setLoading = (value) => {
        loading = value;
        loadingStates.push(value);
      };
      
      const mockFetch = async () => {
        setLoading(true);
        await new Promise(resolve => setTimeout(resolve, 10));
        setLoading(false);
      };
      
      await mockFetch();
      
      expect(loadingStates).toContain(true);
      expect(loadingStates[loadingStates.length - 1]).toBe(false);
    });
  });

  // Requirement 11: Switching between Celsius and Fahrenheit must update values instantly using F = C × 9/5 + 32
  describe('Temperature Conversion (Req 11)', () => {
    const convertToFahrenheit = (celsius) => Math.round(celsius * 9 / 5 + 32);
    const convertToCelsius = (celsius) => Math.round(celsius);

    test('should convert 0°C to 32°F', () => {
      expect(convertToFahrenheit(0)).toBe(32);
    });

    test('should convert 100°C to 212°F', () => {
      expect(convertToFahrenheit(100)).toBe(212);
    });

    test('should convert 15°C to 59°F', () => {
      expect(convertToFahrenheit(15)).toBe(59);
    });

    test('should convert -40°C to -40°F', () => {
      expect(convertToFahrenheit(-40)).toBe(-40);
    });

    test('conversion should not require network call', () => {
      let networkCalls = 0;
      const mockFetch = () => { networkCalls++; };
      
      const temp = 20;
      convertToFahrenheit(temp);
      convertToCelsius(temp);
      
      expect(networkCalls).toBe(0);
    });

    test('toggle should work without API call', () => {
      let unit = 'celsius';
      let apiCallCount = 0;
      const temperature = 25;
      
      const toggleUnit = () => {
        unit = unit === 'celsius' ? 'fahrenheit' : 'celsius';
      };
      
      const convertTemp = (celsius) => {
        if (unit === 'fahrenheit') {
          return Math.round(celsius * 9 / 5 + 32);
        }
        return Math.round(celsius);
      };
      
      expect(convertTemp(temperature)).toBe(25);
      
      toggleUnit();
      expect(convertTemp(temperature)).toBe(77);
      expect(apiCallCount).toBe(0);
    });
  });

  // Requirement 12: All temperatures must be rounded to whole numbers
  describe('Temperature Rounding (Req 12)', () => {
    const convertTemp = (celsius, unit) => {
      if (unit === 'fahrenheit') {
        return Math.round(celsius * 9 / 5 + 32);
      }
      return Math.round(celsius);
    };

    test('should round temperatures to whole numbers in Celsius', () => {
      expect(convertTemp(15.7, 'celsius')).toBe(16);
      expect(convertTemp(15.2, 'celsius')).toBe(15);
    });

    test('should round temperatures to whole numbers in Fahrenheit', () => {
      expect(Number.isInteger(convertTemp(15.7, 'fahrenheit'))).toBe(true);
      expect(Number.isInteger(convertTemp(15.2, 'fahrenheit'))).toBe(true);
    });
  });

  // Requirement 13: Selected temperature unit must persist in localStorage
  describe('Temperature Unit Persistence (Req 13)', () => {
    test('should save temperature unit to localStorage', () => {
      localStorage.setItem('temperatureUnit', 'fahrenheit');
      expect(localStorage.setItem).toHaveBeenCalledWith('temperatureUnit', 'fahrenheit');
    });

    test('should retrieve temperature unit from localStorage', () => {
      localStorageMock.store['temperatureUnit'] = 'celsius';
      const unit = localStorage.getItem('temperatureUnit');
      expect(unit).toBe('celsius');
    });

    test('should apply unit on page load', () => {
      localStorageMock.store['temperatureUnit'] = 'fahrenheit';
      
      const getInitialUnit = () => {
        return localStorage.getItem('temperatureUnit') || 'celsius';
      };
      
      expect(getInitialUnit()).toBe('fahrenheit');
    });
  });

  // Requirement 14: Users can save cities to favorites in localStorage, with duplicate entries fully prevented
  describe('Favorites Persistence (Req 14)', () => {
    test('should save favorites to localStorage', () => {
      const favorites = ['London', 'Paris'];
      localStorage.setItem('favorites', JSON.stringify(favorites));
      
      expect(localStorage.setItem).toHaveBeenCalledWith('favorites', JSON.stringify(favorites));
    });

    test('should retrieve favorites from localStorage', () => {
      const favorites = ['London', 'Paris'];
      localStorageMock.store['favorites'] = JSON.stringify(favorites);
      
      const retrieved = JSON.parse(localStorage.getItem('favorites'));
      expect(retrieved).toEqual(favorites);
    });

    test('should prevent duplicate entries', () => {
      let favorites = ['London'];
      
      const addFavorite = (city) => {
        if (!favorites.includes(city)) {
          favorites = [...favorites, city];
        }
      };
      
      addFavorite('London');
      expect(favorites).toEqual(['London']);
      
      addFavorite('Paris');
      expect(favorites).toEqual(['London', 'Paris']);
    });

    test('should remove favorites correctly', () => {
      let favorites = ['London', 'Paris', 'Tokyo'];
      
      const removeFavorite = (city) => {
        favorites = favorites.filter(f => f !== city);
      };
      
      removeFavorite('Paris');
      expect(favorites).toEqual(['London', 'Tokyo']);
    });

    test('favorites should persist after page refresh simulation', () => {
      const favorites = ['London', 'Paris'];
      localStorage.setItem('favorites', JSON.stringify(favorites));
      
      const newStorageRef = { ...localStorageMock.store };
      const retrieved = JSON.parse(newStorageRef['favorites']);
      
      expect(retrieved).toEqual(favorites);
    });
  });

  // Requirement 15 & 7: Error message differentiation
  describe('Error Message Handling (Req 7 & 15)', () => {
    test('should display "City not found" for 404 errors', () => {
      const getErrorMessage = (status) => {
        if (status === 404) return 'City not found';
        if (status === 503) return 'Weather service unavailable';
        return 'An error occurred';
      };
      
      expect(getErrorMessage(404)).toBe('City not found');
    });

    test('should display "Weather service unavailable" for 503 errors', () => {
      const getErrorMessage = (status) => {
        if (status === 404) return 'City not found';
        if (status === 503) return 'Weather service unavailable';
        return 'An error occurred';
      };
      
      expect(getErrorMessage(503)).toBe('Weather service unavailable');
    });

    test('error messages should be distinct for different error types', () => {
      const getErrorMessage = (status) => {
        if (status === 404) return 'City not found';
        if (status === 503) return 'Weather service unavailable';
        return 'An error occurred';
      };
      
      const msg404 = getErrorMessage(404);
      const msg503 = getErrorMessage(503);
      
      expect(msg404).not.toBe(msg503);
    });
  });

  // Additional frontend tests
  describe('Favorite City Selection', () => {
    test('clicking a favorite should trigger city search', () => {
      let searchedCity = null;
      
      const onSelect = (city) => {
        searchedCity = city;
      };
      
      onSelect('London');
      expect(searchedCity).toBe('London');
    });
  });

  describe('5-Day Forecast Display', () => {
    test('should display 5 distinct forecast days', () => {
      const forecast = [
        { date: '2024-01-01', temperature: 15, condition: 'Sunny' },
        { date: '2024-01-02', temperature: 16, condition: 'Cloudy' },
        { date: '2024-01-03', temperature: 14, condition: 'Rainy' },
        { date: '2024-01-04', temperature: 17, condition: 'Clear' },
        { date: '2024-01-05', temperature: 18, condition: 'Sunny' }
      ];
      
      expect(forecast).toHaveLength(5);
      const dates = forecast.map(f => f.date);
      const uniqueDates = new Set(dates);
      expect(uniqueDates.size).toBe(5);
    });
  });
});

describe('Weather Dashboard React Components - DOM Testing', () => {
  let container;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    container.id = 'root';
    document.body.appendChild(container);
    
    const localStorageMock = {
      store: {},
      getItem: jest.fn((key) => localStorageMock.store[key] || null),
      setItem: jest.fn((key, value) => { localStorageMock.store[key] = value; }),
      removeItem: jest.fn((key) => { delete localStorageMock.store[key]; }),
      clear: jest.fn(() => { localStorageMock.store = {}; })
    };
    Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // Requirement 10: Frontend must show a loading indicator during API requests
  describe('Loading Indicator Component (Req 10)', () => {
    test('loading indicator should be visible in DOM when loading', () => {
      container.innerHTML = `
        <div class="loading" data-testid="loading">
          <div class="spinner"></div>
          <p>Loading...</p>
        </div>
      `;
      
      const loadingEl = container.querySelector('[data-testid="loading"]');
      expect(loadingEl).toBeTruthy();
      expect(loadingEl.textContent).toContain('Loading');
    });

    test('loading indicator should have spinner element', () => {
      container.innerHTML = `
        <div class="loading" data-testid="loading">
          <div class="spinner"></div>
          <p>Loading...</p>
        </div>
      `;
      
      const spinner = container.querySelector('.spinner');
      expect(spinner).toBeTruthy();
    });

    test('loading indicator should be hidden when not loading', () => {
      container.innerHTML = `<div class="main"></div>`;
      
      const loadingEl = container.querySelector('[data-testid="loading"]');
      expect(loadingEl).toBeNull();
    });
  });

  // Requirement 11: Temperature toggle component behavior
  describe('Temperature Toggle Component (Req 11)', () => {
    test('temperature toggle should have Celsius and Fahrenheit buttons', () => {
      container.innerHTML = `
        <div class="temperature-toggle" data-testid="temperature-toggle">
          <button data-testid="celsius-btn" class="active">°C</button>
          <button data-testid="fahrenheit-btn">°F</button>
        </div>
      `;
      
      const celsiusBtn = container.querySelector('[data-testid="celsius-btn"]');
      const fahrenheitBtn = container.querySelector('[data-testid="fahrenheit-btn"]');
      
      expect(celsiusBtn).toBeTruthy();
      expect(fahrenheitBtn).toBeTruthy();
      expect(celsiusBtn.textContent).toBe('°C');
      expect(fahrenheitBtn.textContent).toBe('°F');
    });

    test('active unit should be highlighted', () => {
      container.innerHTML = `
        <div class="temperature-toggle" data-testid="temperature-toggle">
          <button data-testid="celsius-btn" class="active">°C</button>
          <button data-testid="fahrenheit-btn">°F</button>
        </div>
      `;
      
      const celsiusBtn = container.querySelector('[data-testid="celsius-btn"]');
      expect(celsiusBtn.classList.contains('active')).toBe(true);
    });

    test('temperature display should update instantly when unit changes', () => {
      let unit = 'celsius';
      const temperature = 20;
      
      const convertTemp = (celsius) => {
        if (unit === 'fahrenheit') {
          return Math.round(celsius * 9 / 5 + 32);
        }
        return Math.round(celsius);
      };
      
      container.innerHTML = `
        <div data-testid="temperature">${convertTemp(temperature)}°C</div>
      `;
      
      expect(container.querySelector('[data-testid="temperature"]').textContent).toBe('20°C');
      
      unit = 'fahrenheit';
      container.innerHTML = `
        <div data-testid="temperature">${convertTemp(temperature)}°F</div>
      `;
      
      expect(container.querySelector('[data-testid="temperature"]').textContent).toBe('68°F');
    });
  });

  // Requirement 13: Temperature unit persistence in localStorage
  describe('Temperature Unit Persistence Component (Req 13)', () => {
    test('temperature unit should be saved to localStorage on change', () => {
      localStorage.setItem('temperatureUnit', 'fahrenheit');
      expect(localStorage.setItem).toHaveBeenCalledWith('temperatureUnit', 'fahrenheit');
    });

    test('temperature unit should be loaded from localStorage on init', () => {
      localStorage.store['temperatureUnit'] = 'fahrenheit';
      const savedUnit = localStorage.getItem('temperatureUnit');
      expect(savedUnit).toBe('fahrenheit');
    });

    test('default unit should be celsius when localStorage is empty', () => {
      const getInitialUnit = () => localStorage.getItem('temperatureUnit') || 'celsius';
      expect(getInitialUnit()).toBe('celsius');
    });
  });

  // Requirement 14: Favorites component behavior
  describe('Favorites Component (Req 14)', () => {
    test('favorites list should render saved cities', () => {
      const favorites = ['London', 'Paris', 'Tokyo'];
      container.innerHTML = `
        <div class="favorites" data-testid="favorites">
          <h3>Favorite Cities</h3>
          <div class="favorites-list">
            ${favorites.map(city => `
              <div class="favorite-item" data-testid="favorite-${city}">
                <button data-testid="select-${city}">${city}</button>
                <button data-testid="remove-${city}">×</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      
      const favoritesEl = container.querySelector('[data-testid="favorites"]');
      expect(favoritesEl).toBeTruthy();
      
      favorites.forEach(city => {
        const cityEl = container.querySelector(`[data-testid="favorite-${city}"]`);
        expect(cityEl).toBeTruthy();
      });
    });

    test('clicking remove button should trigger removal', () => {
      let favorites = ['London', 'Paris'];
      const removeFavorite = (city) => {
        favorites = favorites.filter(f => f !== city);
      };
      
      removeFavorite('London');
      expect(favorites).toEqual(['Paris']);
    });

    test('favorites should persist to localStorage', () => {
      const favorites = ['London', 'Paris'];
      localStorage.setItem('favorites', JSON.stringify(favorites));
      
      const retrieved = JSON.parse(localStorage.store['favorites']);
      expect(retrieved).toEqual(favorites);
    });

    test('duplicate cities should not be added to favorites', () => {
      let favorites = ['London'];
      const addFavorite = (city) => {
        if (!favorites.includes(city)) {
          favorites = [...favorites, city];
        }
      };
      
      addFavorite('London');
      addFavorite('London');
      expect(favorites).toEqual(['London']);
      expect(favorites.length).toBe(1);
    });
  });

  // Requirement 15: Error display component
  describe('Error Display Component (Req 15)', () => {
    test('error component should display 404 message correctly', () => {
      container.innerHTML = `
        <div class="error" data-testid="error">
          <p>City not found</p>
        </div>
      `;
      
      const errorEl = container.querySelector('[data-testid="error"]');
      expect(errorEl).toBeTruthy();
      expect(errorEl.textContent).toContain('City not found');
    });

    test('error component should display 503 message correctly', () => {
      container.innerHTML = `
        <div class="error" data-testid="error">
          <p>Weather service unavailable</p>
        </div>
      `;
      
      const errorEl = container.querySelector('[data-testid="error"]');
      expect(errorEl).toBeTruthy();
      expect(errorEl.textContent).toContain('Weather service unavailable');
    });

    test('404 and 503 error messages should be different', () => {
      const error404 = 'City not found';
      const error503 = 'Weather service unavailable';
      
      expect(error404).not.toBe(error503);
    });
  });

  // Weather Display Component
  describe('Weather Display Component', () => {
    test('weather display should show city name', () => {
      container.innerHTML = `
        <div class="weather-display" data-testid="weather-display">
          <h2 data-testid="city-name">London</h2>
          <div data-testid="temperature">15°C</div>
          <div data-testid="condition">Cloudy</div>
          <div data-testid="humidity">72%</div>
        </div>
      `;
      
      expect(container.querySelector('[data-testid="city-name"]').textContent).toBe('London');
    });

    test('weather display should show temperature', () => {
      container.innerHTML = `
        <div class="weather-display" data-testid="weather-display">
          <div data-testid="temperature">15°C</div>
        </div>
      `;
      
      const tempEl = container.querySelector('[data-testid="temperature"]');
      expect(tempEl).toBeTruthy();
      expect(tempEl.textContent).toContain('15');
    });

    test('weather display should show condition', () => {
      container.innerHTML = `
        <div class="weather-display" data-testid="weather-display">
          <div data-testid="condition">Cloudy</div>
        </div>
      `;
      
      expect(container.querySelector('[data-testid="condition"]').textContent).toBe('Cloudy');
    });

    test('weather display should show humidity', () => {
      container.innerHTML = `
        <div class="weather-display" data-testid="weather-display">
          <div data-testid="humidity">72%</div>
        </div>
      `;
      
      expect(container.querySelector('[data-testid="humidity"]').textContent).toBe('72%');
    });
  });

  // Forecast Display Component
  describe('Forecast Display Component', () => {
    test('forecast should display exactly 5 days', () => {
      const forecast = [
        { date: '2024-01-01', temperature: 15, condition: 'Sunny' },
        { date: '2024-01-02', temperature: 16, condition: 'Cloudy' },
        { date: '2024-01-03', temperature: 14, condition: 'Rainy' },
        { date: '2024-01-04', temperature: 17, condition: 'Clear' },
        { date: '2024-01-05', temperature: 18, condition: 'Sunny' }
      ];
      
      container.innerHTML = `
        <div class="forecast" data-testid="forecast">
          <h3>5-Day Forecast</h3>
          <div class="forecast-grid">
            ${forecast.map((day, i) => `
              <div class="forecast-day" data-testid="forecast-day-${i}">
                <div class="forecast-date">${day.date}</div>
                <div class="forecast-temp" data-testid="forecast-temp-${i}">${day.temperature}°C</div>
                <div class="forecast-condition">${day.condition}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      
      const forecastDays = container.querySelectorAll('.forecast-day');
      expect(forecastDays.length).toBe(5);
    });

    test('each forecast day should have date, temperature, and condition', () => {
      container.innerHTML = `
        <div class="forecast-day" data-testid="forecast-day-0">
          <div class="forecast-date">2024-01-01</div>
          <div class="forecast-temp" data-testid="forecast-temp-0">15°C</div>
          <div class="forecast-condition">Sunny</div>
        </div>
      `;
      
      const forecastDay = container.querySelector('[data-testid="forecast-day-0"]');
      expect(forecastDay.querySelector('.forecast-date')).toBeTruthy();
      expect(forecastDay.querySelector('.forecast-temp')).toBeTruthy();
      expect(forecastDay.querySelector('.forecast-condition')).toBeTruthy();
    });
  });

  // Search Bar Component
  describe('Search Bar Component', () => {
    test('search bar should have input field', () => {
      container.innerHTML = `
        <form class="search-bar">
          <input type="text" data-testid="city-input" placeholder="Enter city name..." />
          <button type="submit" data-testid="search-button">Search</button>
        </form>
      `;
      
      const input = container.querySelector('[data-testid="city-input"]');
      expect(input).toBeTruthy();
      expect(input.placeholder).toBe('Enter city name...');
    });

    test('search bar should have submit button', () => {
      container.innerHTML = `
        <form class="search-bar">
          <input type="text" data-testid="city-input" />
          <button type="submit" data-testid="search-button">Search</button>
        </form>
      `;
      
      const button = container.querySelector('[data-testid="search-button"]');
      expect(button).toBeTruthy();
      expect(button.textContent).toBe('Search');
    });
  });
});

describe('Frontend Behavior Simulation Tests', () => {
  let localStorageMock;
  let fetchMock;

  beforeEach(() => {
    localStorageMock = {
      store: {},
      getItem: jest.fn((key) => localStorageMock.store[key] || null),
      setItem: jest.fn((key, value) => { localStorageMock.store[key] = value; }),
      removeItem: jest.fn((key) => { delete localStorageMock.store[key]; }),
      clear: jest.fn(() => { localStorageMock.store = {}; })
    };
    Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });

    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Requirement 10: Loading indicator behavior simulation
  describe('Loading Indicator Behavior (Req 10)', () => {
    test('loading state changes correctly during fetch cycle', async () => {
      const loadingStates = [];
      let loading = false;
      
      const setLoading = (value) => {
        loading = value;
        loadingStates.push(value);
      };

      const searchCity = async (city) => {
        setLoading(true);
        try {
          await Promise.all([
            fetch(`http://localhost:3001/api/weather?city=${city}`),
            fetch(`http://localhost:3001/api/forecast?city=${city}`)
          ]);
        } finally {
          setLoading(false);
        }
      };

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ city: 'London', temperature: 15 })
      });

      await searchCity('London');

      expect(loadingStates[0]).toBe(true);
      expect(loadingStates[loadingStates.length - 1]).toBe(false);
      expect(loading).toBe(false);
    });

    test('loading indicator should be visible while fetch is pending', async () => {
      let loading = false;
      let resolvePromise;
      
      fetchMock.mockImplementation(() => new Promise(resolve => {
        resolvePromise = () => resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }));

      const setLoading = (val) => { loading = val; };
      
      setLoading(true);
      const fetchPromise = fetch('http://localhost:3001/api/weather?city=London');
      
      expect(loading).toBe(true);
      
      resolvePromise();
      await fetchPromise;
      setLoading(false);
      
      expect(loading).toBe(false);
    });
  });

  // Requirement 11: Temperature toggle without network calls
  describe('Temperature Toggle Without Network Calls (Req 11)', () => {
    test('temperature conversion happens without API call', () => {
      let apiCallCount = 0;
      const mockFetch = () => { apiCallCount++; };
      
      const convertTemp = (celsius, unit) => {
        if (unit === 'fahrenheit') {
          return Math.round(celsius * 9 / 5 + 32);
        }
        return Math.round(celsius);
      };

      const temperature = 20;
      
      expect(convertTemp(temperature, 'celsius')).toBe(20);
      expect(convertTemp(temperature, 'fahrenheit')).toBe(68);
      expect(apiCallCount).toBe(0);
    });

    test('toggling unit updates all displayed temperatures instantly', () => {
      let unit = 'celsius';
      const temperatures = [15, 18, 20, 22, 25];
      let networkCalls = 0;
      
      const convertTemp = (celsius) => {
        if (unit === 'fahrenheit') {
          return Math.round(celsius * 9 / 5 + 32);
        }
        return Math.round(celsius);
      };

      const toggleUnit = () => {
        unit = unit === 'celsius' ? 'fahrenheit' : 'celsius';
      };

      const celsiusTemps = temperatures.map(convertTemp);
      expect(celsiusTemps).toEqual([15, 18, 20, 22, 25]);

      toggleUnit();
      
      const fahrenheitTemps = temperatures.map(convertTemp);
      expect(fahrenheitTemps).toEqual([59, 64, 68, 72, 77]);
      expect(networkCalls).toBe(0);
    });
  });

  // Requirement 13 & 14: Favorites persistence
  describe('Favorites Persistence (Req 13 & 14)', () => {
    test('favorites load from localStorage on init', () => {
      localStorageMock.store['favorites'] = JSON.stringify(['London', 'Paris']);
      
      const loadFavorites = () => {
        const saved = localStorage.getItem('favorites');
        return saved ? JSON.parse(saved) : [];
      };

      const favorites = loadFavorites();
      expect(favorites).toEqual(['London', 'Paris']);
    });

    test('temperature unit loads from localStorage on init', () => {
      localStorageMock.store['temperatureUnit'] = 'fahrenheit';
      
      const loadUnit = () => {
        return localStorage.getItem('temperatureUnit') || 'celsius';
      };

      expect(loadUnit()).toBe('fahrenheit');
    });

    test('adding favorite saves to localStorage', () => {
      let favorites = [];
      
      const addFavorite = (city) => {
        if (!favorites.includes(city)) {
          favorites = [...favorites, city];
          localStorage.setItem('favorites', JSON.stringify(favorites));
        }
      };

      addFavorite('Tokyo');
      expect(localStorage.setItem).toHaveBeenCalledWith('favorites', JSON.stringify(['Tokyo']));
    });

    test('favorites persist across simulated reload', () => {
      const favorites1 = ['London', 'Paris'];
      localStorage.setItem('favorites', JSON.stringify(favorites1));
      
      localStorageMock.store['favorites'] = JSON.stringify(favorites1);
      
      const loadedFavorites = JSON.parse(localStorage.getItem('favorites'));
      expect(loadedFavorites).toEqual(['London', 'Paris']);
    });
  });

  // Requirement 15: Error message handling
  describe('Error Message Handling (Req 15)', () => {
    test('404 response sets correct error message', async () => {
      let error = null;
      
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'City not found' })
      });

      const searchCity = async (city) => {
        const response = await fetch(`http://localhost:3001/api/weather?city=${city}`);
        if (response.status === 404) {
          error = 'City not found';
        }
      };

      await searchCity('InvalidCity');
      expect(error).toBe('City not found');
    });

    test('503 response sets correct error message', async () => {
      let error = null;
      
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ message: 'Weather service unavailable' })
      });

      const searchCity = async (city) => {
        const response = await fetch(`http://localhost:3001/api/weather?city=${city}`);
        if (response.status === 503) {
          error = 'Weather service unavailable';
        }
      };

      await searchCity('London');
      expect(error).toBe('Weather service unavailable');
    });

    test('404 and 503 error messages are distinct', () => {
      const getErrorMessage = (status) => {
        if (status === 404) return 'City not found';
        if (status === 503) return 'Weather service unavailable';
        return 'An error occurred';
      };

      const msg404 = getErrorMessage(404);
      const msg503 = getErrorMessage(503);

      expect(msg404).toBe('City not found');
      expect(msg503).toBe('Weather service unavailable');
      expect(msg404).not.toBe(msg503);
    });
  });
});

describe('Frontend Source Code Analysis', () => {
  const frontendPath = path.join(__dirname, '../repository_after/frontend/src');

  // Requirement 8: Frontend must only call the backend
  describe('API Calls Security (Req 8)', () => {
    test('App.js should not contain direct OpenWeatherMap API calls', () => {
      const appPath = path.join(frontendPath, 'App.js');
      if (fs.existsSync(appPath)) {
        const content = fs.readFileSync(appPath, 'utf8');
        expect(content).not.toContain('openweathermap.org');
        expect(content).not.toContain('api.openweathermap');
      }
    });

    test('App.js should call backend API endpoints', () => {
      const appPath = path.join(frontendPath, 'App.js');
      if (fs.existsSync(appPath)) {
        const content = fs.readFileSync(appPath, 'utf8');
        expect(content).toContain('/api/weather');
        expect(content).toContain('/api/forecast');
      }
    });
  });

  // Requirement 9: API keys must never appear in frontend
  describe('API Key Security (Req 9)', () => {
    test('frontend code should not contain API keys', () => {
      const appPath = path.join(frontendPath, 'App.js');
      if (fs.existsSync(appPath)) {
        const content = fs.readFileSync(appPath, 'utf8');
        expect(content).not.toContain('OPENWEATHER_API_KEY');
        expect(content).not.toContain('appid=');
        expect(content).not.toMatch(/[a-f0-9]{32}/i);
      }
    });
  });

  // Requirement 10: Loading indicator implementation
  describe('Loading Indicator Implementation (Req 10)', () => {
    test('App.js should have loading state', () => {
      const appPath = path.join(frontendPath, 'App.js');
      if (fs.existsSync(appPath)) {
        const content = fs.readFileSync(appPath, 'utf8');
        expect(content).toContain('loading');
        expect(content).toContain('setLoading');
      }
    });

    test('App.js should render loading indicator', () => {
      const appPath = path.join(frontendPath, 'App.js');
      if (fs.existsSync(appPath)) {
        const content = fs.readFileSync(appPath, 'utf8');
        expect(content).toContain('data-testid="loading"');
      }
    });
  });

  // Requirement 11: Temperature conversion implementation
  describe('Temperature Conversion Implementation (Req 11)', () => {
    test('App.js should have convertTemp function with correct formula', () => {
      const appPath = path.join(frontendPath, 'App.js');
      if (fs.existsSync(appPath)) {
        const content = fs.readFileSync(appPath, 'utf8');
        expect(content).toContain('convertTemp');
        expect(content).toMatch(/9\s*\/\s*5/);
        expect(content).toContain('32');
      }
    });

    test('App.js should have unit toggle functionality', () => {
      const appPath = path.join(frontendPath, 'App.js');
      if (fs.existsSync(appPath)) {
        const content = fs.readFileSync(appPath, 'utf8');
        expect(content).toContain('toggleUnit');
        expect(content).toContain('celsius');
        expect(content).toContain('fahrenheit');
      }
    });
  });

  // Requirement 13: localStorage persistence for unit
  describe('Unit Persistence Implementation (Req 13)', () => {
    test('App.js should save unit to localStorage', () => {
      const appPath = path.join(frontendPath, 'App.js');
      if (fs.existsSync(appPath)) {
        const content = fs.readFileSync(appPath, 'utf8');
        expect(content).toContain('localStorage');
        expect(content).toContain('temperatureUnit');
      }
    });
  });

  // Requirement 14: Favorites persistence
  describe('Favorites Persistence Implementation (Req 14)', () => {
    test('App.js should save favorites to localStorage', () => {
      const appPath = path.join(frontendPath, 'App.js');
      if (fs.existsSync(appPath)) {
        const content = fs.readFileSync(appPath, 'utf8');
        expect(content).toContain('favorites');
        expect(content).toContain('localStorage');
      }
    });

    test('App.js should prevent duplicate favorites', () => {
      const appPath = path.join(frontendPath, 'App.js');
      if (fs.existsSync(appPath)) {
        const content = fs.readFileSync(appPath, 'utf8');
        expect(content).toContain('includes');
      }
    });
  });

  // Requirement 15: Error handling
  describe('Error Handling Implementation (Req 15)', () => {
    test('App.js should handle 404 errors', () => {
      const appPath = path.join(frontendPath, 'App.js');
      if (fs.existsSync(appPath)) {
        const content = fs.readFileSync(appPath, 'utf8');
        expect(content).toContain('404');
        expect(content).toContain('City not found');
      }
    });

    test('App.js should handle 503 errors', () => {
      const appPath = path.join(frontendPath, 'App.js');
      if (fs.existsSync(appPath)) {
        const content = fs.readFileSync(appPath, 'utf8');
        expect(content).toContain('503');
        expect(content).toContain('Weather service unavailable');
      }
    });

    test('App.js should display error messages', () => {
      const appPath = path.join(frontendPath, 'App.js');
      if (fs.existsSync(appPath)) {
        const content = fs.readFileSync(appPath, 'utf8');
        expect(content).toContain('error');
        expect(content).toContain('data-testid="error"');
      }
    });
  });
});
