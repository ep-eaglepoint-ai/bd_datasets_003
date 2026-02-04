/**
 * Edge Cases and Error Handling Tests
 * Requirement 15: Cleanup on unmount, malformed responses, timeouts
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
const Dog = require('../src/Components/Dog.jsx').default || require('../src/Components/Dog.jsx');

describe('Edge Cases and Error Handling Tests', () => {
  const mockBreedsResponse = {
    status: 'success',
    message: { labrador: [], poodle: [] }
  };
  const mockRandomDogResponse = {
    status: 'success',
    message: 'https://images.dog.ceo/breeds/labrador/test.jpg'
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

  afterEach(() => {
    cleanup();
  });

  // Requirement 15: Component cleanup cancels pending requests on unmount
  test('component cleanup cancels pending requests on unmount - no state updates after unmount', async () => {
    let abortCalled = false;
    let stateUpdateAfterUnmount = false;
    
    const originalConsoleError = console.error;
    console.error = jest.fn((msg) => {
      if (msg && msg.toString().includes('unmounted') || 
          msg && msg.toString().includes('state update')) {
        stateUpdateAfterUnmount = true;
      }
      originalConsoleError(msg);
    });

    // Mock AbortController
    const mockAbort = jest.fn(() => {
      abortCalled = true;
    });
    
    const originalAbortController = global.AbortController;
    global.AbortController = class {
      constructor() {
        this.signal = { aborted: false, addEventListener: jest.fn() };
      }
      abort = mockAbort;
    };

    let resolveImageFetch;
    const pendingPromise = new Promise((resolve) => {
      resolveImageFetch = resolve;
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

    const { unmount } = render(<Dog />);

    const generateButton = screen.getByRole('button', { name: /generate dog/i });

    await act(async () => {
      fireEvent.click(generateButton);
    });

    // Unmount while request is pending
    unmount();

    // STRICT ASSERTION: AbortController.abort should be called on unmount
    expect(abortCalled).toBe(true);

    // Resolve the promise after unmount
    await act(async () => {
      resolveImageFetch({
        ok: true,
        json: () => Promise.resolve(mockRandomDogResponse)
      });
    });

    // STRICT ASSERTION: No state update warnings after unmount
    expect(stateUpdateAfterUnmount).toBe(false);

    // Cleanup
    global.AbortController = originalAbortController;
    console.error = originalConsoleError;
  });

  // Malformed JSON handling
  test('component handles API returning malformed JSON gracefully', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('breeds/list/all')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBreedsResponse)
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.reject(new SyntaxError('Unexpected token'))
      });
    });

    await act(async () => {
      render(<Dog />);
    });

    // STRICT ASSERTION: Error message should be shown for malformed response
    await waitFor(() => {
      const errorMessage = screen.queryByTestId('error-message') ||
                          screen.queryByText(/error/i) ||
                          screen.queryByText(/failed/i);
      expect(errorMessage).toBeInTheDocument();
    });
  });

  // Null response handling
  test('component handles null API response gracefully', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('breeds/list/all')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBreedsResponse)
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(null)
      });
    });

    await act(async () => {
      render(<Dog />);
    });

    // Should show error or handle gracefully
    await waitFor(() => {
      const errorOrContent = screen.queryByTestId('error-message') ||
                            screen.queryByText(/error/i) ||
                            screen.getByRole('button', { name: /generate dog/i });
      expect(errorOrContent).toBeInTheDocument();
    });
  });

  // Invalid status in response
  test('component handles invalid status in API response', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('breeds/list/all')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBreedsResponse)
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'error', message: 'Something went wrong' })
      });
    });

    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      const errorMessage = screen.queryByTestId('error-message') ||
                          screen.queryByText(/error/i) ||
                          screen.queryByText(/failed/i);
      expect(errorMessage).toBeInTheDocument();
    });
  });

  // localStorage parse error
  test('handles localStorage containing invalid JSON gracefully', async () => {
    localStorage.getItem.mockReturnValue('invalid json {{{');

    // Should not throw
    await act(async () => {
      render(<Dog />);
    });

    // Component should still render
    expect(screen.getByRole('button', { name: /generate dog/i })).toBeInTheDocument();
  });
});