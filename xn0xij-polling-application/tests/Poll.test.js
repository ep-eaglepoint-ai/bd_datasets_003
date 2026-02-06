import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Poll from '../repository_after/client/src/components/Poll';

// Mock fetch
global.fetch = jest.fn();

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString(); },
    clear: () => { store = {}; },
    removeItem: (key) => { delete store[key]; }
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn(() => Promise.resolve())
  }
});

// Mock alert
global.alert = jest.fn();

describe('Poll Component - UI Behavior', () => {
  const mockPollData = {
    question: 'What is your favorite food?',
    options: ['Pizza', 'Sushi', 'Tacos'],
    votes: [5, 3, 2],
    percentages: [50, 30, 20]
  };

  beforeEach(() => {
    fetch.mockClear();
    localStorage.clear();
    global.alert.mockClear();
    navigator.clipboard.writeText.mockClear();
  });

  describe('Voting UI', () => {
    it('should render voting form when user has not voted', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockPollData, votes: [0, 0, 0], percentages: [0, 0, 0] })
      });

      render(<Poll pollId="TEST123" onBack={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('What is your favorite food?')).toBeInTheDocument();
      });

      expect(screen.getByText('Pizza')).toBeInTheDocument();
      expect(screen.getByText('Sushi')).toBeInTheDocument();
      expect(screen.getByText('Tacos')).toBeInTheDocument();
      expect(screen.getByText('Submit Vote')).toBeInTheDocument();
    });

    it('should allow selecting exactly one option', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockPollData, votes: [0, 0, 0], percentages: [0, 0, 0] })
      });

      render(<Poll pollId="TEST123" onBack={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Pizza')).toBeInTheDocument();
      });

      const radioButtons = screen.getAllByRole('radio');
      
      fireEvent.click(radioButtons[0]);
      expect(radioButtons[0]).toBeChecked();
      expect(radioButtons[1]).not.toBeChecked();
      
      fireEvent.click(radioButtons[1]);
      expect(radioButtons[0]).not.toBeChecked();
      expect(radioButtons[1]).toBeChecked();
    });

    it('should disable submit button when no option selected', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockPollData, votes: [0, 0, 0], percentages: [0, 0, 0] })
      });

      render(<Poll pollId="TEST123" onBack={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Submit Vote')).toBeInTheDocument();
      });

      const submitButton = screen.getByText('Submit Vote');
      expect(submitButton).toBeDisabled();
    });

    it('should enable submit button when option is selected', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockPollData, votes: [0, 0, 0], percentages: [0, 0, 0] })
      });

      render(<Poll pollId="TEST123" onBack={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Submit Vote')).toBeInTheDocument();
      });

      const radioButtons = screen.getAllByRole('radio');
      fireEvent.click(radioButtons[0]);

      const submitButton = screen.getByText('Submit Vote');
      expect(submitButton).not.toBeDisabled();
    });
  });

  describe('Voting Restrictions', () => {
    it('should prevent voting when localStorage indicates already voted', async () => {
      localStorage.setItem('voted_TEST123', 'true');
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPollData
      });

      render(<Poll pollId="TEST123" onBack={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Results')).toBeInTheDocument();
      });

      expect(screen.queryByText('Submit Vote')).not.toBeInTheDocument();
    });

    it('should handle 403 response from backend and update UI', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockPollData, votes: [0, 0, 0], percentages: [0, 0, 0] })
      });

      render(<Poll pollId="TEST123" onBack={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Submit Vote')).toBeInTheDocument();
      });

      const radioButtons = screen.getAllByRole('radio');
      fireEvent.click(radioButtons[0]);

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Already voted' })
      });

      const submitButton = screen.getByText('Submit Vote');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(localStorage.getItem('voted_TEST123')).toBe('true');
      });

      // After 403, component should show results
      await waitFor(() => {
        expect(screen.queryByText('Submit Vote')).not.toBeInTheDocument();
      });
    });
  });

  describe('Results Display', () => {
    it('should display results after successful vote', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockPollData, votes: [0, 0, 0], percentages: [0, 0, 0] })
      });

      render(<Poll pollId="TEST123" onBack={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Submit Vote')).toBeInTheDocument();
      });

      const radioButtons = screen.getAllByRole('radio');
      fireEvent.click(radioButtons[0]);

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPollData
      });

      const submitButton = screen.getByText('Submit Vote');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Results')).toBeInTheDocument();
      });

      expect(screen.getByText('5 votes (50%)')).toBeInTheDocument();
      expect(screen.getByText('3 votes (30%)')).toBeInTheDocument();
      expect(screen.getByText('2 votes (20%)')).toBeInTheDocument();
    });

    it('should display vote counts and percentages correctly', async () => {
      localStorage.setItem('voted_TEST123', 'true');
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPollData
      });

      render(<Poll pollId="TEST123" onBack={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Results')).toBeInTheDocument();
      });

      expect(screen.getByText(/5 votes \(50%\)/)).toBeInTheDocument();
      expect(screen.getByText(/3 votes \(30%\)/)).toBeInTheDocument();
      expect(screen.getByText(/2 votes \(20%\)/)).toBeInTheDocument();
    });

    it('should highlight winning option', async () => {
      localStorage.setItem('voted_TEST123', 'true');
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPollData
      });

      const { container } = render(<Poll pollId="TEST123" onBack={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Results')).toBeInTheDocument();
      });

      const resultItems = container.querySelectorAll('.result-item');
      expect(resultItems[0]).toHaveClass('winner');
      expect(resultItems[1]).not.toHaveClass('winner');
      expect(resultItems[2]).not.toHaveClass('winner');
    });

    it('should highlight all tied winners', async () => {
      localStorage.setItem('voted_TEST123', 'true');
      
      const tiedData = {
        ...mockPollData,
        votes: [5, 5, 2],
        percentages: [42, 42, 16]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => tiedData
      });

      const { container } = render(<Poll pollId="TEST123" onBack={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Results')).toBeInTheDocument();
      });

      const resultItems = container.querySelectorAll('.result-item');
      expect(resultItems[0]).toHaveClass('winner');
      expect(resultItems[1]).toHaveClass('winner');
      expect(resultItems[2]).not.toHaveClass('winner');
    });

    it('should not highlight any option when all have zero votes', async () => {
      localStorage.setItem('voted_TEST123', 'true');
      
      const zeroVotesData = {
        ...mockPollData,
        votes: [0, 0, 0],
        percentages: [0, 0, 0]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => zeroVotesData
      });

      const { container } = render(<Poll pollId="TEST123" onBack={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Results')).toBeInTheDocument();
      });

      const resultItems = container.querySelectorAll('.result-item');
      expect(resultItems[0]).not.toHaveClass('winner');
      expect(resultItems[1]).not.toHaveClass('winner');
      expect(resultItems[2]).not.toHaveClass('winner');
    });

    it('should display options in creation order, not sorted by votes', async () => {
      localStorage.setItem('voted_TEST123', 'true');
      
      const unsortedData = {
        question: 'Test?',
        options: ['Low', 'High', 'Medium'],
        votes: [1, 10, 5],
        percentages: [6, 63, 31]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => unsortedData
      });

      const { container } = render(<Poll pollId="TEST123" onBack={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Results')).toBeInTheDocument();
      });

      const optionNames = Array.from(container.querySelectorAll('.option-name'));
      expect(optionNames[0]).toHaveTextContent('Low');
      expect(optionNames[1]).toHaveTextContent('High');
      expect(optionNames[2]).toHaveTextContent('Medium');
    });
  });

  describe('Persistence After Refresh', () => {
    it('should show results when user refreshes after voting', async () => {
      localStorage.setItem('voted_TEST123', 'true');
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPollData
      });

      render(<Poll pollId="TEST123" onBack={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Results')).toBeInTheDocument();
      });

      expect(screen.queryByText('Submit Vote')).not.toBeInTheDocument();
      expect(screen.getByText('5 votes (50%)')).toBeInTheDocument();
    });

    it('should fetch fresh results from backend on refresh', async () => {
      localStorage.setItem('voted_TEST123', 'true');
      
      const updatedData = {
        ...mockPollData,
        votes: [10, 8, 6],
        percentages: [42, 33, 25]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedData
      });

      render(<Poll pollId="TEST123" onBack={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Results')).toBeInTheDocument();
      });

      expect(screen.getByText('10 votes (42%)')).toBeInTheDocument();
      expect(screen.getByText('8 votes (33%)')).toBeInTheDocument();
      expect(screen.getByText('6 votes (25%)')).toBeInTheDocument();
    });

    it('should maintain voter ID across page refreshes', async () => {
      localStorage.setItem('voterId', 'voter_12345');
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockPollData, votes: [0, 0, 0], percentages: [0, 0, 0] })
      });

      render(<Poll pollId="TEST123" onBack={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Submit Vote')).toBeInTheDocument();
      });

      const radioButtons = screen.getAllByRole('radio');
      fireEvent.click(radioButtons[0]);

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPollData
      });

      const submitButton = screen.getByText('Submit Vote');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              'X-Voter-Id': 'voter_12345'
            })
          })
        );
      });
    });
  });

  describe('Share Link', () => {
    it('should copy share link to clipboard', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockPollData, votes: [0, 0, 0], percentages: [0, 0, 0] })
      });

      render(<Poll pollId="TEST123" onBack={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('📋 Copy Share Link')).toBeInTheDocument();
      });

      const shareButton = screen.getByText('📋 Copy Share Link');
      fireEvent.click(shareButton);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('/poll/TEST123')
      );
      expect(global.alert).toHaveBeenCalledWith('Link copied to clipboard!');
    });
  });

  describe('Error Handling', () => {
    it('should display error message for invalid backend response', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockPollData, votes: [0, 0, 0], percentages: [0, 0, 0] })
      });

      render(<Poll pollId="TEST123" onBack={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Submit Vote')).toBeInTheDocument();
      });

      const radioButtons = screen.getAllByRole('radio');
      fireEvent.click(radioButtons[0]);

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid option' })
      });

      const submitButton = screen.getByText('Submit Vote');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid option')).toBeInTheDocument();
      });
    });

    it('should display error for poll not found', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Poll not found' })
      });

      render(<Poll pollId="INVALID" onBack={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Poll not found')).toBeInTheDocument();
      });
    });
  });
});
