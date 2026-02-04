/**
 * Favorites Management Tests
 * Requirements 11-13: Adding, removing, persisting, and loading favorites
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
const Dog = require('../src/Components/Dog.jsx').default || require('../src/Components/Dog.jsx');

describe('Favorites Management Tests', () => {
  const mockDogImageUrl = 'https://images.dog.ceo/breeds/labrador/test.jpg';
  const mockDogImageUrl2 = 'https://images.dog.ceo/breeds/poodle/test2.jpg';
  const mockBreedsResponse = {
    status: 'success',
    message: { labrador: [], poodle: [] }
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

  test('clicking heart icon adds current image to favorites array', async () => {
    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('heart-icon')).toBeInTheDocument();
    });

    const heartIcon = screen.getByTestId('heart-icon');

    await act(async () => {
      fireEvent.click(heartIcon);
    });

    // Verify localStorage was called to save favorites
    await waitFor(() => {
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'dogFavorites',
        expect.any(String)
      );
    });

    // Verify favorites section appears
    await waitFor(() => {
      expect(screen.getByText(/favorites/i)).toBeInTheDocument();
    });
  });

  test('favorites persist to localStorage on add', async () => {
    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('heart-icon')).toBeInTheDocument();
    });

    const heartIcon = screen.getByTestId('heart-icon');

    await act(async () => {
      fireEvent.click(heartIcon);
    });

    await waitFor(() => {
      const setItemCalls = localStorage.setItem.mock.calls.filter(
        call => call[0] === 'dogFavorites'
      );
      expect(setItemCalls.length).toBeGreaterThan(0);
      
      // Verify the saved value contains the image URL
      const lastCall = setItemCalls[setItemCalls.length - 1];
      expect(lastCall[1]).toContain(mockDogImageUrl);
    });
  });

  test('favorites persist to localStorage on remove', async () => {
    localStorage.getItem.mockImplementation((key) => {
      if (key === 'dogFavorites') {
        return JSON.stringify([mockDogImageUrl]);
      }
      return null;
    });

    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('heart-icon')).toBeInTheDocument();
    });

    const heartIcon = screen.getByTestId('heart-icon');

    // Click to remove from favorites (toggle off)
    await act(async () => {
      fireEvent.click(heartIcon);
    });

    await waitFor(() => {
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'dogFavorites',
        expect.any(String)
      );
    });
  });

  test('favorites load from localStorage on component mount', async () => {
    const savedFavorites = ['https://example.com/dog1.jpg', 'https://example.com/dog2.jpg'];
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

    // Favorites section should show with loaded favorites
    await waitFor(() => {
      expect(screen.getByText(/favorites/i)).toBeInTheDocument();
    });
  });

  test('duplicate favorites are prevented - same URL not added twice', async () => {
    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('heart-icon')).toBeInTheDocument();
    });

    const heartIcon = screen.getByTestId('heart-icon');

    // First click - add to favorites
    await act(async () => {
      fireEvent.click(heartIcon);
    });

    await waitFor(() => {
      expect(heartIcon).toHaveClass('favorited');
    });

    // Second click - should toggle off (remove), not add duplicate
    await act(async () => {
      fireEvent.click(heartIcon);
    });

    await waitFor(() => {
      expect(heartIcon).not.toHaveClass('favorited');
    });

    // Third click - add back
    await act(async () => {
      fireEvent.click(heartIcon);
    });

    // Verify localStorage doesn't contain duplicates
    const setItemCalls = localStorage.setItem.mock.calls
      .filter(call => call[0] === 'dogFavorites')
      .map(call => JSON.parse(call[1]));

    // Check last saved state doesn't have duplicates
    if (setItemCalls.length > 0) {
      const lastSavedFavorites = setItemCalls[setItemCalls.length - 1];
      const uniqueUrls = new Set(lastSavedFavorites);
      expect(lastSavedFavorites.length).toBe(uniqueUrls.size);
    }
  });

  test('empty favorites array - component handles gracefully', async () => {
    localStorage.getItem.mockReturnValue(null);

    await act(async () => {
      render(<Dog />);
    });

    // Component should render without favorites section or show "no favorites" message
    await waitFor(() => {
      const noFavoritesMsg = screen.queryByText(/no favorites/i);
      const favoritesSection = screen.queryByText(/favorites \(\d+\)/i);
      
      // Either no favorites message, or no favorites section at all is acceptable
      expect(noFavoritesMsg || !favoritesSection).toBeTruthy();
    });
  });

  test('heart icon toggles favorite state visually', async () => {
    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('heart-icon')).toBeInTheDocument();
    });

    const heartIcon = screen.getByTestId('heart-icon');

    // Initially not favorited
    expect(heartIcon).not.toHaveClass('favorited');

    await act(async () => {
      fireEvent.click(heartIcon);
    });

    // After click, should be favorited
    await waitFor(() => {
      expect(heartIcon).toHaveClass('favorited');
    });

    await act(async () => {
      fireEvent.click(heartIcon);
    });

    // After second click, should not be favorited
    await waitFor(() => {
      expect(heartIcon).not.toHaveClass('favorited');
    });
  });

  test('favorites section displays when favorites exist', async () => {
    localStorage.getItem.mockImplementation((key) => {
      if (key === 'dogFavorites') {
        return JSON.stringify([mockDogImageUrl]);
      }
      return null;
    });

    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      expect(screen.getByText(/favorites/i)).toBeInTheDocument();
    });
  });
});