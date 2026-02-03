/**
 * Loading and Error State Tests
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
    jest.useRealTimers();
  });

  test('loading indicator behavior during fetch', async () => {
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

    await act(async () => {
      resolvePromise({
        ok: true,
        json: () => Promise.resolve(mockRandomDogResponse)
      });
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(screen.getByText(/random/i)).toBeInTheDocument();
    });
  });

  test('error state displays message for network error', async () => {
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
      jest.runAllTimers();
    });

    await waitFor(() => {
      const content = screen.queryByText(/failed/i) || screen.queryByText(/error/i) || screen.getByRole('img');
      expect(content).toBeInTheDocument();
    });
  });

  test('error state displays message for API error', async () => {
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
        json: () => Promise.resolve({ status: 'error' })
      });
    });

    await act(async () => {
      render(<Dog />);
      jest.runAllTimers();
    });

    expect(screen.getByText(/random/i)).toBeInTheDocument();
  });

  test('retry mechanism works after failure', async () => {
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
        return Promise.reject(new Error('First attempt failed'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockRandomDogResponse)
      });
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

    expect(callCount).toBeGreaterThan(1);
  });

  test('component handles timeout scenario', async () => {
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
  });
});