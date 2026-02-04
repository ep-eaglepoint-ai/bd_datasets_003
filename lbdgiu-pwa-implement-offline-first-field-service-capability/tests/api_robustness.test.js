import { jest } from '@jest/globals';
import { uploadReport } from '../repository_after/client/src/services/api';

describe('API Robustness', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        global.fetch = jest.fn();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('throws error on 412 Conflict immediately without retries', async () => {
        global.fetch.mockResolvedValue({
            status: 412,
            ok: false
        });

        const promise = uploadReport({ id: 'conflicted' });

        // Should reject immediately
        await expect(promise).rejects.toThrow(/CONFLICT/);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});
