/**
 * Loading and Error State Tests
 * Requirements 5-7: Loading indicators, retry mechanism, duplicate request prevention
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
const Dog = require('../src/Components/Dog.jsx').default || require('../src/Components/Dog.jsx');

describe('Loading and Error State Tests', () => {
  const mockBreedsResponse = {
    status: 'success',
    message: { labrador: [], poodle: [] }
  };
  const mockRandomDogResponse = {
    status: 'success',
    message: 'https://images.dog.ceo/breeds/labrador/test.jpg'
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Requirement 6: Loading spinner shows during fetch and hides after completion
  test('loading indicator is VISIBLE during fetch and HIDDEN after completion', async () => {
    let resolvePromise;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    global.fetch = jest.fn((url) => {
      if (url.includes('breeds/list/all')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBreedsResponse)
        });
      }
      return pendingPromise;
    });

    await act(async () => {
      render(<Dog />);
      jest.runAllTimers();
    });

    const generateButton = screen.getByRole('button', { name: /generate dog/i });

    await act(async () => {
      fireEvent.click(generateButton);
      jest.runAllTimers();
    });

    // STRICT ASSERTION: Loading indicator MUST be visible DURING fetch
    const loadingDuringFetch = screen.queryByTestId('loading-indicator') ||
                               screen.queryByTestId('loading-spinner') ||
                               screen.queryByTestId('loading') ||
                               screen.queryByText(/loading/i) ||
                               screen.queryByRole('status');
    expect(loadingDuringFetch).toBeInTheDocument();

    // Complete the fetch
    await act(async () => {
      resolvePromise({
        ok: true,
        json: () => Promise.resolve(mockRandomDogResponse)
      });
      jest.runAllTimers();
    });

    // STRICT ASSERTION: Loading indicator MUST be HIDDEN after completion
    await waitFor(() => {
      const loadingAfterFetch = screen.queryByTestId('loading-indicator') ||
                                screen.queryByTestId('loading-spinner') ||
                                screen.queryByTestId('loading') ||
                                screen.queryByText(/^loading$/i);
      expect(loadingAfterFetch).not.toBeInTheDocument();
    });
  });

  // Requirement 7: Multiple rapid clicks don't trigger multiple simultaneous requests
  test('multiple rapid clicks trigger ONLY ONE request, not multiple simultaneous requests', async () => {
    let activeRequests = 0;
    let maxConcurrentRequests = 0;
    let totalImageRequests = 0;

    global.fetch = jest.fn((url) => {
      if (url.includes('breeds/list/all')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBreedsResponse)
        });
      }
      
      // Track concurrent requests for image fetches only
      activeRequests++;
      totalImageRequests++;
      maxConcurrentRequests = Math.max(maxConcurrentRequests, activeRequests);

      return new Promise((resolve) => {
        setTimeout(() => {
          activeRequests--;
          resolve({
            ok: true,
            json: () => Promise.resolve(mockRandomDogResponse)
          });
        }, 100);
      });
    });

    await act(async () => {
      render(<Dog />);
      jest.runAllTimers();
    });

    const generateButton = screen.getByRole('button', { name: /generate dog/i });
    
    // Reset counters after initial fetch
    activeRequests = 0;
    maxConcurrentRequests = 0;
    totalImageRequests = 0;

    // Rapidly click 5 times
    await act(async () => {
      fireEvent.click(generateButton);
      fireEvent.click(generateButton);
      fireEvent.click(generateButton);
      fireEvent.click(generateButton);
      fireEvent.click(generateButton);
    });

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    // STRICT ASSERTION: Should have at most 1 concurrent request
    // (duplicate requests should be prevented)
    expect(maxConcurrentRequests).toBe(1);
    
    // STRICT ASSERTION: Total requests should be 1, not 5
    expect(totalImageRequests).toBe(1);
  });

  // Timeout triggers error state with timeout message
  test('network timeout triggers error state with timeout message', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';

    global.fetch = jest.fn((url, options) => {
      if (url.includes('breeds/list/all')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBreedsResponse)
        });
      }
      
      return new Promise((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(abortError);
        }, 5000);
        
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            reject(abortError);
          });
        }
      });
    });

    await act(async () => {
      render(<Dog />);
      jest.runAllTimers();
    });

    const generateButton = screen.getByRole('button', { name: /generate dog/i });

    await act(async () => {
      fireEvent.click(generateButton);
    });

    // Advance past timeout threshold (5 seconds)
    await act(async () => {
      jest.advanceTimersByTime(6000);
    });

    // STRICT ASSERTION: Timeout error message MUST be shown
    await waitFor(() => {
      const timeoutMessage = screen.queryByText(/timeout/i) ||
                            screen.queryByText(/timed out/i) ||
                            screen.queryByTestId('error-message');
      expect(timeoutMessage).toBeInTheDocument();
    });
  });

  // Button should be disabled during loading
  test('generate button is disabled during loading to prevent duplicate requests', async () => {
    let resolvePromise;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    global.fetch = jest.fn((url) => {
      if (url.includes('breeds/list/all')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBreedsResponse)
        });
      }
      return pendingPromise;
    });

    await act(async () => {
      render(<Dog />);
      jest.runAllTimers();
    });

    const generateButton = screen.getByRole('button', { name: /generate dog/i });

    await act(async () => {
      fireEvent.click(generateButton);
      jest.runAllTimers();
    });

    // STRICT ASSERTION: Button should be disabled during fetch
    expect(generateButton).toBeDisabled();

    await act(async () => {
      resolvePromise({
        ok: true,
        json: () => Promise.resolve(mockRandomDogResponse)
      });
      jest.runAllTimers();
    });

    // After completion, button should be enabled again
    await waitFor(() => {
      expect(generateButton).not.toBeDisabled();
    });
  });
});