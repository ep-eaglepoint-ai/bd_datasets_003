import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from '../../repository_after/frontend/App';
import * as api from '../../repository_after/frontend/services/client';

jest.mock('../../repository_after/frontend/services/client');

describe('Race Conditions', () => {
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

    it('should ignore stale error responses', async () => {
        let rejectFirst: any;
        const firstPromise = new Promise((_, reject) => { rejectFirst = reject; });
        const secondPromise = Promise.resolve({ success: true });

        (api.moveCardApi as jest.Mock)
            .mockReturnValueOnce(firstPromise) // Move 1: col-1 -> col-2
            .mockReturnValueOnce(secondPromise); // Move 2: col-2 -> col-1

        render(<App />);
        await act(async () => { await Promise.resolve(); });

        const col1 = () => screen.getByText('To Do').closest('.column')!;
        const col2 = () => screen.getByText('Done').closest('.column')!;

        // Move 1: col-1 -> col-2
        fireEvent.dragStart(screen.getByText('Task 1'), {
            dataTransfer: {
                setData: () => { },
                getData: (k: string) => ({ cardId: 'card-1', fromColumnId: 'col-1', fromIndex: '0' }[k] || '')
            }
        });
        fireEvent.drop(col2(), {
            dataTransfer: {
                getData: (k: string) => ({ cardId: 'card-1', fromColumnId: 'col-1', fromIndex: '0' }[k] || '')
            }
        });

        act(() => { jest.advanceTimersByTime(500); }); // Trigger Move 1 call

        // Move 2: col-2 -> col-1
        fireEvent.dragStart(screen.getByText('Task 1'), {
            dataTransfer: {
                setData: () => { },
                getData: (k: string) => ({ cardId: 'card-1', fromColumnId: 'col-2', fromIndex: '0' }[k] || '')
            }
        });
        fireEvent.drop(col1(), {
            dataTransfer: {
                getData: (k: string) => ({ cardId: 'card-1', fromColumnId: 'col-2', fromIndex: '0' }[k] || '')
            }
        });

        act(() => { jest.advanceTimersByTime(500); }); // Trigger Move 2 call

        // At this point, the UI should be back at col-1 optimistically
        expect(col1()).toHaveTextContent('Task 1');

        // Now make Move 1 FAIL. It should be ignored because Move 2 is the latest. (Requirement 8)
        await act(async () => {
            rejectFirst(new Error('Stale fail'));
        });

        // UI should still be at col-1
        expect(col1()).toHaveTextContent('Task 1');
        expect(screen.queryByText('Failed to move card. Changes reverted.')).not.toBeInTheDocument();
    });
});
