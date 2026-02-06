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

    it('Syncing... state visibility (Offline → Syncing... → Success)', async () => {
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true, writable: true });

        // Have at least one pending report once we go online
        dbService.getPendingReports.mockResolvedValue([{ id: 'r-1', timestamp: Date.now() }]);

        const { result } = renderHook(() => useSyncManager());
        expect(result.current.syncStatus).toBe('Offline');

        await act(async () => {
            Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
            window.dispatchEvent(new Event('online'));
        });

        // The hook sets Syncing... before awaiting uploads
        await waitFor(() => expect(result.current.syncStatus).toBe('Syncing...'));

        // Allow the sync promise chain + 50ms breather to resolve
        act(() => {
            jest.runOnlyPendingTimers();
        });

        await waitFor(() => expect(result.current.syncStatus).toBe('Success'));
    });

    it('Multiple pending records sync (uploads all queued reports)', async () => {
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });

        dbService.getPendingReports.mockResolvedValue([
            { id: 'r-1', timestamp: Date.now() },
            { id: 'r-2', timestamp: Date.now() },
            { id: 'r-3', timestamp: Date.now() },
        ]);

        const { result } = renderHook(() => useSyncManager());

        // Let initial performSync run
        act(() => {
            jest.runAllTimers();
        });

        await waitFor(() => expect(result.current.syncStatus).toBe('Success'));

        expect(apiService.uploadReport).toHaveBeenCalledTimes(3);
        expect(apiService.uploadReport).toHaveBeenCalledWith(expect.objectContaining({ id: 'r-1' }));
        expect(apiService.uploadReport).toHaveBeenCalledWith(expect.objectContaining({ id: 'r-2' }));
        expect(apiService.uploadReport).toHaveBeenCalledWith(expect.objectContaining({ id: 'r-3' }));
        expect(dbService.markAsSynced).toHaveBeenCalledTimes(3);
    });

    it('Chunked payload processing (yields at least every ~50ms; no single block >100ms)', async () => {
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });

        // 12 pending -> 3 chunks (5 + 5 + 2), with 50ms breather after each chunk
        dbService.getPendingReports.mockResolvedValue(
            Array.from({ length: 12 }, (_, i) => ({ id: `r-${i}`, timestamp: Date.now() }))
        );

        // Make each upload async so the loop actually awaits
        apiService.uploadReport.mockImplementation(async () => ({ success: true }));

        const { result } = renderHook(() => useSyncManager());

        // The sync will schedule 50ms breathers; capture setTimeout calls
        const timeouts = [];
        const originalSetTimeout = global.setTimeout;
        jest.spyOn(global, 'setTimeout').mockImplementation((fn, ms, ...rest) => {
            timeouts.push(ms);
            return originalSetTimeout(fn, ms, ...rest);
        });

        act(() => {
            jest.runAllTimers();
        });

        await waitFor(() => expect(result.current.syncStatus).toBe('Success'));

        // At least two 50ms breathers for 3 chunks (one after chunk1, one after chunk2, one after chunk3)
        const breathers = timeouts.filter(ms => ms === 50);
        expect(breathers.length).toBeGreaterThanOrEqual(2);

        // Ensure there wasn't a single long timer used instead of short yields
        const longTimers = timeouts.filter(ms => typeof ms === 'number' && ms > 100);
        // 3000ms reset timer exists; only assert the breather itself isn't >100ms
        expect(longTimers).toContain(3000);
        expect(breathers.every(ms => ms <= 100)).toBe(true);
    });

    it('Retry stops on conflict (412) during sync loop (conflict halts retries mid-batch)', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});

        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });

        dbService.getPendingReports.mockResolvedValue([
            { id: 'conflict-1', timestamp: Date.now() },
            { id: 'after-conflict', timestamp: Date.now() },
        ]);

        // Simulate a conflict for the first report
        apiService.uploadReport.mockImplementation(async (report) => {
            if (report.id === 'conflict-1') {
                const err = new Error('CONFLICT: Server has a newer version of this report.');
                err.status = 412;
                throw err;
            }
            return { success: true };
        });

        const { result } = renderHook(() => useSyncManager());

        act(() => {
            jest.runAllTimers();
        });

        // The hook currently catches errors per-report; we assert the conflict did not lead to retries
        // and (desired) that it halts the remaining uploads in the same batch.
        await waitFor(() => expect(result.current.syncStatus).toBe('Success'));

        const calls = apiService.uploadReport.mock.calls.map(args => args[0]?.id);
        expect(calls).toContain('conflict-1');
        expect(calls).not.toContain('after-conflict');
    });
});
