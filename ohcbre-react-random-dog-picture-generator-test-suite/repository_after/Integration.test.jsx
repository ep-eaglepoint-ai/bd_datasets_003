/**
 * Integration Tests
 * Tests complete user flows and feature combinations
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const Dog = require('../src/Components/Dog.jsx').default || require('../src/Components/Dog.jsx');

describe('Integration Tests', () => {
  const mockBreedsResponse = {
    status: 'success',
    message: { labrador: [], poodle: [], bulldog: [] }
  };

  let imageCounter = 0;

  beforeEach(() => {
    imageCounter = 0;
    jest.clearAllMocks();
    global.fetch = jest.fn((url) => {
      if (url.includes('breeds/list/all')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBreedsResponse)
        });
      }

      imageCounter++;
      let breed = 'labrador';
      const breedMatch = url.match(/\/breed\/([^/]+)\//);
      if (breedMatch) {
        breed = breedMatch[1];
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          status: 'success',
          message: `https://images.dog.ceo/breeds/${breed}/dog${imageCounter}.jpg`
        })
      });
    });
  });

  test('complete flow: fetch image → add to favorites → verify in favorites list', async () => {
    await act(async () => {
      render(<Dog />);
    });

    // Wait for initial image
    await waitFor(() => {
      const images = screen.getAllByRole('img');
      expect(images.find(img => img.src && img.src.includes('dog.ceo'))).toBeTruthy();
    });

    // Add to favorites
    const heartIcon = screen.getByTestId('heart-icon');

    await act(async () => {
      fireEvent.click(heartIcon);
    });

    // Verify favorites section appears
    await waitFor(() => {
      expect(screen.getByText(/favorites/i)).toBeInTheDocument();
    });
  });

  test('breed filter flow: select breed → fetch → verify URL contains breed name', async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    // Select poodle breed
    const select = screen.getByRole('combobox');

    await act(async () => {
      await user.selectOptions(select, 'poodle');
    });

    expect(select.value).toBe('poodle');

    // Fetch image
    const generateButton = screen.getByRole('button', { name: /generate dog/i });

    await act(async () => {
      fireEvent.click(generateButton);
    });

    // Verify API was called with breed
    await waitFor(() => {
      const breedCall = global.fetch.mock.calls.find(
        call => call[0].includes('/breed/poodle/')
      );
      expect(breedCall).toBeTruthy();
    });

    // Verify image URL contains breed name
    await waitFor(() => {
      const images = screen.getAllByRole('img');
      const poodleImage = images.find(img => img.src && img.src.includes('poodle'));
      expect(poodleImage).toBeTruthy();
    });
  });

  test('error recovery: trigger error → click retry/generate → verify successful fetch', async () => {
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
        json: () => Promise.resolve({
          status: 'success',
          message: 'https://images.dog.ceo/breeds/labrador/success.jpg'
        })
      });
    });

    await act(async () => {
      render(<Dog />);
    });

    // First fetch fails
    await waitFor(() => {
      expect(callCount).toBe(1);
    });

    // Click generate button to retry
    const generateButton = screen.getByRole('button', { name: /generate dog/i });

    await act(async () => {
      fireEvent.click(generateButton);
    });

    // Verify successful fetch after retry
    await waitFor(() => {
      const images = screen.getAllByRole('img');
      const successImage = images.find(img => img.src && img.src.includes('success.jpg'));
      expect(successImage).toBeTruthy();
    });
  });

  test('favorites load from storage on mount', async () => {
    const savedFavorites = ['https://images.dog.ceo/breeds/labrador/fav1.jpg'];
    localStorage.getItem.mockImplementation((key) => {
      if (key === 'dogFavorites') {
        return JSON.stringify(savedFavorites);
      }
      return null;
    });

    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      expect(localStorage.getItem).toHaveBeenCalledWith('dogFavorites');
    });

    await waitFor(() => {
      expect(screen.getByText(/favorites/i)).toBeInTheDocument();
    });
  });

  test('full user journey: load → fetch → favorite → switch breed → fetch', async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    // 1. Fetch initial image (component does this on mount)
    await waitFor(() => {
      expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
    });

    // 2. Add to favorites
    const heartIcon = screen.getByTestId('heart-icon');

    await act(async () => {
      fireEvent.click(heartIcon);
    });

    await waitFor(() => {
      expect(screen.getByText(/favorites/i)).toBeInTheDocument();
    });

    // 3. Switch breed
    const select = screen.getByRole('combobox');

    await act(async () => {
      await user.selectOptions(select, 'bulldog');
    });

    // 4. Fetch breed-specific image
    const generateButton = screen.getByRole('button', { name: /generate dog/i });

    await act(async () => {
      fireEvent.click(generateButton);
    });

    await waitFor(() => {
      const bulldogCall = global.fetch.mock.calls.find(
        call => call[0].includes('/breed/bulldog/')
      );
      expect(bulldogCall).toBeTruthy();
    });

    // Favorites should still be present
    await waitFor(() => {
      expect(screen.getByText(/favorites/i)).toBeInTheDocument();
    });
  });

  test('multiple favorites can be added', async () => {
    await act(async () => {
      render(<Dog />);
    });

    const generateButton = screen.getByRole('button', { name: /generate dog/i });
    const heartIcon = screen.getByTestId('heart-icon');

    // Fetch first image and add to favorites
    await act(async () => {
      fireEvent.click(heartIcon);
    });

    await waitFor(() => {
      expect(screen.getByText(/favorites.*1/i)).toBeInTheDocument();
    });

    // Fetch second image
    await act(async () => {
      fireEvent.click(generateButton);
    });

    await waitFor(() => {
      expect(heartIcon).not.toHaveClass('favorited');
    });

    // Add second image to favorites
    await act(async () => {
      fireEvent.click(heartIcon);
    });

    await waitFor(() => {
      expect(screen.getByText(/favorites.*2/i)).toBeInTheDocument();
    });
  });
});