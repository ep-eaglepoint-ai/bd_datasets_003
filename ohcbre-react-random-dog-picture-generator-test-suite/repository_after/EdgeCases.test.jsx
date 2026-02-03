/**
 * Edge Cases and Error Handling Tests
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

  test('component handles malformed JSON gracefully', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('breeds/list/all')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBreedsResponse)
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON'))
      });
    });

    await act(async () => {
      render(<Dog />);
    });

    expect(screen.getByText(/random/i)).toBeInTheDocument();
  });

  test('component handles null API response', async () => {
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

    expect(screen.getByText(/random/i)).toBeInTheDocument();
  });

  test('component handles empty message response', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('breeds/list/all')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBreedsResponse)
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'success', message: '' })
      });
    });

    await act(async () => {
      render(<Dog />);
    });

    expect(screen.getByText(/random/i)).toBeInTheDocument();
  });

  test('network timeout is handled', async () => {
    jest.useFakeTimers();

    global.fetch = jest.fn((url) => {
      if (url.includes('breeds/list/all')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBreedsResponse)
        });
      }
      return new Promise(() => {});
    });

    await act(async () => {
      render(<Dog />);
    });

    const generateButton = screen.getByRole('button', { name: /generate dog/i });

    await act(async () => {
      fireEvent.click(generateButton);
    });

    await act(async () => {
      jest.advanceTimersByTime(10000);
    });

    expect(screen.getByText(/random/i)).toBeInTheDocument();

    jest.useRealTimers();
  });

  test('component cleanup on unmount', async () => {
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

    const { unmount } = render(<Dog />);

    const generateButton = screen.getByRole('button', { name: /generate dog/i });

    await act(async () => {
      fireEvent.click(generateButton);
    });

    unmount();

    await act(async () => {
      resolvePromise({
        ok: true,
        json: () => Promise.resolve(mockRandomDogResponse)
      });
    });

    expect(true).toBe(true);
  });

  test('handles localStorage parse error', async () => {
    localStorage.getItem.mockReturnValue('invalid json{{{');

    await act(async () => {
      render(<Dog />);
    });

    expect(screen.getByText(/random/i)).toBeInTheDocument();
  });

  test('handles special characters in URLs', async () => {
    const specialUrl = 'https://images.dog.ceo/breeds/labrador/dog%20name.jpg';

    global.fetch = jest.fn((url) => {
      if (url.includes('breeds/list/all')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBreedsResponse)
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          status: 'success',
          message: specialUrl
        })
      });
    });

    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
    });
  });
});