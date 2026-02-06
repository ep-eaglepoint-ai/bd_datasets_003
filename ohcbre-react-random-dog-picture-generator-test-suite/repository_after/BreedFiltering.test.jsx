/**
 * Breed Filtering Tests
 * Requirements 8-10: Breed dropdown, breed selection, breed-specific fetching
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

  // Requirement 10: Breed dropdown populates from API on mount
  test('breed dropdown populates from API on mount', async () => {
    await act(async () => {
      render(<Dog />);
    });

    // STRICT ASSERTION: API called for breeds list
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('breeds/list/all')
      );
    });

    // STRICT ASSERTION: Dropdown contains breed options
    await waitFor(() => {
      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
      
      // Check for specific breeds in dropdown
      expect(screen.getByRole('option', { name: /labrador/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /poodle/i })).toBeInTheDocument();
    });
  });

  // Requirement 8: Selecting a breed fetches random image of that breed only
  test('selecting a breed fetches random image of that breed only', async () => {
    const user = userEvent.setup();
    const poodleImageUrl = 'https://images.dog.ceo/breeds/poodle/specific.jpg';

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

    // STRICT ASSERTION: API called with breed-specific endpoint
    await waitFor(() => {
      const breedCall = global.fetch.mock.calls.find(
        call => call[0].includes('/breed/poodle/')
      );
      expect(breedCall).toBeTruthy();
    });

    // STRICT ASSERTION: Image URL contains breed name
    await waitFor(() => {
      const images = screen.getAllByRole('img');
      const poodleImage = images.find(img => img.src.includes('poodle'));
      expect(poodleImage).toBeInTheDocument();
      expect(poodleImage.src).toBe(poodleImageUrl);
    });
  });

  // Requirement 9: "All Breeds" option fetches from general random endpoint
  test('"All Breeds" option fetches from general random endpoint', async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<Dog />);
    });

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');

    // First select a breed
    await act(async () => {
      await user.selectOptions(select, 'labrador');
    });

    // Then select "All Breeds" (empty value or default option)
    await act(async () => {
      await user.selectOptions(select, '');
    });

    // Clear previous fetch calls
    global.fetch.mockClear();

    const generateButton = screen.getByRole('button', { name: /generate dog/i });

    await act(async () => {
      fireEvent.click(generateButton);
    });

    // STRICT ASSERTION: General random endpoint called, NOT breed-specific
    await waitFor(() => {
      const generalCall = global.fetch.mock.calls.find(
        call => call[0].includes('breeds/image/random') && !call[0].includes('/breed/')
      );
      expect(generalCall).toBeTruthy();
    });
  });

  // Breed list fetch error shows fallback message
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

    // STRICT ASSERTION: Fallback/error message for breeds should be shown
    await waitFor(() => {
      const fallbackMessage = screen.queryByText(/failed.*breed/i) ||
                              screen.queryByText(/error.*breed/i) ||
                              screen.queryByText(/couldn.*load.*breed/i) ||
                              screen.queryByTestId('breeds-error');
      expect(fallbackMessage).toBeInTheDocument();
    });
  });
});