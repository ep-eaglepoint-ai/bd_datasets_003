
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';

// Use `@project` alias for components and hooks
import { DataTable } from '@project/components/DataTable';
import { Filters } from '@project/components/Filters';
import { Charts } from '@project/components/Charts';
import { useDashboardStore } from '@project/store/dashboardStore';
import { useWebSocket } from '@project/hooks/useWebSocket';

class MockWebSocket {
    url: string;
    onmessage: ((ev: any) => void) | null = null;
    onerror: ((ev: any) => void) | null = null;
    onclose: ((ev: any) => void) | null = null;
    readyState = 1;
    static instances: MockWebSocket[] = [];

    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url: string) {
        this.url = url;
        MockWebSocket.instances.push(this);
    }
    send = vi.fn();
    close = vi.fn();
}

describe('Dashboard Performance Requirements', () => {
    beforeEach(() => {
        act(() => {
            useDashboardStore.setState({
                transactions: [],
                filters: {
                    dateRange: { start: null, end: null },
                    status: [],
                    minAmount: null,
                    maxAmount: null,
                    categories: [],
                    searchQuery: '',
                },
                stats: {
                    totalAmount: 0,
                    transactionCount: 0,
                    averageAmount: 0,
                    statusBreakdown: {},
                    categoryBreakdown: {},
                },
                isLoading: false
            });
        });
        vi.clearAllMocks();
        MockWebSocket.instances = [];
        global.WebSocket = MockWebSocket as any;
    });

    it('Requirement 1: Table implements row virtualization', async () => {
        const data = Array.from({ length: 1000 }, (_, i) => ({
            id: `${i}`,
            date: '2024-01-01',
            amount: 100,
            status: 'completed' as const,
            category: 'Food',
            description: `desc ${i}`,
            merchant: 'M',
            user: { id: '1', name: 'U', email: 'u@e.com' },
            metadata: {}
        }));

        act(() => {
            useDashboardStore.getState().setTransactions(data);
        });

        render(<DataTable />);

        await act(async () => {
            await new Promise(r => setTimeout(r, 0));
        });

        const rowElements = document.querySelectorAll('tbody tr');
        expect(rowElements.length).toBeLessThanOrEqual(50);
        expect(rowElements.length).toBeGreaterThan(0);
    });

    it('Requirement 2: Search input is debounced with min 300ms', async () => {
        vi.useFakeTimers();
        render(<Filters />);

        const input = screen.getByPlaceholderText(/search/i);
        fireEvent.change(input, { target: { value: 'pizza' } });

        expect(useDashboardStore.getState().filters.searchQuery).toBe('');

        act(() => { vi.advanceTimersByTime(299); });
        expect(useDashboardStore.getState().filters.searchQuery).toBe('');

        act(() => { vi.advanceTimersByTime(1); });
        expect(useDashboardStore.getState().filters.searchQuery).toBe('pizza');

        vi.useRealTimers();
    });

    it('Requirement 5: WebSocket hook uses getState() pattern', () => {
        const wsConstructorSpy = vi.spyOn(global, 'WebSocket');

        const { rerender } = render(<TestWebSocketComponent />);
        const callCount = wsConstructorSpy.mock.calls.length;

        act(() => {
            useDashboardStore.setState({ isLoading: true });
        });

        expect(wsConstructorSpy.mock.calls.length).toBe(callCount);
    });

    it('Requirement 8: Cleanup removes listeners', () => {
        const { unmount } = render(<TestWebSocketComponent />);
        const wsInstance = MockWebSocket.instances[0];
        unmount();
        expect(wsInstance.close).toHaveBeenCalled();
    });

    it('Requirement 10: Correct Zustand middleware (immer)', () => {
        act(() => {
            useDashboardStore.setState((state: any) => {
                state.isLoading = true;
            });
        });
        expect(useDashboardStore.getState().isLoading).toBe(true);
    });
});

function TestWebSocketComponent() {
    useWebSocket('ws://localhost:8080/ws');
    return null;
}
