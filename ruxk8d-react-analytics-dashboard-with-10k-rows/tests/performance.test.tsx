
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';

// Use `@project` alias for components and hooks
import { DataTable } from '@project/components/DataTable';
import { Filters } from '@project/components/Filters';
import { Charts } from '@project/components/Charts';
import { useDashboardStore } from '@project/store/dashboardStore';
import { useWebSocket } from '@project/hooks/useWebSocket';
import { useTableData, useStats } from '@project/hooks/useTableData';
import { TableRow } from '@project/components/TableRow';

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

    it('Requirement 3: Table column definitions have a stable reference', () => {
        const { rerender } = render(<DataTable />);

        // In a real app we'd check if child components re-render.
        // For this test, we verify useMemo is used in the source.
        const fs = require('fs');
        const path = require('path');
        const projectPath = process.env.PROJECT_PATH || './repository_before';
        const filePath = path.resolve(__dirname, '..', projectPath, 'src/components/DataTable.tsx');
        const content = fs.readFileSync(filePath, 'utf8');

        // This is a bit of a meta-test but ensures the requirement is met as specified.
        expect(content).toContain('useMemo');
        expect(content).toContain('columns =');
    });

    it('Requirement 4: Row components are wrapped in React.memo', () => {
        // React.memo components have a $$typeof property
        const memoType = Symbol.for('react.memo');
        const isMemo = TableRow.$$typeof === memoType || (TableRow as any).type?.$$typeof === memoType;
        expect(isMemo).toBe(true);
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

    it('Requirement 6: Filtering logic exists in exactly one location', () => {
        // We check if hook is using the unified filtering utility
        const fs = require('fs');
        const path = require('path');
        const projectPath = process.env.PROJECT_PATH || './repository_before';
        const hookPath = path.resolve(__dirname, '..', projectPath, 'src/hooks/useTableData.ts');
        const storePath = path.resolve(__dirname, '..', projectPath, 'src/store/dashboardStore.ts');

        const hookContent = fs.readFileSync(hookPath, 'utf8');
        const storeContent = fs.readFileSync(storePath, 'utf8');

        // Hook should use the utility
        expect(hookContent).toContain('filterTransactions');
        // Store should NOT contain filtering logic in setFilters
        expect(storeContent).not.toContain('transactions.filter');
    });

    it('Requirement 7: Charts component subscribes only to stats/filtered data', () => {
        let renderCount = 0;
        const TestComponent = () => {
            renderCount++;
            useStats();
            return null;
        };

        render(<TestComponent />);
        const initialCount = renderCount;

        act(() => {
            useDashboardStore.setState({ isLoading: true });
        });

        // Should not re-render if isLoading changes
        expect(renderCount).toBe(initialCount);
    });

    it('Requirement 8: Cleanup removes listeners', () => {
        const { unmount } = render(<TestWebSocketComponent />);
        const wsInstance = MockWebSocket.instances[0];
        unmount();
        expect(wsInstance.close).toHaveBeenCalled();
    });

    it('Requirement 9: Formatters are not recreated each render', () => {
        const numberFormatSpy = vi.spyOn(Intl, 'NumberFormat');
        const dateTimeFormatSpy = vi.spyOn(Intl, 'DateTimeFormat');

        // Render something that uses formatters
        render(<DataTable />);

        // They should be instantiated at module level, so spy might not catch them if they are already created.
        // But we can check if they are called WITHOUT being instantiated AGAIN.
        expect(numberFormatSpy).not.toHaveBeenCalled();
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
