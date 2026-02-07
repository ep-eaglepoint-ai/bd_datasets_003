import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CreatePoll from '../repository_after/client/src/components/CreatePoll';

// Mock fetch
global.fetch = jest.fn();

describe('CreatePoll Component - UI Behavior', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  describe('Form Rendering', () => {
    it('should render create poll form', () => {
      render(<CreatePoll onPollCreated={jest.fn()} />);

      expect(screen.getByText('Create a Poll')).toBeInTheDocument();
      expect(screen.getByLabelText('Question')).toBeInTheDocument();
      expect(screen.getByText('Create Poll')).toBeInTheDocument();
    });

    it('should render with 2 option inputs by default', () => {
      render(<CreatePoll onPollCreated={jest.fn()} />);

      const optionInputs = screen.getAllByPlaceholderText(/Option \d+/);
      expect(optionInputs).toHaveLength(2);
    });

    it('should allow adding up to 5 options', () => {
      render(<CreatePoll onPollCreated={jest.fn()} />);

      const addButton = screen.getByText('+ Add Option');
      
      fireEvent.click(addButton);
      expect(screen.getAllByPlaceholderText(/Option \d+/)).toHaveLength(3);
      
      fireEvent.click(addButton);
      expect(screen.getAllByPlaceholderText(/Option \d+/)).toHaveLength(4);
      
      fireEvent.click(addButton);
      expect(screen.getAllByPlaceholderText(/Option \d+/)).toHaveLength(5);
      
      expect(screen.queryByText('+ Add Option')).not.toBeInTheDocument();
    });

    it('should allow removing options down to 2', () => {
      render(<CreatePoll onPollCreated={jest.fn()} />);

      const addButton = screen.getByText('+ Add Option');
      fireEvent.click(addButton);
      
      expect(screen.getAllByPlaceholderText(/Option \d+/)).toHaveLength(3);
      
      const removeButtons = screen.getAllByText('×');
      fireEvent.click(removeButtons[0]);
      
      expect(screen.getAllByPlaceholderText(/Option \d+/)).toHaveLength(2);
      expect(screen.queryByText('×')).not.toBeInTheDocument();
    });
  });

  describe('Backend Validation', () => {
    it('should send empty options to backend for validation', async () => {
      const mockOnPollCreated = jest.fn();
      
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Empty option strings are not allowed' })
      });

      const { container } = render(<CreatePoll onPollCreated={mockOnPollCreated} />);

      const questionInput = screen.getByLabelText('Question');
      fireEvent.change(questionInput, { target: { value: 'Test Question?' } });

      const optionInputs = screen.getAllByPlaceholderText(/Option \d+/);
      fireEvent.change(optionInputs[0], { target: { value: 'Pizza' } });
      fireEvent.change(optionInputs[1], { target: { value: '' } });

      const form = container.querySelector('form');
      fireEvent.submit(form);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/polls',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              question: 'Test Question?',
              options: ['Pizza', '']
            })
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Empty option strings are not allowed')).toBeInTheDocument();
      });

      expect(mockOnPollCreated).not.toHaveBeenCalled();
    });

    it('should display backend error for whitespace-only options', async () => {
      const mockOnPollCreated = jest.fn();
      
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Empty option strings are not allowed' })
      });

      const { container } = render(<CreatePoll onPollCreated={mockOnPollCreated} />);

      const questionInput = screen.getByLabelText('Question');
      fireEvent.change(questionInput, { target: { value: 'Test?' } });

      const optionInputs = screen.getAllByPlaceholderText(/Option \d+/);
      fireEvent.change(optionInputs[0], { target: { value: 'Pizza' } });
      fireEvent.change(optionInputs[1], { target: { value: '   ' } });

      const form = container.querySelector('form');
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText('Empty option strings are not allowed')).toBeInTheDocument();
      });
    });

    it('should display backend error for too few options', async () => {
      const mockOnPollCreated = jest.fn();
      
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Poll must have at least 2 options' })
      });

      const { container } = render(<CreatePoll onPollCreated={mockOnPollCreated} />);

      const questionInput = screen.getByLabelText('Question');
      fireEvent.change(questionInput, { target: { value: 'Test?' } });

      const optionInputs = screen.getAllByPlaceholderText(/Option \d+/);
      fireEvent.change(optionInputs[0], { target: { value: 'Pizza' } });
      fireEvent.change(optionInputs[1], { target: { value: '' } });

      const form = container.querySelector('form');
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText('Poll must have at least 2 options')).toBeInTheDocument();
      });
    });

    it('should display backend error for too many options', async () => {
      const mockOnPollCreated = jest.fn();
      
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Poll cannot have more than 5 options' })
      });

      const { container } = render(<CreatePoll onPollCreated={mockOnPollCreated} />);

      const questionInput = screen.getByLabelText('Question');
      fireEvent.change(questionInput, { target: { value: 'Test?' } });

      // Add options to get 6 total
      const addButton = screen.getByText('+ Add Option');
      fireEvent.click(addButton);
      fireEvent.click(addButton);
      fireEvent.click(addButton);

      const optionInputs = screen.getAllByPlaceholderText(/Option \d+/);
      optionInputs.forEach((input, i) => {
        fireEvent.change(input, { target: { value: `Option ${i + 1}` } });
      });

      const form = container.querySelector('form');
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText('Poll cannot have more than 5 options')).toBeInTheDocument();
      });
    });

    it('should display backend error for empty question', async () => {
      const mockOnPollCreated = jest.fn();
      
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Question is required' })
      });

      const { container } = render(<CreatePoll onPollCreated={mockOnPollCreated} />);

      const questionInput = screen.getByLabelText('Question');
      fireEvent.change(questionInput, { target: { value: '   ' } });

      const optionInputs = screen.getAllByPlaceholderText(/Option \d+/);
      fireEvent.change(optionInputs[0], { target: { value: 'Pizza' } });
      fireEvent.change(optionInputs[1], { target: { value: 'Sushi' } });

      const form = container.querySelector('form');
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText('Question is required')).toBeInTheDocument();
      });
    });
  });

  describe('Successful Poll Creation', () => {
    it('should call onPollCreated with poll ID on success', async () => {
      const mockOnPollCreated = jest.fn();
      
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ pollId: 'ABC123' })
      });

      const { container } = render(<CreatePoll onPollCreated={mockOnPollCreated} />);

      const questionInput = screen.getByLabelText('Question');
      fireEvent.change(questionInput, { target: { value: 'Favorite food?' } });

      const optionInputs = screen.getAllByPlaceholderText(/Option \d+/);
      fireEvent.change(optionInputs[0], { target: { value: 'Pizza' } });
      fireEvent.change(optionInputs[1], { target: { value: 'Sushi' } });

      const form = container.querySelector('form');
      fireEvent.submit(form);

      await waitFor(() => {
        expect(mockOnPollCreated).toHaveBeenCalledWith('ABC123');
      });
    });

    it('should trim whitespace from question and options', async () => {
      const mockOnPollCreated = jest.fn();
      
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ pollId: 'ABC123' })
      });

      const { container } = render(<CreatePoll onPollCreated={mockOnPollCreated} />);

      const questionInput = screen.getByLabelText('Question');
      fireEvent.change(questionInput, { target: { value: '  Favorite food?  ' } });

      const optionInputs = screen.getAllByPlaceholderText(/Option \d+/);
      fireEvent.change(optionInputs[0], { target: { value: '  Pizza  ' } });
      fireEvent.change(optionInputs[1], { target: { value: '  Sushi  ' } });

      const form = container.querySelector('form');
      fireEvent.submit(form);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/polls',
          expect.objectContaining({
            body: JSON.stringify({
              question: 'Favorite food?',
              options: ['Pizza', 'Sushi']
            })
          })
        );
      });
    });

    it('should show loading state during submission', async () => {
      fetch.mockImplementationOnce(() => new Promise(resolve => setTimeout(resolve, 100)));

      const { container } = render(<CreatePoll onPollCreated={jest.fn()} />);

      const questionInput = screen.getByLabelText('Question');
      fireEvent.change(questionInput, { target: { value: 'Test?' } });

      const optionInputs = screen.getAllByPlaceholderText(/Option \d+/);
      fireEvent.change(optionInputs[0], { target: { value: 'A' } });
      fireEvent.change(optionInputs[1], { target: { value: 'B' } });

      const form = container.querySelector('form');
      fireEvent.submit(form);

      expect(screen.getByText('Creating...')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should display generic error on network failure', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const { container } = render(<CreatePoll onPollCreated={jest.fn()} />);

      const questionInput = screen.getByLabelText('Question');
      fireEvent.change(questionInput, { target: { value: 'Test?' } });

      const optionInputs = screen.getAllByPlaceholderText(/Option \d+/);
      fireEvent.change(optionInputs[0], { target: { value: 'A' } });
      fireEvent.change(optionInputs[1], { target: { value: 'B' } });

      const form = container.querySelector('form');
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText('Failed to create poll. Please try again.')).toBeInTheDocument();
      });
    });
  });
});
