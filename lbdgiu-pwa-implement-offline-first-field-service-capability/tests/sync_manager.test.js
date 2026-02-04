import { jest } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react';
import { fileURLToPath } from 'url';
import path from 'path';

// Generate absolute paths to ensure unstable_mockModule finds the files
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../repository_after/client/src/services/db.js');
const API_PATH = path.resolve(__dirname, '../repository_after/client/src/services/api.js');

jest.unstable_mockModule(DB_PATH, () => ({
    getPendingReports: jest.fn(),
    markAsSynced: jest.fn(),
}));

jest.unstable_mockModule(API_PATH, () => ({
    uploadReport: jest.fn(),
}));

// Use the exact same absolute paths for the imports
const dbService = await import(DB_PATH);
const apiService = await import(API_PATH);
const { useSyncManager } = await import('../repository_after/client/src/hooks/useSyncManager');

describe('Sync Manager', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();

        // Default mocks
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
        dbService.getPendingReports.mockResolvedValue([]);
        dbService.markAsSynced.mockResolvedValue(true);
        apiService.uploadReport.mockResolvedValue({ success: true });
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('Network Throttling simulation (Offline -> Wait 30s -> Online)', async () => {
        // Simulate Offline
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true, writable: true });
        const { result } = renderHook(() => useSyncManager());

        expect(result.current.syncStatus).toBe('Offline');

        // Simulate User saving report during disconnection (we assume DB save happens elsewhere, we just mock the result)
        dbService.getPendingReports.mockResolvedValue([{ id: 'offline-report', timestamp: Date.now() }]);

        // Wait 30 seconds
        act(() => {
            jest.advanceTimersByTime(30000);
        });

        // Come back Online
        await act(async () => {
            Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
            window.dispatchEvent(new Event('online'));
        });

        await waitFor(() => expect(result.current.syncStatus).toBe('Syncing...'));

        await act(async () => {
            jest.runAllTimers();
        });

        expect(apiService.uploadReport).toHaveBeenCalledWith(expect.objectContaining({ id: 'offline-report' }));
        expect(result.current.syncStatus).toBe('Success');
    });
});
