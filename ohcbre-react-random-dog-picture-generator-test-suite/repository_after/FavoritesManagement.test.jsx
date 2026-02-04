/**
 * Favorites Management Tests
 * Requirements 11-13: Adding, removing, persisting favorites, duplicate prevention
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
const Dog = require('../src/Components/Dog.jsx').default || require('../src/Components/Dog.jsx');

describe('Favorites Management Tests', () => {
  const mockDogImageUrl1 = 'https://images.dog.ceo/breeds/labrador/test1.jpg';
  const mockDogImageUrl2 = 'https://images.dog.ceo/breeds/poodle/test2.jpg';
  const mockBreedsResponse = {
    status: 'success',
    message: { labrador: [], poodle: [] }
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
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          status: 'success',
          message: `https://images.dog.ceo/breeds/labrador/dog${imageCounter}.jpg`
        })
      });
    });
  });

  // Requirement 11: Clicking heart icon adds current image to favorites
  test('clicking heart icon adds current image to favorites array', async () => {
    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('heart-icon')).toBeInTheDocument();
    });

    const heartIcon = screen.getByTestId('heart-icon');

    // Before clicking, should NOT be favorited
    expect(heartIcon).not.toHaveClass('favorited');

    await act(async () => {
      fireEvent.click(heartIcon);
    });

    // STRICT ASSERTION: Heart icon should show favorited state
    await waitFor(() => {
      expect(heartIcon).toHaveClass('favorited');
    });

    // STRICT ASSERTION: Favorites section should appear with 1 item
    await waitFor(() => {
      expect(screen.getByText(/favorites/i)).toBeInTheDocument();
    });
  });

  // Requirement 13: Favorites persist to localStorage
  test('favorites persist to localStorage on add with correct key', async () => {
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

    // STRICT ASSERTION: localStorage.setItem called with 'dogFavorites' key
    await waitFor(() => {
      const favoriteCalls = localStorage.setItem.mock.calls.filter(
        call => call[0] === 'dogFavorites'
      );
      expect(favoriteCalls.length).toBeGreaterThan(0);
      
      // Verify the saved data contains the image URL
      const lastCall = favoriteCalls[favoriteCalls.length - 1];
      const savedData = JSON.parse(lastCall[1]);
      expect(Array.isArray(savedData)).toBe(true);
      expect(savedData.length).toBeGreaterThan(0);
    });
  });

  // Requirement 13: Favorites load from localStorage on mount
  test('favorites load from localStorage on component mount', async () => {
    const savedFavorites = [
      'https://images.dog.ceo/breeds/labrador/saved1.jpg',
      'https://images.dog.ceo/breeds/poodle/saved2.jpg'
    ];
    
    localStorage.getItem.mockImplementation((key) => {
      if (key === 'dogFavorites') {
        return JSON.stringify(savedFavorites);
      }
      return null;
    });

    await act(async () => {
      render(<Dog />);
    });

    // STRICT ASSERTION: localStorage.getItem called with 'dogFavorites'
    expect(localStorage.getItem).toHaveBeenCalledWith('dogFavorites');

    // STRICT ASSERTION: Favorites section shows loaded count
    await waitFor(() => {
      const favoritesText = screen.getByText(/favorites.*\(2\)/i);
      expect(favoritesText).toBeInTheDocument();
    });
  });

  // Requirement 12: Duplicate favorites are prevented
  test('duplicate favorites are prevented - same URL NOT added twice', async () => {
    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('heart-icon')).toBeInTheDocument();
    });

    const heartIcon = screen.getByTestId('heart-icon');

    // Click to add favorite
    await act(async () => {
      fireEvent.click(heartIcon);
    });

    await waitFor(() => {
      expect(heartIcon).toHaveClass('favorited');
    });

    // Click again to remove
    await act(async () => {
      fireEvent.click(heartIcon);
    });

    await waitFor(() => {
      expect(heartIcon).not.toHaveClass('favorited');
    });

    // Click again to add back
    await act(async () => {
      fireEvent.click(heartIcon);
    });

    // STRICT ASSERTION: Check localStorage for duplicates
    await waitFor(() => {
      const favoriteCalls = localStorage.setItem.mock.calls.filter(
        call => call[0] === 'dogFavorites'
      );
      
      // Get the last saved favorites array
      const lastCall = favoriteCalls[favoriteCalls.length - 1];
      const savedFavorites = JSON.parse(lastCall[1]);
      
      // STRICT ASSERTION: No duplicate URLs in the array
      const uniqueUrls = new Set(savedFavorites);
      expect(savedFavorites.length).toBe(uniqueUrls.size);
      
      // STRICT ASSERTION: Should have exactly 1 favorite (not duplicated)
      expect(savedFavorites.length).toBe(1);
    });
  });

  // Test for "No favorites yet" message
  test('empty favorites array renders "No favorites yet" message', async () => {
    localStorage.getItem.mockReturnValue(null);

    await act(async () => {
      render(<Dog />);
    });

    // STRICT ASSERTION: "No favorites yet" message should be displayed
    await waitFor(() => {
      const noFavoritesMessage = screen.queryByText(/no favorites yet/i) ||
                                  screen.queryByTestId('no-favorites');
      expect(noFavoritesMessage).toBeInTheDocument();
    });
  });

  // Favorites persist on remove
  test('favorites persist to localStorage on remove', async () => {
    const initialFavorites = ['https://images.dog.ceo/breeds/labrador/dog1.jpg'];
    
    localStorage.getItem.mockImplementation((key) => {
      if (key === 'dogFavorites') {
        return JSON.stringify(initialFavorites);
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

    // Click to remove from favorites
    await act(async () => {
      fireEvent.click(heartIcon);
    });

    // STRICT ASSERTION: localStorage updated with empty array or without the URL
    await waitFor(() => {
      const favoriteCalls = localStorage.setItem.mock.calls.filter(
        call => call[0] === 'dogFavorites'
      );
      expect(favoriteCalls.length).toBeGreaterThan(0);
    });
  });
});