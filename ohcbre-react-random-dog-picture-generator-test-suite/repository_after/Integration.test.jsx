/**
 * Integration Tests
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

  test('complete flow: fetch → add to favorites → verify', async () => {
    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      const images = screen.getAllByRole('img');
      expect(images.find(img => img.src.includes('dog.ceo'))).toBeInTheDocument();
    });

    const heartIcon = screen.getByTestId('heart-icon');

    await act(async () => {
      fireEvent.click(heartIcon);
    });

    await waitFor(() => {
      expect(screen.getByText(/favorites/i)).toBeInTheDocument();
    });
  });

  test('breed filter flow: select → fetch → verify URL', async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');

    await act(async () => {
      await user.selectOptions(select, 'poodle');
    });

    expect(select.value).toBe('poodle');

    const generateButton = screen.getByRole('button', { name: /generate dog/i });

    await act(async () => {
      fireEvent.click(generateButton);
    });

    await waitFor(() => {
      const breedCall = global.fetch.mock.calls.find(
        call => call[0].includes('/breed/poodle/')
      );
      expect(breedCall).toBeTruthy();
    });

    await waitFor(() => {
      const images = screen.getAllByRole('img');
      const poodleImage = images.find(img => img.src.includes('poodle'));
      expect(poodleImage).toBeTruthy();
    });
  });

  test('error recovery: fail → retry → success', async () => {
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

    await waitFor(() => {
      expect(callCount).toBe(1);
    });

    const generateButton = screen.getByRole('button', { name: /generate dog/i });

    await act(async () => {
      fireEvent.click(generateButton);
    });

    await waitFor(() => {
      const images = screen.getAllByRole('img');
      const successImage = images.find(img => img.src.includes('success.jpg'));
      expect(successImage).toBeInTheDocument();
    });
  });

  test('favorites load from storage on mount', async () => {
    const savedFavorites = ['https://images.dog.ceo/breeds/labrador/fav1.jpg'];
    localStorage.getItem.mockReturnValue(JSON.stringify(savedFavorites));

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

    const generateButton = screen.getByRole('button', { name: /generate dog/i });
    await act(async () => {
      fireEvent.click(generateButton);
    });

    await waitFor(() => {
      expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
    });

    const heartIcon = screen.getByTestId('heart-icon');
    await act(async () => {
      fireEvent.click(heartIcon);
    });

    const select = screen.getByRole('combobox');
    await act(async () => {
      await user.selectOptions(select, 'bulldog');
    });

    await act(async () => {
      fireEvent.click(generateButton);
    });

    await waitFor(() => {
      const bulldogCall = global.fetch.mock.calls.find(
        call => call[0].includes('/breed/bulldog/')
      );
      expect(bulldogCall).toBeTruthy();
    });

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

    await act(async () => {
      fireEvent.click(heartIcon);
    });

    await act(async () => {
      fireEvent.click(generateButton);
    });

    await waitFor(() => {
      expect(heartIcon).not.toHaveClass('favorited');
    });

    await act(async () => {
      fireEvent.click(heartIcon);
    });

    await waitFor(() => {
      expect(screen.getByText(/favorites \(2\)/i)).toBeInTheDocument();
    });
  });
});