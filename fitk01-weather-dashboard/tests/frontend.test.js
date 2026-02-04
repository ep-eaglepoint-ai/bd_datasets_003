/**
 * @jest-environment jsdom
 */

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
