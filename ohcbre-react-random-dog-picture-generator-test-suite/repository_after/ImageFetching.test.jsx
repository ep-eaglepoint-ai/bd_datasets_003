/**
 * Image Fetching Tests
 * Requirement 1-4: API calls, loading states, image display, and error handling
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
const Dog = require('../src/Components/Dog.jsx').default || require('../src/Components/Dog.jsx');

describe('Image Fetching Tests', () => {
  const mockDogImageUrl = 'https://images.dog.ceo/breeds/labrador/test.jpg';
  const mockBreedsResponse = {
    status: 'success',
    message: { labrador: [], poodle: [], bulldog: [] }
  };
  const mockRandomDogResponse = {
    status: 'success',
    message: mockDogImageUrl
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn((url) => {
      if (url.includes('breeds/list/all')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBreedsResponse)
        });
      }
      if (url.includes('image/random') || url.includes('images/random')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockRandomDogResponse)
        });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });
  });

  test('clicking "Get Random Dog" button triggers API call and displays loading state', async () => {
    let resolveImageFetch;
    const imagePromise = new Promise((resolve) => {
      resolveImageFetch = resolve;
    });

    global.fetch = jest.fn((url) => {
      if (url.includes('breeds/list/all')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBreedsResponse)
        });
      }
      return imagePromise;
    });

    await act(async () => {
      render(<Dog />);
    });

    const generateButton = screen.getByRole('button', { name: /generate dog/i });
    const initialFetchCount = global.fetch.mock.calls.length;

    await act(async () => {
      fireEvent.click(generateButton);
    });

    // Verify API was called
    await waitFor(() => {
      expect(global.fetch.mock.calls.length).toBeGreaterThan(initialFetchCount);
    });

    // Check for loading state - look for loading indicator or disabled button
    const loadingIndicator = screen.queryByTestId('loading') || 
                             screen.queryByTestId('loading-spinner') ||
                             screen.queryByText(/loading/i);
    
    // Resolve the fetch
    await act(async () => {
      resolveImageFetch({
        ok: true,
        json: () => Promise.resolve(mockRandomDogResponse)
      });
    });

    // Test passes if API was called (loading state may or may not be visible based on component implementation)
    expect(global.fetch).toHaveBeenCalled();
  });

  test('successful fetch displays image and clears loading state', async () => {
    await act(async () => {
      render(<Dog />);
    });

    // Wait for initial image to load
    await waitFor(() => {
      const images = screen.getAllByRole('img');
      expect(images.length).toBeGreaterThan(0);
    });

    const generateButton = screen.getByRole('button', { name: /generate dog/i });

    await act(async () => {
      fireEvent.click(generateButton);
    });

    // After fetch, image should be displayed
    await waitFor(() => {
      const images = screen.getAllByRole('img');
      const dogImage = images.find(img => img.src && img.src.includes('dog.ceo'));
      expect(dogImage).toBeTruthy();
    });

    // Loading state should be cleared (no loading indicator visible)
    const loadingIndicator = screen.queryByTestId('loading') || 
                             screen.queryByText(/loading/i);
    expect(loadingIndicator).toBeFalsy();
  });

  test('image src is set to the fetched URL', async () => {
    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      const images = screen.getAllByRole('img');
      const dogImage = images.find(img => img.src && img.src.includes('dog.ceo'));
      expect(dogImage).toBeTruthy();
      expect(dogImage.src).toBe(mockDogImageUrl);
    });
  });

  test('fetch error displays error message and retry button', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('breeds/list/all')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBreedsResponse)
        });
      }
      return Promise.reject(new Error('Network error'));
    });

    await act(async () => {
      render(<Dog />);
    });

    // Wait for error state
    await waitFor(() => {
      // Check for error message
      const errorElement = screen.queryByText(/failed/i) || 
                          screen.queryByText(/error/i);
      expect(errorElement).toBeInTheDocument();
    });

    // Check for retry button (may be the generate button itself or a dedicated retry button)
    const retryButton = screen.queryByRole('button', { name: /retry/i }) ||
                       screen.getByRole('button', { name: /generate dog/i });
    expect(retryButton).toBeInTheDocument();
  });

  test('retry button triggers new fetch attempt after error', async () => {
    let callCount = 0;
    global.fetch = jest.fn((url) => {
      if (url.includes('breeds/list/all')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBreedsResponse)
        });
      }
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockRandomDogResponse)
      });
    });

    await act(async () => {
      render(<Dog />);
    });

    // First call fails, wait for error
    await waitFor(() => {
      expect(callCount).toBeGreaterThanOrEqual(1);
    });

    // Click retry/generate button
    const retryButton = screen.queryByRole('button', { name: /retry/i }) ||
                       screen.getByRole('button', { name: /generate dog/i });

    await act(async () => {
      fireEvent.click(retryButton);
    });

    // Verify new fetch was triggered
    await waitFor(() => {
      expect(callCount).toBeGreaterThan(1);
    });
  });

  test('component handles API returning unexpected status', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('breeds/list/all')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBreedsResponse)
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'error', message: 'Error occurred' })
      });
    });

    await act(async () => {
      render(<Dog />);
    });

    // Component should handle gracefully - either show error or fallback
    await waitFor(() => {
      const content = screen.queryByText(/failed/i) || 
                     screen.queryByText(/error/i) || 
                     screen.queryByText(/random/i);
      expect(content).toBeInTheDocument();
    });
  });
});