const { renderHook, act, waitFor } = require('@testing-library/react');
const dbService = require('../repository_after/client/src/services/db');
const apiService = require('../repository_after/client/src/services/api');
const { useSyncManager } = require('../repository_after/client/src/hooks/useSyncManager');

jest.mock('../repository_after/client/src/services/db');
jest.mock('../repository_after/client/src/services/api');

describe('Sync Manager', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();

        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });

        dbService.getPendingReports.mockResolvedValue([]);
        dbService.markAsSynced.mockResolvedValue(true);
        apiService.uploadReport.mockResolvedValue({ success: true });
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('Network Throttling simulation (Offline -> Wait 30s -> Online)', async () => {
        // Start offline
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true, writable: true });

        const { result } = renderHook(() => useSyncManager());
        expect(result.current.syncStatus).toBe('Offline');

        // Mock pending report
        dbService.getPendingReports.mockResolvedValue([{ id: 'offline-report', timestamp: Date.now() }]);

        // Advance 30s for the hook's interval/timer
        act(() => {
            jest.advanceTimersByTime(30000);
        });

        // Go online and trigger the hook to start syncing
        await act(async () => {
            Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
            window.dispatchEvent(new Event('online'));

            // Run all timers that trigger state updates inside the hook
            jest.runAllTimers();
        });

        // Wait for the final state to be "Success"
        await waitFor(() => expect(result.current.syncStatus).toBe('Success'));

        // Assert API was called
        expect(apiService.uploadReport).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'offline-report' })
        );
    });
});
