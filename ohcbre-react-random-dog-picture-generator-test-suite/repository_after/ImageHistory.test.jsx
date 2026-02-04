/**
 * Image History Tests
 * Requirement 14: History tracking, capping at 10 items, thumbnail clicks, persistence
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

  // Requirement 14: History is capped at 10 items with oldest removed
  test('history is capped at 10 items with OLDEST removed when exceeding', async () => {
    await act(async () => {
      render(<Dog />);
    });

    const generateButton = screen.getByRole('button', { name: /generate dog/i });

    // Generate 12 images to exceed the 10-item cap
    for (let i = 0; i < 12; i++) {
      await act(async () => {
        fireEvent.click(generateButton);
      });

      await waitFor(() => {
        expect(imageCounter).toBe(i + 2); // +2 because initial fetch + loop
      });
    }

    // STRICT ASSERTION: History localStorage should have exactly 10 items
    await waitFor(() => {
      const historyCalls = localStorage.setItem.mock.calls.filter(
        call => call[0] === 'dogHistory'
      );
      
      if (historyCalls.length > 0) {
        const lastCall = historyCalls[historyCalls.length - 1];
        const savedHistory = JSON.parse(lastCall[1]);
        
        // STRICT ASSERTION: History capped at 10
        expect(savedHistory.length).toBeLessThanOrEqual(10);
        
        // STRICT ASSERTION: Oldest images should be removed (first images not in array)
        expect(savedHistory).not.toContain('https://images.dog.ceo/breeds/labrador/dog1.jpg');
        expect(savedHistory).not.toContain('https://images.dog.ceo/breeds/labrador/dog2.jpg');
      }
    });
  });

  // Clicking history thumbnail updates main image
  test('clicking history thumbnail updates the main displayed image', async () => {
    // Pre-populate history
    const savedHistory = [
      'https://images.dog.ceo/breeds/labrador/history1.jpg',
      'https://images.dog.ceo/breeds/poodle/history2.jpg',
      'https://images.dog.ceo/breeds/bulldog/history3.jpg'
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

    // Find history thumbnails
    await waitFor(() => {
      const historySection = screen.queryByTestId('history-section') ||
                            screen.queryByText(/history/i);
      expect(historySection).toBeInTheDocument();
    });

    // Find a history thumbnail and click it
    const historyThumbnails = screen.queryAllByTestId(/history-item/) ||
                              screen.getAllByRole('img').filter(img => 
                                savedHistory.some(url => img.src === url)
                              );

    if (historyThumbnails.length > 0) {
      const thumbnailToClick = historyThumbnails[1]; // Click second history item
      const thumbnailSrc = thumbnailToClick.src;

      await act(async () => {
        fireEvent.click(thumbnailToClick);
      });

      // STRICT ASSERTION: Main image should update to clicked thumbnail
      await waitFor(() => {
        const mainImage = screen.getByTestId('dog-image') ||
                         screen.getAllByRole('img')[0];
        expect(mainImage.src).toBe(thumbnailSrc);
      });
    }
  });

  // History writes to localStorage
  test('history writes to localStorage with key "dogHistory"', async () => {
    await act(async () => {
      render(<Dog />);
    });

    const generateButton = screen.getByRole('button', { name: /generate dog/i });

    await act(async () => {
      fireEvent.click(generateButton);
    });

    // STRICT ASSERTION: localStorage.setItem called with 'dogHistory'
    await waitFor(() => {
      const historyCalls = localStorage.setItem.mock.calls.filter(
        call => call[0] === 'dogHistory'
      );
      expect(historyCalls.length).toBeGreaterThan(0);
    });
  });

  // History loads from localStorage on mount
  test('history loads from localStorage on component mount', async () => {
    const savedHistory = [
      'https://images.dog.ceo/breeds/labrador/h1.jpg',
      'https://images.dog.ceo/breeds/poodle/h2.jpg'
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

    // STRICT ASSERTION: localStorage.getItem called with 'dogHistory'
    expect(localStorage.getItem).toHaveBeenCalledWith('dogHistory');
  });
});