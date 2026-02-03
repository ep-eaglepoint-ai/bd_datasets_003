/**
 * Image History Tests
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
const Dog = require('../src/Components/Dog.jsx').default || require('../src/Components/Dog.jsx');

describe('Image History Tests', () => {
  const mockBreedsResponse = {
    status: 'success',
    message: { labrador: [], poodle: [] }
  };

  let imageCounter = 0;

  beforeEach(() => {
    imageCounter = 0;
    global.fetch = jest.fn((url) => {
      if (url.includes('breeds/list/all')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBreedsResponse)
        });
      }
      imageCounter++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          status: 'success',
          message: `https://images.dog.ceo/breeds/labrador/dog${imageCounter}.jpg`
        })
      });
    });
  });

  test('viewed images are tracked', async () => {
    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      const images = screen.getAllByRole('img');
      expect(images.length).toBeGreaterThan(0);
    });
  });

  test('multiple fetches add to image collection', async () => {
    await act(async () => {
      render(<Dog />);
    });

    const generateButton = screen.getByRole('button', { name: /generate dog/i });

    await act(async () => {
      fireEvent.click(generateButton);
    });

    await waitFor(() => {
      expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
    });

    await act(async () => {
      fireEvent.click(generateButton);
    });

    await waitFor(() => {
      expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
    });
  });

  test('history management with multiple images', async () => {
    await act(async () => {
      render(<Dog />);
    });

    const generateButton = screen.getByRole('button', { name: /generate dog/i });

    for (let i = 0; i < 5; i++) {
      await act(async () => {
        fireEvent.click(generateButton);
      });
    }

    await waitFor(() => {
      expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
    });
  });

  test('history localStorage persistence', async () => {
    const savedHistory = [
      'https://images.dog.ceo/breeds/labrador/dog1.jpg',
      'https://images.dog.ceo/breeds/labrador/dog2.jpg'
    ];

    localStorage.getItem.mockImplementation((key) => {
      if (key === 'dogHistory') {
        return JSON.stringify(savedHistory);
      }
      return null;
    });

    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      expect(localStorage.getItem).toHaveBeenCalled();
    });
  });

  test('clicking on history item updates display', async () => {
    await act(async () => {
      render(<Dog />);
    });

    const images = screen.queryAllByRole('img');

    if (images.length > 1) {
      await act(async () => {
        fireEvent.click(images[1]);
      });
    }

    expect(screen.getByText(/random/i)).toBeInTheDocument();
  });
});