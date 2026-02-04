/**
 * Image Fetching Tests
 * Requirements 1-4: API calls, loading states, image display, error handling
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
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockRandomDogResponse)
      });
    });
  });

  // Requirement 1: Test that clicking "Get Random Dog" triggers API call and displays loading state
  test('clicking generate button triggers API call and displays loading state', async () => {
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

    // Find generate button (component uses "Generate Dog")
    const generateButton = screen.getByRole('button', { name: /generate dog/i });
    const fetchCallsBefore = global.fetch.mock.calls.length;

    await act(async () => {
      fireEvent.click(generateButton);
    });

    // STRICT ASSERTION: Loading indicator MUST be visible during fetch
    const loadingIndicator = screen.queryByTestId('loading-indicator') ||
                             screen.queryByTestId('loading-spinner') ||
                             screen.queryByTestId('loading') ||
                             screen.queryByText(/loading/i) ||
                             screen.queryByRole('status');
    
    // Assert loading indicator is shown
    expect(loadingIndicator).toBeInTheDocument();

    // Assert API was called
    expect(global.fetch.mock.calls.length).toBeGreaterThan(fetchCallsBefore);
    
    const imageApiCall = global.fetch.mock.calls.find(
      call => call[0].includes('image/random') || call[0].includes('images/random')
    );
    expect(imageApiCall).toBeTruthy();

    // Resolve fetch
    await act(async () => {
      resolveImageFetch({
        ok: true,
        json: () => Promise.resolve(mockRandomDogResponse)
      });
    });
  });

  // Requirement 2: Test that successful fetch displays image and clears loading state
  test('successful fetch displays image and clears loading state', async () => {
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

    await act(async () => {
      fireEvent.click(generateButton);
    });

    // Complete the fetch
    await act(async () => {
      resolveImageFetch({
        ok: true,
        json: () => Promise.resolve(mockRandomDogResponse)
      });
    });

    // STRICT ASSERTION: Loading indicator MUST be gone after fetch completes
    await waitFor(() => {
      const loadingIndicator = screen.queryByTestId('loading-indicator') ||
                               screen.queryByTestId('loading-spinner') ||
                               screen.queryByTestId('loading') ||
                               screen.queryByText(/loading/i);
      expect(loadingIndicator).not.toBeInTheDocument();
    });

    // STRICT ASSERTION: Image MUST be displayed with correct URL
    await waitFor(() => {
      const images = screen.getAllByRole('img');
      const dogImage = images.find(img => img.src === mockDogImageUrl);
      expect(dogImage).toBeInTheDocument();
    });
  });

  // Requirement 3: Test that image src is set to the fetched URL
  test('image src is set correctly to the fetched URL', async () => {
    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      const images = screen.getAllByRole('img');
      const dogImage = images.find(img => img.src === mockDogImageUrl);
      expect(dogImage).toBeTruthy();
      expect(dogImage.src).toBe(mockDogImageUrl);
    });
  });

  // Requirement 4: Test that fetch error displays error message and retry button
  test('fetch error displays error message AND dedicated retry button', async () => {
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

    // STRICT ASSERTION: Error message MUST be displayed
    await waitFor(() => {
      const errorMessage = screen.queryByTestId('error-message') ||
                          screen.queryByText(/failed/i) ||
                          screen.queryByText(/error/i);
      expect(errorMessage).toBeInTheDocument();
    });

    // STRICT ASSERTION: Dedicated retry button MUST appear on error
    await waitFor(() => {
      const retryButton = screen.queryByRole('button', { name: /retry/i }) ||
                         screen.queryByTestId('retry-button');
      expect(retryButton).toBeInTheDocument();
    });
  });

  // Requirement 5: Test that retry button triggers new fetch attempt
  test('clicking retry button triggers new fetch attempt', async () => {
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

    // Wait for error state
    await waitFor(() => {
      expect(callCount).toBe(1);
    });

    // Find and click the DEDICATED retry button (not the generate button)
    const retryButton = await waitFor(() => {
      const btn = screen.queryByRole('button', { name: /retry/i }) ||
                  screen.queryByTestId('retry-button');
      expect(btn).toBeInTheDocument();
      return btn;
    });

    const callCountBeforeRetry = callCount;

    await act(async () => {
      fireEvent.click(retryButton);
    });

    // STRICT ASSERTION: Clicking retry MUST trigger a NEW fetch
    await waitFor(() => {
      expect(callCount).toBeGreaterThan(callCountBeforeRetry);
    });

    // After successful retry, image should be displayed
    await waitFor(() => {
      const images = screen.getAllByRole('img');
      const dogImage = images.find(img => img.src === mockDogImageUrl);
      expect(dogImage).toBeInTheDocument();
    });
  });

  // Additional: Network vs API error shows distinct messages
  test('network error shows network-specific error message', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('breeds/list/all')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBreedsResponse)
        });
      }
      return Promise.reject(new Error('Failed to fetch'));
    });

    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      const errorText = screen.queryByText(/network/i) ||
                       screen.queryByText(/connection/i) ||
                       screen.queryByText(/failed to fetch/i);
      expect(errorText).toBeInTheDocument();
    });
  });

  test('API error (non-ok response) shows API-specific error message', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('breeds/list/all')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBreedsResponse)
        });
      }
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ status: 'error', message: 'Server error' })
      });
    });

    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      const errorText = screen.queryByText(/api/i) ||
                       screen.queryByText(/server/i) ||
                       screen.queryByText(/failed/i);
      expect(errorText).toBeInTheDocument();
    });
  });
});