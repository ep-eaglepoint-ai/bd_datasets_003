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
                {
                    id: 'col-1', title: 'To Do', cards: [
                        { id: 'card-1', title: 'Task 1' },
                        { id: 'card-2', title: 'Task 2' },
                        { id: 'card-3', title: 'Task 3' },
                    ]
                },
                { id: 'col-2', title: 'Done', cards: [] },
            ],
        });
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should rollback and restore the EXACT original index on API failure', async () => {
        // Mock moveCardApi to fail
        (api.moveCardApi as jest.Mock).mockRejectedValue(new Error('Network error'));

        render(<App />);

        // Wait for initial load
        await act(async () => {
            await Promise.resolve();
        });
        await waitFor(() => expect(screen.getByText('Task 2')).toBeInTheDocument());

        const task2 = screen.getByText('Task 2');
        const targetColumn = screen.getByText('Done').closest('.column')!;

        // Simulate dragging Task 2 (index 1) to Done
        const data: Record<string, string> = {
            cardId: 'card-2',
            fromColumnId: 'col-1',
            fromIndex: '1'
        };

        fireEvent.dragStart(task2, {
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

        // Check optimistic update: Task 2 should be in Done
        expect(screen.getByText('Done').closest('.column')).toHaveTextContent('Task 2');

        // Advance timers to trigger the debounced API call
        act(() => {
            jest.advanceTimersByTime(500);
        });

        await act(async () => {
            await Promise.resolve();
        });

        // Wait for rollback
        await waitFor(() => {
            expect(screen.getByText('To Do').closest('.column')).toHaveTextContent('Task 2');
        });

        // VERIFY ORDER: Task 2 must be between Task 1 and Task 3
        const todoColumn = screen.getByText('To Do').closest('.column')!;
        const cards = todoColumn.querySelectorAll('.card');
        expect(cards).toHaveLength(3);
        expect(cards[0]).toHaveTextContent('Task 1');
        expect(cards[1]).toHaveTextContent('Task 2');
        expect(cards[2]).toHaveTextContent('Task 3');

        expect(screen.getByText('Done').closest('.column')).not.toHaveTextContent('Task 2');

        // Assert toast visibility
        expect(screen.getByText('Failed to move card. Changes reverted.')).toBeInTheDocument();
    });
});
