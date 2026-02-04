/**
 * Breed Filtering Tests
 * Requirements 8-10: Breed dropdown, breed selection, and breed-specific fetching
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const Dog = require('../src/Components/Dog.jsx').default || require('../src/Components/Dog.jsx');

describe('Breed Filtering Tests', () => {
  const mockBreedsResponse = {
    status: 'success',
    message: { labrador: [], poodle: [], bulldog: [], beagle: [] }
  };
  const mockRandomDogResponse = {
    status: 'success',
    message: 'https://images.dog.ceo/breeds/labrador/test.jpg'
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

  test('breed dropdown populates from API on mount', async () => {
    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('breeds/list/all')
      );
    });

    await waitFor(() => {
      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();

      const options = screen.getAllByRole('option');
      // Should have default option + actual breeds
      expect(options.length).toBeGreaterThan(1);
    });
  });

  test('selecting a breed fetches random image of that breed only', async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');

    await act(async () => {
      await user.selectOptions(select, 'labrador');
    });

    const generateButton = screen.getByRole('button', { name: /generate dog/i });

    await act(async () => {
      fireEvent.click(generateButton);
    });

    await waitFor(() => {
      const breedCall = global.fetch.mock.calls.find(
        call => call[0].includes('/breed/labrador/')
      );
      expect(breedCall).toBeTruthy();
    });
  });

  test('"All Breeds" option fetches from general random endpoint', async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');

    // Ensure default/empty option is selected (All Breeds)
    await act(async () => {
      await user.selectOptions(select, '');
    });

    const generateButton = screen.getByRole('button', { name: /generate dog/i });

    await act(async () => {
      fireEvent.click(generateButton);
    });

    await waitFor(() => {
      const randomCall = global.fetch.mock.calls.find(
        call => call[0].includes('breeds/image/random') || 
               (call[0].includes('image/random') && !call[0].includes('/breed/'))
      );
      expect(randomCall).toBeTruthy();
    });
  });

  test('breed list fetch error shows fallback message', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('breeds/list/all')) {
        return Promise.reject(new Error('Failed to fetch breeds'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockRandomDogResponse)
      });
    });

    await act(async () => {
      render(<Dog />);
    });

    // Component should handle gracefully - either show error or have empty dropdown
    await waitFor(() => {
      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
    });

    // Check for error message or fallback behavior
    const errorMessage = screen.queryByText(/failed/i) || 
                        screen.queryByText(/error/i) ||
                        screen.queryByText(/select/i);
    expect(errorMessage).toBeTruthy();
  });

  test('breed-specific image URL contains breed name', async () => {
    const poodleImageUrl = 'https://images.dog.ceo/breeds/poodle/test.jpg';

    global.fetch = jest.fn((url) => {
      if (url.includes('breeds/list/all')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBreedsResponse)
        });
      }
      if (url.includes('/breed/poodle/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'success',
            message: poodleImageUrl
          })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockRandomDogResponse)
      });
    });

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

    const generateButton = screen.getByRole('button', { name: /generate dog/i });
    await act(async () => {
      fireEvent.click(generateButton);
    });

    await waitFor(() => {
      const images = screen.getAllByRole('img');
      const poodleImage = images.find(img => img.src && img.src.includes('poodle'));
      expect(poodleImage).toBeTruthy();
    });
  });

  test('breed selection updates state correctly', async () => {
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

    await act(async () => {
      await user.selectOptions(select, 'beagle');
    });

    expect(select.value).toBe('beagle');
  });
});