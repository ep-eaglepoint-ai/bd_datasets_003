import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import AuctionComponent from '../repository_after/frontend/src/components/AuctionComponent';
import axios from 'axios';
import { io } from 'socket.io-client';

vi.mock('axios');
vi.mock('socket.io-client', () => {
  const mSocket = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
  return { io: vi.fn(() => mSocket) };
});

describe('AuctionComponent Frontend Requirements', () => {
  const mockItemId = 1;
  const mockItem = { id: 1, name: 'Test Item', current_price: 100, end_time: Date.now() + 100000 };
  
  beforeEach(() => {
    vi.clearAllMocks();
    axios.get.mockResolvedValue({ data: { item: mockItem, bids: [] } });
  });

  test('Requirement 7: Displays "You were outbid!" on 409 conflict', async () => {
    axios.post.mockRejectedValueOnce({ response: { status: 409 } });
    render(<AuctionComponent itemId={mockItemId} />);
    
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('Enter your bid'), { target: { value: '150' } });
    fireEvent.click(screen.getByText('Place Bid'));

    await waitFor(() => {
      const msg = screen.getByText('You were outbid!');
      const style = window.getComputedStyle(msg);
      expect(style.color).toMatch(/red|rgb\(255, 0, 0\)/);
    });
  });

  test('Requirement 2 & 4: Updates timer immediately when TIMER_UPDATE is received', async () => {
    const socket = io();
    render(<AuctionComponent itemId={mockItemId} />);
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    const handler = socket.on.mock.calls.find(c => c[0] === 'TIMER_UPDATE' || c[0] === 'NEW_BID')[1];
    await act(async () => {
      handler({ endTime: Date.now() + 200000 });
    });

    await waitFor(() => {
      expect(screen.getByText(/Time Remaining:/).textContent).toMatch(/199s|200s/);
    });
  });

  test('Requirement 6: New bid history updates via WebSocket', async () => {
    const socket = io();
    render(<AuctionComponent itemId={mockItemId} />);
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    const handler = socket.on.mock.calls.find(c => c[0] === 'NEW_BID')[1];
    await act(async () => {
      handler({ amount: 250, userId: 'User_999', endTime: Date.now() + 100000 });
    });

    
    expect(screen.getByText((content) => content.includes('Current Price: $250'))).toBeInTheDocument();
  });

  test('Requirement 3: Displays "Auction ended!" on 400 error', async () => {
    axios.post.mockRejectedValueOnce({ response: { status: 400 } });
    render(<AuctionComponent itemId={mockItemId} />);
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('Enter your bid'), { target: { value: '500' } });
    fireEvent.click(screen.getByText('Place Bid'));
    await waitFor(() => expect(screen.getByText('Auction ended!')).toBeInTheDocument());
  });
});