import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../repository_after/frontend/App';
import * as api from '../../repository_after/frontend/services/client';

jest.mock('../../repository_after/frontend/services/client');

describe('Optimistic Move', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (api.fetchBoard as jest.Mock).mockResolvedValue({
            columns: [
                { id: 'col-1', title: 'To Do', cards: [{ id: 'card-1', title: 'Task 1' }] },
                { id: 'col-2', title: 'Done', cards: [] },
            ],
        });
    });

    it('should update the UI immediately on drop', async () => {
        // Mock moveCardApi to stay pending
        let resolveMove: any;
        const movePromise = new Promise((resolve) => { resolveMove = resolve; });
        (api.moveCardApi as jest.Mock).mockReturnValue(movePromise);

        render(<App />);

        // Wait for initial load
        await waitFor(() => expect(screen.getByText('Task 1')).toBeInTheDocument());

        const card = screen.getByText('Task 1');
        const targetColumn = screen.getByText('Done').closest('.column')!;

        // Simulate drag start
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

        // Simulate drop
        fireEvent.drop(targetColumn, {
            dataTransfer: {
                getData: (k: string) => data[k] || '',
            }
        });

        // Assert immediately updated in DOM (Requirement 1)
        const col2 = screen.getByText('Done').closest('.column')!;
        expect(col2).toHaveTextContent('Task 1');

        const col1 = screen.getByText('To Do').closest('.column')!;
        expect(col1).not.toHaveTextContent('Task 1');

        // Clean up
        resolveMove({ success: true, board: { columns: [] } });
    });
});
