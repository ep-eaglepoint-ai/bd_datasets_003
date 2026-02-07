import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from '../../repository_after/frontend/App';
import * as api from '../../repository_after/frontend/services/client';

jest.mock('../../repository_after/frontend/services/client');

describe('Rollback on Failure', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (api.fetchBoard as jest.Mock).mockResolvedValue({
            columns: [
                { id: 'col-1', title: 'To Do', cards: [{ id: 'card-1', title: 'Task 1' }] },
                { id: 'col-2', title: 'Done', cards: [] },
            ],
        });
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should rollback and show toast on API failure', async () => {
        // Mock moveCardApi to fail
        (api.moveCardApi as jest.Mock).mockRejectedValue(new Error('Network error'));

        render(<App />);

        // Wait for initial load
        await act(async () => {
            await Promise.resolve(); // Allow fetchBoard to resolve
        });
        await waitFor(() => expect(screen.getByText('Task 1')).toBeInTheDocument());

        const card = screen.getByText('Task 1');
        const targetColumn = screen.getByText('Done').closest('.column')!;

        // Simulate drag and drop
        const data: Record<string, string> = {
            cardId: 'card-1',
            fromColumnId: 'col-1',
            fromIndex: '0'
        };

        fireEvent.dragStart(card, {
            dataTransfer: {
                setData: (k: string, v: string) => { data[k] = v; },
                getData: (k: string) => data[k] || '',
            }
        });

        fireEvent.drop(targetColumn, {
            dataTransfer: {
                getData: (k: string) => data[k] || '',
            }
        });

        // Check optimistic update
        expect(screen.getByText('Done').closest('.column')).toHaveTextContent('Task 1');

        // Advance timers to trigger the debounced API call
        act(() => {
            jest.advanceTimersByTime(500);
        });

        // We need to wait for the async part of the setTimeout to complete
        await act(async () => {
            await Promise.resolve(); // This allows the rejected promise in useMoveCard to settle
        });

        // Wait for rollback (Requirement 2 & 7)
        await waitFor(() => {
            expect(screen.getByText('To Do').closest('.column')).toHaveTextContent('Task 1');
        });
        expect(screen.getByText('Done').closest('.column')).not.toHaveTextContent('Task 1');

        // Assert toast visibility (Requirement 4)
        expect(screen.getByText('Failed to move card. Changes reverted.')).toBeInTheDocument();
    });
});
