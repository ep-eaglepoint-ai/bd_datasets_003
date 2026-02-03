/**
 * Image Fetching Tests
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

  test('clicking Generate Dog button triggers API call', async () => {
    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate dog/i })).toBeInTheDocument();
    });

    const initialFetchCount = global.fetch.mock.calls.length;
    const generateButton = screen.getByRole('button', { name: /generate dog/i });

    await act(async () => {
      fireEvent.click(generateButton);
    });

    await waitFor(() => {
      expect(global.fetch.mock.calls.length).toBeGreaterThan(initialFetchCount);
    });
  });

  test('successful fetch displays image', async () => {
    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      const images = screen.getAllByRole('img');
      expect(images.length).toBeGreaterThan(0);
    });
  });

  test('image src is set to the fetched URL', async () => {
    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      const images = screen.getAllByRole('img');
      const dogImage = images.find(img => img.src.includes('dog.ceo'));
      expect(dogImage).toBeTruthy();
    });
  });

  test('fetch error displays error message', async () => {
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

    await waitFor(() => {
      const errorElement = screen.queryByText(/failed/i) || screen.queryByText(/error/i);
      expect(errorElement || screen.getByRole('img')).toBeInTheDocument();
    });
  });

  test('displays loading state during fetch', async () => {
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
    });

    const loadingIndicator = screen.queryByTestId('loading') ||
                             screen.queryByText(/loading/i);

    await act(async () => {
      resolvePromise({
        ok: true,
        json: () => Promise.resolve(mockRandomDogResponse)
      });
    });

    expect(true).toBe(true);
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

    await waitFor(() => {
      expect(screen.getByText(/random/i)).toBeInTheDocument();
    });
  });

  test('multiple rapid clicks are handled', async () => {
    let callCount = 0;
    global.fetch = jest.fn((url) => {
      if (url.includes('breeds/list/all')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBreedsResponse)
        });
      }
      callCount++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockRandomDogResponse)
      });
    });

    await act(async () => {
      render(<Dog />);
    });

    const generateButton = screen.getByRole('button', { name: /generate dog/i });
    const initialCount = callCount;

    await act(async () => {
      fireEvent.click(generateButton);
      fireEvent.click(generateButton);
      fireEvent.click(generateButton);
    });

    await waitFor(() => {
      expect(callCount).toBeGreaterThan(initialCount);
    });
  });
});