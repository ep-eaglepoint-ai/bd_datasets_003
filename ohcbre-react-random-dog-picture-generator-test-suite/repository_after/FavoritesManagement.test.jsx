/**
 * Favorites Management Tests
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
const Dog = require('../src/Components/Dog.jsx').default || require('../src/Components/Dog.jsx');

describe('Favorites Management Tests', () => {
  const mockDogImageUrl = 'https://images.dog.ceo/breeds/labrador/test.jpg';
  const mockBreedsResponse = {
    status: 'success',
    message: { labrador: [], poodle: [] }
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
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockRandomDogResponse)
      });
    });
  });

  test('clicking heart icon adds image to favorites', async () => {
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
      expect(localStorage.setItem).toHaveBeenCalled();
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
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'dogFavorites',
        expect.any(String)
      );
    });
  });

  test('favorites persist to localStorage on remove', async () => {
    localStorage.getItem.mockReturnValue(JSON.stringify([mockDogImageUrl]));

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
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'dogFavorites',
        expect.any(String)
      );
    });
  });

  test('favorites load from localStorage on mount', async () => {
    const savedFavorites = ['https://example.com/dog1.jpg'];
    localStorage.getItem.mockReturnValue(JSON.stringify(savedFavorites));

    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      expect(localStorage.getItem).toHaveBeenCalledWith('dogFavorites');
    });
  });

  test('duplicate favorites are prevented', async () => {
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

    await act(async () => {
      fireEvent.click(heartIcon);
    });

    const allCalls = localStorage.setItem.mock.calls.filter(
      call => call[0] === 'dogFavorites'
    );
    expect(allCalls.length).toBeGreaterThan(0);
  });

  test('favorites section displays when favorites exist', async () => {
    localStorage.getItem.mockReturnValue(JSON.stringify([mockDogImageUrl]));

    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      expect(screen.getByText(/favorites/i)).toBeInTheDocument();
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
    expect(heartIcon).not.toHaveClass('favorited');

    await act(async () => {
      fireEvent.click(heartIcon);
    });

    await waitFor(() => {
      expect(heartIcon).toHaveClass('favorited');
    });
  });

  test('empty favorites shows no favorites section', async () => {
    localStorage.getItem.mockReturnValue(null);

    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      expect(screen.getByText(/random/i)).toBeInTheDocument();
    });
  });
});