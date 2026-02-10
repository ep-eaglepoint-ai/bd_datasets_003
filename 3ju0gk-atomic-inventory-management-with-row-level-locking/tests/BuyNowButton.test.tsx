import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios'; 

// Import matchers and extend expect to fix the .toBeDisabled/toBeInTheDocument errors
import * as matchers from '@testing-library/jest-dom/matchers';
expect.extend(matchers);

import BuyNowButton from '../repository_after/frontend/src/BuyButton'; 

// Mock axios
vi.mock('axios');

describe('BuyNowButton', () => {
  const defaultProps = {
    productId: 1, 
    userId: 777,
    price: 59.99,
    productName: 'Flash Hoodie',
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the button with correct text', () => {
    render(<BuyNowButton {...defaultProps} />);
    // Target the button specifically to verify content
    expect(screen.getByRole('button')).toHaveTextContent('Buy Now');
  });

  it('disables button and shows "Processing..." when clicked', async () => {
    // We mock axios with a slight delay so the "loading" state doesn't disappear instantly
    vi.mocked(axios.post).mockImplementationOnce(() => 
      new Promise((resolve) => setTimeout(() => resolve({ data: {} }), 100))
    );

    render(<BuyNowButton {...defaultProps} />);
    const button = screen.getByRole('button', { name: /Buy Now/i });

    await userEvent.click(button);

    // Use waitFor to handle the async state update in React
    await waitFor(() => {
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent(/Processing/i);
    });
  });

  it('calls onSuccess when purchase succeeds', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        success: true,
        remaining_stock: 4,
        new_balance: 140.01,
      },
    });

    render(<BuyNowButton {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /Buy Now/i }));

    // Looking for the success text rendered in the result div
    await waitFor(() => {
      expect(screen.getByText(/Purchase Successful/i)).toBeInTheDocument();
      expect(screen.getByText(/Stock Left: 4/i)).toBeInTheDocument();
    });
  });

  it('shows error message when purchase fails', async () => {
    vi.mocked(axios.post).mockRejectedValueOnce({
      response: {
        data: { error: 'Out of stock' },
      },
    });

    render(<BuyNowButton {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /Buy Now/i }));

    await waitFor(() => {
      // Use RegEx (/Out of stock/i) to match text even with the ⚠️ emoji present
      expect(screen.getByText(/Out of stock/i)).toBeInTheDocument();
    });

    expect(defaultProps.onSuccess).not.toHaveBeenCalled();
  });

  it('prevents double-click during loading', async () => {
    // Mock an unresolved promise to keep the button in loading state
    vi.mocked(axios.post).mockImplementationOnce(() => new Promise(() => {})); 

    render(<BuyNowButton {...defaultProps} />);
    const button = screen.getByRole('button', { name: /Buy Now/i });

    // Simulate two clicks
    await userEvent.click(button);
    await userEvent.click(button); 

    // Verification: axios should only be called once because of the 'if (loading) return' check
    expect(axios.post).toHaveBeenCalledTimes(1);
  });
});