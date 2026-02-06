const { uploadReport } = require('../repository_after/client/src/services/api');

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
        global.fetch.mockResolvedValue({ status: 412, ok: false });

        const promise = uploadReport({ id: 'conflicted' });

        await expect(promise).rejects.toThrow(/CONFLICT/);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });


    it('retries with exponential backoff and stops after the retry cap', async () => {
        global.fetch.mockResolvedValue({ status: 500, ok: false });

        const delays = [];
        const originalSetTimeout = global.setTimeout;
        jest.spyOn(global, 'setTimeout').mockImplementation((fn, ms, ...rest) => {
            delays.push(ms);
            return originalSetTimeout(fn, ms, ...rest);
        });

    const promise = uploadReport({ id: 'flaky', last_modified: Date.now() });
    const expectation = expect(promise).rejects.toThrow(/Network response was not ok/);

        // attempt 0 runs immediately
        expect(global.fetch).toHaveBeenCalledTimes(1);

    // Let all retries complete under fake timers.
    await jest.runAllTimersAsync();

    // Backoff schedule: 1s, 2s, 4s, 8s, 16s (MAX_RETRIES = 5)
    expect(delays.filter(d => d !== undefined)).toEqual([1000, 2000, 4000, 8000, 16000]);
        expect(global.fetch).toHaveBeenCalledTimes(6); // initial + 5 retries

        await expectation;
    });
});
