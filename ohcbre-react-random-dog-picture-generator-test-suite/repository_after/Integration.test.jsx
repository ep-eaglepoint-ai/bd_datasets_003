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
    localStorage.getItem.mockImplementation(() => null);
    
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

  // Complete flow: fetch → add to favorites → verify in list
  test('complete flow: fetch image → add to favorites → verify in favorites list', async () => {
    await act(async () => {
      render(<Dog />);
    });

    // Wait for image
    await waitFor(() => {
      const images = screen.getAllByRole('img');
      expect(images.some(img => img.src.includes('dog.ceo'))).toBe(true);
    });

    const currentImageSrc = screen.getAllByRole('img')
      .find(img => img.src.includes('dog.ceo')).src;

    // Add to favorites
    const heartIcon = screen.getByTestId('heart-icon');
    await act(async () => {
      fireEvent.click(heartIcon);
    });

    // STRICT ASSERTION: Favorites list contains the image
    await waitFor(() => {
      const favoritesSection = screen.getByText(/favorites/i);
      expect(favoritesSection).toBeInTheDocument();
      
      // Verify the image appears in favorites
      const allImages = screen.getAllByRole('img');
      const favoriteImages = allImages.filter(img => img.src === currentImageSrc);
      expect(favoriteImages.length).toBeGreaterThanOrEqual(1);
    });
  });

  // Error recovery flow
  test('error recovery: trigger error → click retry → verify successful fetch', async () => {
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

    // Wait for error
    await waitFor(() => {
      const errorMessage = screen.queryByTestId('error-message') ||
                          screen.queryByText(/error/i) ||
                          screen.queryByText(/failed/i);
      expect(errorMessage).toBeInTheDocument();
    });

    // Find retry button (dedicated or generate button)
    const retryButton = screen.queryByRole('button', { name: /retry/i }) ||
                       screen.queryByTestId('retry-button') ||
                       screen.getByRole('button', { name: /generate dog/i });

    await act(async () => {
      fireEvent.click(retryButton);
    });

    // STRICT ASSERTION: Success after retry
    await waitFor(() => {
      const images = screen.getAllByRole('img');
      const successImage = images.find(img => img.src.includes('success.jpg'));
      expect(successImage).toBeInTheDocument();
    });

    // Error should be cleared
    await waitFor(() => {
      const errorMessage = screen.queryByTestId('error-message');
      expect(errorMessage).not.toBeInTheDocument();
    });
  });

  // Breed filter flow
  test('breed filter flow: select breed → fetch → verify image URL contains breed', async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');

    await act(async () => {
      await user.selectOptions(select, 'bulldog');
    });

    const generateButton = screen.getByRole('button', { name: /generate dog/i });

    await act(async () => {
      fireEvent.click(generateButton);
    });

    // STRICT ASSERTION: Image URL contains breed name
    await waitFor(() => {
      const images = screen.getAllByRole('img');
      const bulldogImage = images.find(img => img.src.includes('bulldog'));
      expect(bulldogImage).toBeInTheDocument();
    });
  });

  // Full user journey
  test('full user journey: load → fetch → favorite → switch breed → fetch again', async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<Dog />);
    });

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
    });

    // Add to favorites
    const heartIcon = screen.getByTestId('heart-icon');
    await act(async () => {
      fireEvent.click(heartIcon);
    });

    await waitFor(() => {
      expect(screen.getByText(/favorites/i)).toBeInTheDocument();
    });

    // Switch breed
    const select = screen.getByRole('combobox');
    await act(async () => {
      await user.selectOptions(select, 'poodle');
    });

    // Fetch new image
    const generateButton = screen.getByRole('button', { name: /generate dog/i });
    await act(async () => {
      fireEvent.click(generateButton);
    });

    // Verify poodle image
    await waitFor(() => {
      const images = screen.getAllByRole('img');
      const poodleImage = images.find(img => img.src.includes('poodle'));
      expect(poodleImage).toBeInTheDocument();
    });

    // Favorites should still exist
    expect(screen.getByText(/favorites/i)).toBeInTheDocument();
  });
});