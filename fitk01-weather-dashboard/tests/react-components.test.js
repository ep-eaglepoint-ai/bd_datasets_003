/**
 * @jest-environment jsdom
 * 
 * React Component Tests using React Testing Library
 * These tests mount real React components and assert observable UI behavior.
 * 
 * Addresses:
 * - Issue #1: Frontend tests must exercise real UI
 * - Issue #2: Missing integration/E2E coverage for Definition of Done
 * - Issue #3: Correct error handling when forecast fails (404 vs 503)
 * - Issue #4: Case-insensitive favorites duplicate check
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../repository_after/frontend/src/App';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock weather data
const mockWeatherData = {
    city: 'London',
    temperature: 15,
    condition: 'Cloudy',
    humidity: 72
};

const mockForecastData = {
    city: 'London',
    forecast: [
        { date: '2024-01-06', temperature: 14, condition: 'Cloudy' },
        { date: '2024-01-07', temperature: 16, condition: 'Sunny' },
        { date: '2024-01-08', temperature: 13, condition: 'Rainy' },
        { date: '2024-01-09', temperature: 15, condition: 'Clear' },
        { date: '2024-01-10', temperature: 17, condition: 'Sunny' }
    ]
};

// Helper to create mock responses
const createMockResponse = (data, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data)
});

describe('Weather Dashboard - Real React Component Tests', () => {
    let localStorageMock;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Setup localStorage mock
        localStorageMock = {
            store: {},
            getItem: jest.fn((key) => localStorageMock.store[key] || null),
            setItem: jest.fn((key, value) => { localStorageMock.store[key] = value; }),
            removeItem: jest.fn((key) => { delete localStorageMock.store[key]; }),
            clear: jest.fn(() => { localStorageMock.store = {}; })
        };
        Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });

        // Default successful mock responses
        mockFetch.mockImplementation((url) => {
            if (url.includes('/api/weather')) {
                return Promise.resolve(createMockResponse(mockWeatherData));
            }
            if (url.includes('/api/forecast')) {
                return Promise.resolve(createMockResponse(mockForecastData));
            }
            return Promise.reject(new Error('Unknown endpoint'));
        });
    });

    afterEach(() => {
        localStorageMock.clear();
    });

    // ============================================================================
    // ISSUE #1: Loading indicator appears during fetch
    // ============================================================================
    describe('Loading Indicator (Req 10) - Real UI Behavior', () => {
        test('loading indicator appears when search is initiated and disappears after fetch', async () => {
            const user = userEvent.setup();

            // Create a delayed response to capture loading state
            let resolveWeather;
            let resolveForecast;
            mockFetch.mockImplementation((url) => {
                if (url.includes('/api/weather')) {
                    return new Promise(resolve => {
                        resolveWeather = () => resolve(createMockResponse(mockWeatherData));
                    });
                }
                if (url.includes('/api/forecast')) {
                    return new Promise(resolve => {
                        resolveForecast = () => resolve(createMockResponse(mockForecastData));
                    });
                }
            });

            render(<App />);

            // Loading should NOT be visible initially
            expect(screen.queryByTestId('loading')).not.toBeInTheDocument();

            // Type and submit search
            const input = screen.getByTestId('city-input');
            const searchButton = screen.getByTestId('search-button');

            await user.type(input, 'London');
            await user.click(searchButton);

            // Loading SHOULD be visible now
            expect(screen.getByTestId('loading')).toBeInTheDocument();
            expect(screen.getByText('Loading...')).toBeInTheDocument();

            // Resolve the fetch promises
            resolveWeather();
            resolveForecast();

            // Wait for loading to disappear
            await waitFor(() => {
                expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
            });
        });

        test('loading spinner element exists within loading indicator', async () => {
            const user = userEvent.setup();

            let resolveWeather;
            mockFetch.mockImplementation((url) => {
                if (url.includes('/api/weather')) {
                    return new Promise(resolve => {
                        resolveWeather = () => resolve(createMockResponse(mockWeatherData));
                    });
                }
                if (url.includes('/api/forecast')) {
                    return Promise.resolve(createMockResponse(mockForecastData));
                }
            });

            render(<App />);

            const input = screen.getByTestId('city-input');
            await user.type(input, 'London');
            await user.click(screen.getByTestId('search-button'));

            // Check spinner exists within loading element
            const loadingElement = screen.getByTestId('loading');
            expect(within(loadingElement).getByText('Loading...')).toBeInTheDocument();

            resolveWeather();
            await waitFor(() => {
                expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
            });
        });
    });

    // ============================================================================
    // ISSUE #1: Temperature toggle updates displayed values without new network calls
    // ============================================================================
    describe('Temperature Toggle (Req 11) - Real UI Behavior', () => {
        test('temperature toggle updates displayed values without making new network calls', async () => {
            const user = userEvent.setup();
            render(<App />);

            // Search for a city
            const input = screen.getByTestId('city-input');
            await user.type(input, 'London');
            await user.click(screen.getByTestId('search-button'));

            // Wait for weather to load
            await waitFor(() => {
                expect(screen.getByTestId('weather-display')).toBeInTheDocument();
            });

            // Record initial fetch count
            const initialFetchCount = mockFetch.mock.calls.length;

            // Temperature should be 15°C initially
            expect(screen.getByTestId('temperature')).toHaveTextContent('15°C');

            // Click Fahrenheit button
            const fahrenheitBtn = screen.getByTestId('fahrenheit-btn');
            await user.click(fahrenheitBtn);

            // Temperature should now be 59°F (15 * 9/5 + 32 = 59)
            expect(screen.getByTestId('temperature')).toHaveTextContent('59°F');

            // NO new network calls should have been made
            expect(mockFetch.mock.calls.length).toBe(initialFetchCount);

            // Toggle back to Celsius
            const celsiusBtn = screen.getByTestId('celsius-btn');
            await user.click(celsiusBtn);

            // Should be back to 15°C
            expect(screen.getByTestId('temperature')).toHaveTextContent('15°C');

            // Still no new network calls
            expect(mockFetch.mock.calls.length).toBe(initialFetchCount);
        });

        test('all forecast temperatures update when unit is toggled', async () => {
            const user = userEvent.setup();
            render(<App />);

            // Search for a city
            await user.type(screen.getByTestId('city-input'), 'London');
            await user.click(screen.getByTestId('search-button'));

            await waitFor(() => {
                expect(screen.getByTestId('forecast')).toBeInTheDocument();
            });

            // Check initial Celsius values
            expect(screen.getByTestId('forecast-temp-0')).toHaveTextContent('14°C');
            expect(screen.getByTestId('forecast-temp-1')).toHaveTextContent('16°C');

            // Toggle to Fahrenheit
            await user.click(screen.getByTestId('fahrenheit-btn'));

            // All temps should be converted: 14°C = 57°F, 16°C = 61°F
            expect(screen.getByTestId('forecast-temp-0')).toHaveTextContent('57°F');
            expect(screen.getByTestId('forecast-temp-1')).toHaveTextContent('61°F');
        });

        test('temperature unit persists to localStorage', async () => {
            const user = userEvent.setup();
            render(<App />);

            // Toggle to Fahrenheit
            await user.click(screen.getByTestId('fahrenheit-btn'));

            // Should be saved to localStorage
            expect(localStorage.setItem).toHaveBeenCalledWith('temperatureUnit', 'fahrenheit');
        });
    });

    // ============================================================================
    // ISSUE #1: Favorites add/remove behavior updates the rendered list
    // ============================================================================
    describe('Favorites Add/Remove (Req 14) - Real UI Behavior', () => {
        test('adding a city to favorites updates the rendered list', async () => {
            const user = userEvent.setup();
            render(<App />);

            // Search for a city
            await user.type(screen.getByTestId('city-input'), 'London');
            await user.click(screen.getByTestId('search-button'));

            await waitFor(() => {
                expect(screen.getByTestId('weather-display')).toBeInTheDocument();
            });

            // Favorites should not exist yet
            expect(screen.queryByTestId('favorites')).not.toBeInTheDocument();

            // Click Add to Favorites button
            await user.click(screen.getByTestId('add-favorite'));

            // Favorites section should now be visible with London
            expect(screen.getByTestId('favorites')).toBeInTheDocument();
            expect(screen.getByTestId('favorite-London')).toBeInTheDocument();
            expect(screen.getByTestId('select-London')).toHaveTextContent('London');
        });

        test('removing a favorite updates the rendered list', async () => {
            const user = userEvent.setup();

            // Pre-populate favorites in localStorage
            localStorageMock.store['favorites'] = JSON.stringify(['London', 'Paris']);

            render(<App />);

            // Both favorites should be visible
            expect(screen.getByTestId('favorites')).toBeInTheDocument();
            expect(screen.getByTestId('favorite-London')).toBeInTheDocument();
            expect(screen.getByTestId('favorite-Paris')).toBeInTheDocument();

            // Remove London
            await user.click(screen.getByTestId('remove-London'));

            // London should be gone, Paris should remain
            expect(screen.queryByTestId('favorite-London')).not.toBeInTheDocument();
            expect(screen.getByTestId('favorite-Paris')).toBeInTheDocument();
        });

        test('clicking a favorite city loads its weather', async () => {
            const user = userEvent.setup();

            // Pre-populate favorites
            localStorageMock.store['favorites'] = JSON.stringify(['Paris']);

            // Mock Paris weather data
            const parisWeather = { ...mockWeatherData, city: 'Paris', temperature: 18 };
            mockFetch.mockImplementation((url) => {
                if (url.includes('/api/weather') && url.includes('Paris')) {
                    return Promise.resolve(createMockResponse(parisWeather));
                }
                if (url.includes('/api/forecast') && url.includes('Paris')) {
                    return Promise.resolve(createMockResponse({ ...mockForecastData, city: 'Paris' }));
                }
                return Promise.resolve(createMockResponse(mockWeatherData));
            });

            render(<App />);

            // Click on Paris favorite
            await user.click(screen.getByTestId('select-Paris'));

            // Should show loading then weather
            await waitFor(() => {
                expect(screen.getByTestId('city-name')).toHaveTextContent('Paris');
            });

            expect(screen.getByTestId('temperature')).toHaveTextContent('18°C');
        });
    });

    // ============================================================================
    // ISSUE #1: Correct error messages appear in the UI
    // ============================================================================
    describe('Error Messages (Req 5, 7, 15) - Real UI Behavior', () => {
        test('displays "City not found" for 404 weather response', async () => {
            const user = userEvent.setup();

            mockFetch.mockImplementation((url) => {
                if (url.includes('/api/weather')) {
                    return Promise.resolve(createMockResponse({ message: 'City not found' }, 404));
                }
                if (url.includes('/api/forecast')) {
                    return Promise.resolve(createMockResponse({ message: 'City not found' }, 404));
                }
            });

            render(<App />);

            await user.type(screen.getByTestId('city-input'), 'InvalidCity');
            await user.click(screen.getByTestId('search-button'));

            await waitFor(() => {
                expect(screen.getByTestId('error')).toBeInTheDocument();
            });

            expect(screen.getByTestId('error')).toHaveTextContent('City not found');
        });

        test('displays "Weather service unavailable" for 503 response', async () => {
            const user = userEvent.setup();

            mockFetch.mockImplementation((url) => {
                if (url.includes('/api/weather')) {
                    return Promise.resolve(createMockResponse({ message: 'Weather service unavailable' }, 503));
                }
                if (url.includes('/api/forecast')) {
                    return Promise.resolve(createMockResponse({ message: 'Weather service unavailable' }, 503));
                }
            });

            render(<App />);

            await user.type(screen.getByTestId('city-input'), 'London');
            await user.click(screen.getByTestId('search-button'));

            await waitFor(() => {
                expect(screen.getByTestId('error')).toBeInTheDocument();
            });

            expect(screen.getByTestId('error')).toHaveTextContent('Weather service unavailable');
        });

        test('displays "Unable to connect to weather service" when backend is unreachable (network failure)', async () => {
            const user = userEvent.setup();

            // Mock fetch to reject with a network error (simulates backend unreachable)
            mockFetch.mockImplementation(() => Promise.reject(new Error('Network error')));

            render(<App />);

            // Verify initial state - no error, no loading
            expect(screen.queryByTestId('error')).not.toBeInTheDocument();
            expect(screen.queryByTestId('loading')).not.toBeInTheDocument();

            // Type a city and submit
            await user.type(screen.getByTestId('city-input'), 'London');
            await user.click(screen.getByTestId('search-button'));

            // Wait for error to appear
            await waitFor(() => {
                expect(screen.getByTestId('error')).toBeInTheDocument();
            });

            // Assert: Clear error message is shown
            expect(screen.getByTestId('error')).toHaveTextContent('Unable to connect to weather service');

            // Assert: Loading indicator is removed (not stuck in loading state)
            expect(screen.queryByTestId('loading')).not.toBeInTheDocument();

            // Assert: App header is still visible (UI did not crash or go blank)
            expect(screen.getByText('Weather Dashboard')).toBeInTheDocument();

            // Assert: Search functionality is still rendered (UI is functional)
            expect(screen.getByTestId('city-input')).toBeInTheDocument();
            expect(screen.getByTestId('search-button')).toBeInTheDocument();
        });

        test('network error message is distinct from 404 and 503 errors', async () => {
            const user = userEvent.setup();

            // Test network error
            mockFetch.mockImplementation(() => Promise.reject(new Error('Network error')));

            const { unmount } = render(<App />);
            await user.type(screen.getByTestId('city-input'), 'London');
            await user.click(screen.getByTestId('search-button'));

            await waitFor(() => {
                expect(screen.getByTestId('error')).toBeInTheDocument();
            });

            const networkErrorMsg = screen.getByTestId('error').textContent;
            unmount();

            // Test 404
            mockFetch.mockImplementation(() => Promise.resolve(createMockResponse({}, 404)));

            const { unmount: unmount404 } = render(<App />);
            await user.type(screen.getByTestId('city-input'), 'InvalidCity');
            await user.click(screen.getByTestId('search-button'));

            await waitFor(() => {
                expect(screen.getByTestId('error')).toBeInTheDocument();
            });

            const msg404 = screen.getByTestId('error').textContent;
            unmount404();

            // Test 503
            mockFetch.mockImplementation(() => Promise.resolve(createMockResponse({}, 503)));

            render(<App />);
            await user.type(screen.getByTestId('city-input'), 'London');
            await user.click(screen.getByTestId('search-button'));

            await waitFor(() => {
                expect(screen.getByTestId('error')).toBeInTheDocument();
            });

            const msg503 = screen.getByTestId('error').textContent;

            // All three error messages must be distinct
            expect(networkErrorMsg).not.toBe(msg404);
            expect(networkErrorMsg).not.toBe(msg503);
            expect(msg404).not.toBe(msg503);

            // Verify expected content
            expect(networkErrorMsg).toContain('Unable to connect');
            expect(msg404).toContain('City not found');
            expect(msg503).toContain('Weather service unavailable');
        });

        test('404 and 503 error messages are visually distinct', async () => {
            const user = userEvent.setup();

            // Test 404 first
            mockFetch.mockImplementation(() => Promise.resolve(createMockResponse({}, 404)));

            const { unmount } = render(<App />);
            await user.type(screen.getByTestId('city-input'), 'InvalidCity');
            await user.click(screen.getByTestId('search-button'));

            await waitFor(() => {
                expect(screen.getByTestId('error')).toBeInTheDocument();
            });

            const msg404 = screen.getByTestId('error').textContent;
            unmount();

            // Test 503
            mockFetch.mockImplementation(() => Promise.resolve(createMockResponse({}, 503)));

            render(<App />);
            await user.type(screen.getByTestId('city-input'), 'London');
            await user.click(screen.getByTestId('search-button'));

            await waitFor(() => {
                expect(screen.getByTestId('error')).toBeInTheDocument();
            });

            const msg503 = screen.getByTestId('error').textContent;

            // Messages must be different
            expect(msg404).not.toBe(msg503);
            expect(msg404).toContain('City not found');
            expect(msg503).toContain('Weather service unavailable');
        });
    });

    // ============================================================================
    // ISSUE #3: Correct error handling when forecast returns 404
    // ============================================================================
    describe('Forecast 404 Error Handling (Req 5, 7) - ISSUE #3 FIX', () => {
        test('shows "City not found" when weather returns 200 but forecast returns 404', async () => {
            const user = userEvent.setup();

            // Weather returns 200, but forecast returns 404
            mockFetch.mockImplementation((url) => {
                if (url.includes('/api/weather')) {
                    return Promise.resolve(createMockResponse(mockWeatherData, 200));
                }
                if (url.includes('/api/forecast')) {
                    return Promise.resolve(createMockResponse({ message: 'City not found' }, 404));
                }
            });

            render(<App />);

            await user.type(screen.getByTestId('city-input'), 'SomeCity');
            await user.click(screen.getByTestId('search-button'));

            await waitFor(() => {
                expect(screen.getByTestId('error')).toBeInTheDocument();
            });

            // Must show "City not found" NOT "Failed to fetch weather data"
            expect(screen.getByTestId('error')).toHaveTextContent('City not found');
            expect(screen.queryByText('Failed to fetch weather data')).not.toBeInTheDocument();
        });

        test('shows "City not found" when forecast returns 404 but weather returns 200', async () => {
            const user = userEvent.setup();

            mockFetch.mockImplementation((url) => {
                if (url.includes('/api/weather')) {
                    return Promise.resolve(createMockResponse(mockWeatherData, 200));
                }
                if (url.includes('/api/forecast')) {
                    return Promise.resolve(createMockResponse({ message: 'City not found' }, 404));
                }
            });

            render(<App />);

            await user.type(screen.getByTestId('city-input'), 'PartialCity');
            await user.click(screen.getByTestId('search-button'));

            await waitFor(() => {
                expect(screen.getByTestId('error')).toBeInTheDocument();
            });

            // Critical: must be "City not found", not generic error
            expect(screen.getByTestId('error')).toHaveTextContent('City not found');
        });

        test('shows "Weather service unavailable" only for 503 errors', async () => {
            const user = userEvent.setup();

            // Weather returns 200, forecast returns 503
            mockFetch.mockImplementation((url) => {
                if (url.includes('/api/weather')) {
                    return Promise.resolve(createMockResponse(mockWeatherData, 200));
                }
                if (url.includes('/api/forecast')) {
                    return Promise.resolve(createMockResponse({ message: 'Weather service unavailable' }, 503));
                }
            });

            render(<App />);

            await user.type(screen.getByTestId('city-input'), 'London');
            await user.click(screen.getByTestId('search-button'));

            await waitFor(() => {
                expect(screen.getByTestId('error')).toBeInTheDocument();
            });

            expect(screen.getByTestId('error')).toHaveTextContent('Weather service unavailable');
        });

        test('distinguishes 404 from 503 correctly for both endpoints', async () => {
            const user = userEvent.setup();

            // Scenario 1: Weather 503, Forecast 200
            mockFetch.mockImplementation((url) => {
                if (url.includes('/api/weather')) {
                    return Promise.resolve(createMockResponse({}, 503));
                }
                if (url.includes('/api/forecast')) {
                    return Promise.resolve(createMockResponse(mockForecastData, 200));
                }
            });

            const { unmount } = render(<App />);
            await user.type(screen.getByTestId('city-input'), 'London');
            await user.click(screen.getByTestId('search-button'));

            await waitFor(() => {
                expect(screen.getByTestId('error')).toBeInTheDocument();
            });
            expect(screen.getByTestId('error')).toHaveTextContent('Weather service unavailable');

            unmount();

            // Scenario 2: Weather 404, Forecast 200
            mockFetch.mockImplementation((url) => {
                if (url.includes('/api/weather')) {
                    return Promise.resolve(createMockResponse({}, 404));
                }
                if (url.includes('/api/forecast')) {
                    return Promise.resolve(createMockResponse(mockForecastData, 200));
                }
            });

            render(<App />);
            await user.type(screen.getByTestId('city-input'), 'Unknown');
            await user.click(screen.getByTestId('search-button'));

            await waitFor(() => {
                expect(screen.getByTestId('error')).toBeInTheDocument();
            });
            expect(screen.getByTestId('error')).toHaveTextContent('City not found');
        });
    });

    // ============================================================================
    // ISSUE #4: Case-insensitive favorites duplicate prevention
    // ============================================================================
    describe('Favorites Case-Insensitive Duplicate Check (Req 14) - ISSUE #4 FIX', () => {
        test('cannot add "London" when "london" is already a favorite', async () => {
            const user = userEvent.setup();

            // Pre-populate with lowercase
            localStorageMock.store['favorites'] = JSON.stringify(['london']);

            // Mock weather returning "London" (capital L)
            mockFetch.mockImplementation((url) => {
                if (url.includes('/api/weather')) {
                    return Promise.resolve(createMockResponse({ ...mockWeatherData, city: 'London' }));
                }
                if (url.includes('/api/forecast')) {
                    return Promise.resolve(createMockResponse(mockForecastData));
                }
            });

            render(<App />);

            // Verify "london" is shown in favorites
            expect(screen.getByTestId('favorite-london')).toBeInTheDocument();

            // Search for London
            await user.type(screen.getByTestId('city-input'), 'London');
            await user.click(screen.getByTestId('search-button'));

            await waitFor(() => {
                expect(screen.getByTestId('weather-display')).toBeInTheDocument();
            });

            // Try to add London to favorites
            await user.click(screen.getByTestId('add-favorite'));

            // Should still only have one favorite (the original "london")
            const favoriteItems = screen.getAllByText(/london/i);
            // The favorite list should have exactly one "london" entry
            expect(screen.getByTestId('favorites')).toBeInTheDocument();
            expect(screen.queryByTestId('favorite-London')).not.toBeInTheDocument();
            expect(screen.getByTestId('favorite-london')).toBeInTheDocument();
        });

        test('cannot add "PARIS" when "Paris" is already a favorite', async () => {
            const user = userEvent.setup();

            // Pre-populate with Paris
            localStorageMock.store['favorites'] = JSON.stringify(['Paris']);

            // Mock weather returning "PARIS" (all caps)
            mockFetch.mockImplementation((url) => {
                if (url.includes('/api/weather')) {
                    return Promise.resolve(createMockResponse({ ...mockWeatherData, city: 'PARIS' }));
                }
                if (url.includes('/api/forecast')) {
                    return Promise.resolve(createMockResponse(mockForecastData));
                }
            });

            render(<App />);

            await user.type(screen.getByTestId('city-input'), 'PARIS');
            await user.click(screen.getByTestId('search-button'));

            await waitFor(() => {
                expect(screen.getByTestId('weather-display')).toBeInTheDocument();
            });

            // Try to add PARIS
            await user.click(screen.getByTestId('add-favorite'));

            // Should not have added another entry
            const favoritesElement = screen.getByTestId('favorites');
            const favoriteItems = within(favoritesElement).getAllByRole('button', { name: /Paris/i });
            // Should have 2 buttons per city (select + remove), so 2 for just Paris
            expect(favoriteItems.length).toBeLessThanOrEqual(2);
        });

        test('adding same city with different casing does not create duplicates', async () => {
            const user = userEvent.setup();

            render(<App />);

            // First, add "London"
            mockFetch.mockImplementation((url) => {
                if (url.includes('/api/weather')) {
                    return Promise.resolve(createMockResponse({ ...mockWeatherData, city: 'London' }));
                }
                if (url.includes('/api/forecast')) {
                    return Promise.resolve(createMockResponse(mockForecastData));
                }
            });

            await user.type(screen.getByTestId('city-input'), 'London');
            await user.click(screen.getByTestId('search-button'));

            await waitFor(() => {
                expect(screen.getByTestId('weather-display')).toBeInTheDocument();
            });

            await user.click(screen.getByTestId('add-favorite'));
            expect(screen.getByTestId('favorite-London')).toBeInTheDocument();

            // Clear input
            await user.clear(screen.getByTestId('city-input'));

            // Now try to add "LONDON"
            mockFetch.mockImplementation((url) => {
                if (url.includes('/api/weather')) {
                    return Promise.resolve(createMockResponse({ ...mockWeatherData, city: 'LONDON' }));
                }
                if (url.includes('/api/forecast')) {
                    return Promise.resolve(createMockResponse(mockForecastData));
                }
            });

            await user.type(screen.getByTestId('city-input'), 'LONDON');
            await user.click(screen.getByTestId('search-button'));

            await waitFor(() => {
                expect(screen.getByTestId('city-name')).toHaveTextContent('LONDON');
            });

            await user.click(screen.getByTestId('add-favorite'));

            // Should still only have "London" in favorites, not "LONDON" as a duplicate
            const favoritesElement = screen.getByTestId('favorites');
            const allFavoriteButtons = within(favoritesElement).getAllByRole('button');
            // 2 buttons per favorite (select + remove), so 2 for one city
            expect(allFavoriteButtons.length).toBe(2);
        });
    });
});

// ============================================================================
// ISSUE #2: Integration/E2E-style user flow tests
// ============================================================================
describe('Weather Dashboard - User Flow Integration Tests', () => {
    let localStorageMock;

    beforeEach(() => {
        jest.clearAllMocks();

        localStorageMock = {
            store: {},
            getItem: jest.fn((key) => localStorageMock.store[key] || null),
            setItem: jest.fn((key, value) => { localStorageMock.store[key] = value; }),
            removeItem: jest.fn((key) => { delete localStorageMock.store[key]; }),
            clear: jest.fn(() => { localStorageMock.store = {}; })
        };
        Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });
    });

    afterEach(() => {
        localStorageMock.clear();
    });

    test('User Flow: Search for "London" → current weather and forecast render', async () => {
        const user = userEvent.setup();

        global.fetch = jest.fn((url) => {
            if (url.includes('/api/weather')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        city: 'London',
                        temperature: 15,
                        condition: 'Cloudy',
                        humidity: 72
                    })
                });
            }
            if (url.includes('/api/forecast')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        city: 'London',
                        forecast: [
                            { date: '2024-01-06', temperature: 14, condition: 'Cloudy' },
                            { date: '2024-01-07', temperature: 16, condition: 'Sunny' },
                            { date: '2024-01-08', temperature: 13, condition: 'Rainy' },
                            { date: '2024-01-09', temperature: 15, condition: 'Clear' },
                            { date: '2024-01-10', temperature: 17, condition: 'Sunny' }
                        ]
                    })
                });
            }
        });

        render(<App />);

        // Step 1: Enter city
        await user.type(screen.getByTestId('city-input'), 'London');

        // Step 2: Submit search
        await user.click(screen.getByTestId('search-button'));

        // Step 3: Wait for results
        await waitFor(() => {
            expect(screen.getByTestId('weather-display')).toBeInTheDocument();
        });

        // Verify current weather renders
        expect(screen.getByTestId('city-name')).toHaveTextContent('London');
        expect(screen.getByTestId('temperature')).toHaveTextContent('15°C');
        expect(screen.getByTestId('condition')).toHaveTextContent('Cloudy');
        expect(screen.getByTestId('humidity')).toHaveTextContent('72%');

        // Verify forecast renders with 5 days
        expect(screen.getByTestId('forecast')).toBeInTheDocument();
        expect(screen.getByTestId('forecast-day-0')).toBeInTheDocument();
        expect(screen.getByTestId('forecast-day-1')).toBeInTheDocument();
        expect(screen.getByTestId('forecast-day-2')).toBeInTheDocument();
        expect(screen.getByTestId('forecast-day-3')).toBeInTheDocument();
        expect(screen.getByTestId('forecast-day-4')).toBeInTheDocument();
    });

    test('User Flow: Search for invalid city → "City not found" message appears', async () => {
        const user = userEvent.setup();

        global.fetch = jest.fn(() => Promise.resolve({
            ok: false,
            status: 404,
            json: () => Promise.resolve({ message: 'City not found' })
        }));

        render(<App />);

        // Enter invalid city
        await user.type(screen.getByTestId('city-input'), 'NonExistentCity123');
        await user.click(screen.getByTestId('search-button'));

        // Error should appear
        await waitFor(() => {
            expect(screen.getByTestId('error')).toBeInTheDocument();
        });

        expect(screen.getByTestId('error')).toHaveTextContent('City not found');

        // Weather display should NOT be present
        expect(screen.queryByTestId('weather-display')).not.toBeInTheDocument();
        expect(screen.queryByTestId('forecast')).not.toBeInTheDocument();
    });

    test('User Flow: Toggle Celsius/Fahrenheit → values convert without refetch', async () => {
        const user = userEvent.setup();
        let fetchCallCount = 0;

        global.fetch = jest.fn((url) => {
            fetchCallCount++;
            if (url.includes('/api/weather')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        city: 'Tokyo',
                        temperature: 20,
                        condition: 'Clear',
                        humidity: 55
                    })
                });
            }
            if (url.includes('/api/forecast')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        city: 'Tokyo',
                        forecast: [
                            { date: '2024-01-06', temperature: 19, condition: 'Clear' },
                            { date: '2024-01-07', temperature: 21, condition: 'Sunny' },
                            { date: '2024-01-08', temperature: 18, condition: 'Cloudy' },
                            { date: '2024-01-09', temperature: 22, condition: 'Sunny' },
                            { date: '2024-01-10', temperature: 20, condition: 'Clear' }
                        ]
                    })
                });
            }
        });

        render(<App />);

        // Search for city
        await user.type(screen.getByTestId('city-input'), 'Tokyo');
        await user.click(screen.getByTestId('search-button'));

        await waitFor(() => {
            expect(screen.getByTestId('weather-display')).toBeInTheDocument();
        });

        const fetchCountAfterSearch = fetchCallCount;

        // Initial temperature in Celsius
        expect(screen.getByTestId('temperature')).toHaveTextContent('20°C');

        // Toggle to Fahrenheit
        await user.click(screen.getByTestId('fahrenheit-btn'));

        // Temperature should be converted (20°C = 68°F)
        expect(screen.getByTestId('temperature')).toHaveTextContent('68°F');

        // Forecast should also be converted (19°C = 66°F)
        expect(screen.getByTestId('forecast-temp-0')).toHaveTextContent('66°F');

        // NO new fetch calls
        expect(fetchCallCount).toBe(fetchCountAfterSearch);

        // Toggle back
        await user.click(screen.getByTestId('celsius-btn'));
        expect(screen.getByTestId('temperature')).toHaveTextContent('20°C');
        expect(fetchCallCount).toBe(fetchCountAfterSearch);
    });

    test('User Flow: Add city to favorites → refresh → city persists', async () => {
        const user = userEvent.setup();

        global.fetch = jest.fn((url) => {
            if (url.includes('/api/weather')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        city: 'Berlin',
                        temperature: 12,
                        condition: 'Rainy',
                        humidity: 80
                    })
                });
            }
            if (url.includes('/api/forecast')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        city: 'Berlin',
                        forecast: [
                            { date: '2024-01-06', temperature: 10, condition: 'Rainy' },
                            { date: '2024-01-07', temperature: 11, condition: 'Cloudy' },
                            { date: '2024-01-08', temperature: 13, condition: 'Clear' },
                            { date: '2024-01-09', temperature: 14, condition: 'Sunny' },
                            { date: '2024-01-10', temperature: 12, condition: 'Cloudy' }
                        ]
                    })
                });
            }
        });

        const { unmount } = render(<App />);

        // Search and add to favorites
        await user.type(screen.getByTestId('city-input'), 'Berlin');
        await user.click(screen.getByTestId('search-button'));

        await waitFor(() => {
            expect(screen.getByTestId('weather-display')).toBeInTheDocument();
        });

        await user.click(screen.getByTestId('add-favorite'));

        // Verify it's in the list
        expect(screen.getByTestId('favorite-Berlin')).toBeInTheDocument();

        // Get the saved value
        const savedFavorites = localStorageMock.store['favorites'];
        expect(savedFavorites).toContain('Berlin');

        // Simulate "refresh" by unmounting and remounting with persisted localStorage
        unmount();

        render(<App />);

        // Berlin should still be in favorites
        expect(screen.getByTestId('favorite-Berlin')).toBeInTheDocument();
    });

    test('User Flow: Click a favorite city → weather loads', async () => {
        const user = userEvent.setup();

        // Pre-populate favorites
        localStorageMock.store['favorites'] = JSON.stringify(['Sydney']);

        global.fetch = jest.fn((url) => {
            if (url.includes('/api/weather') && url.includes('Sydney')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        city: 'Sydney',
                        temperature: 28,
                        condition: 'Sunny',
                        humidity: 45
                    })
                });
            }
            if (url.includes('/api/forecast') && url.includes('Sydney')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        city: 'Sydney',
                        forecast: [
                            { date: '2024-01-06', temperature: 30, condition: 'Sunny' },
                            { date: '2024-01-07', temperature: 29, condition: 'Sunny' },
                            { date: '2024-01-08', temperature: 27, condition: 'Cloudy' },
                            { date: '2024-01-09', temperature: 28, condition: 'Clear' },
                            { date: '2024-01-10', temperature: 31, condition: 'Sunny' }
                        ]
                    })
                });
            }
            return Promise.resolve({
                ok: false,
                status: 404,
                json: () => Promise.resolve({ message: 'City not found' })
            });
        });

        render(<App />);

        // Sydney should be in favorites
        expect(screen.getByTestId('favorite-Sydney')).toBeInTheDocument();

        // Click on Sydney
        await user.click(screen.getByTestId('select-Sydney'));

        // Weather should load
        await waitFor(() => {
            expect(screen.getByTestId('weather-display')).toBeInTheDocument();
        });

        expect(screen.getByTestId('city-name')).toHaveTextContent('Sydney');
        expect(screen.getByTestId('temperature')).toHaveTextContent('28°C');
    });

    test('User Flow: Remove a favorite → it disappears from the list', async () => {
        const user = userEvent.setup();

        // Pre-populate favorites
        localStorageMock.store['favorites'] = JSON.stringify(['Madrid', 'Rome', 'Athens']);

        render(<App />);

        // All three should be visible
        expect(screen.getByTestId('favorite-Madrid')).toBeInTheDocument();
        expect(screen.getByTestId('favorite-Rome')).toBeInTheDocument();
        expect(screen.getByTestId('favorite-Athens')).toBeInTheDocument();

        // Remove Rome
        await user.click(screen.getByTestId('remove-Rome'));

        // Rome should be gone
        expect(screen.queryByTestId('favorite-Rome')).not.toBeInTheDocument();

        // Others should remain
        expect(screen.getByTestId('favorite-Madrid')).toBeInTheDocument();
        expect(screen.getByTestId('favorite-Athens')).toBeInTheDocument();

        // LocalStorage should be updated
        const updatedFavorites = JSON.parse(localStorageMock.store['favorites']);
        expect(updatedFavorites).toEqual(['Madrid', 'Athens']);
        expect(updatedFavorites).not.toContain('Rome');
    });
});
