import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from '../../repository_after/frontend/App';
import * as api from '../../repository_after/frontend/services/client';

jest.mock('../../repository_after/frontend/services/client');

describe('Rapid Fire Debounce', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (api.fetchBoard as jest.Mock).mockResolvedValue({
            columns: [
                { id: 'col-1', title: 'To Do', cards: [{ id: 'card-1', title: 'Task 1' }] },
                { id: 'col-2', title: 'In Progress', cards: [] },
                { id: 'col-3', title: 'Done', cards: [] },
            ],
        });
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should debounce multiple rapid moves', async () => {
        (api.moveCardApi as jest.Mock).mockResolvedValue({ success: true });

        render(<App />);

        await act(async () => { await Promise.resolve(); });
        await waitFor(() => expect(screen.getByText('Task 1')).toBeInTheDocument());

        const card = screen.getByText('Task 1');
        const col2 = screen.getByText('In Progress').closest('.column')!;
        const col3 = screen.getByText('Done').closest('.column')!;

        // Move 1: To col-2
        fireEvent.dragStart(card, {
            dataTransfer: {
                setData: () => { },
                getData: (k: string) => ({ cardId: 'card-1', fromColumnId: 'col-1', fromIndex: '0' }[k] || '')
            }
        });
        fireEvent.drop(col2, {
            dataTransfer: {
                getData: (k: string) => ({ cardId: 'card-1', fromColumnId: 'col-1', fromIndex: '0' }[k] || '')
            }
        });

        // Advance 200ms
        act(() => { jest.advanceTimersByTime(200); });

        // Move 2: To col-3
        fireEvent.dragStart(screen.getByText('Task 1'), {
            dataTransfer: {
                setData: () => { },
                getData: (k: string) => ({ cardId: 'card-1', fromColumnId: 'col-2', fromIndex: '0' }[k] || '')
            }
        });
        fireEvent.drop(col3, {
            dataTransfer: {
                getData: (k: string) => ({ cardId: 'card-1', fromColumnId: 'col-2', fromIndex: '0' }[k] || '')
            }
        });

        // Advance another 200ms
        act(() => { jest.advanceTimersByTime(200); });

        // Move 3: Back to col-1
        const col1 = screen.getByText('To Do').closest('.column')!;
        fireEvent.dragStart(screen.getByText('Task 1'), {
            dataTransfer: {
                setData: () => { },
                getData: (k: string) => ({ cardId: 'card-1', fromColumnId: 'col-3', fromIndex: '0' }[k] || '')
            }
        });
        fireEvent.drop(col1, {
            dataTransfer: {
                getData: (k: string) => ({ cardId: 'card-1', fromColumnId: 'col-3', fromIndex: '0' }[k] || '')
            }
        });

        // Advance 600ms to trigger the last move
        act(() => { jest.advanceTimersByTime(600); });

        await act(async () => {
            await Promise.resolve();
        });

        // Should only have called API ONCE for the final destination (Requirement 3 & 8)
        expect(api.moveCardApi).toHaveBeenCalledTimes(1);
        expect(api.moveCardApi).toHaveBeenCalledWith(expect.objectContaining({
            targetColumnId: 'col-1',
            targetIndex: 0
        }));
    });
});
