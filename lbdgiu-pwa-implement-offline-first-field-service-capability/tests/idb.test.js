import { saveReportLocal, getPendingReports, purgeOldRecords, initDB } from '../repository_after/client/src/services/db';

describe('IndexedDB Persistence and Cleanup', () => {

    it('should store and retrieve 50+ reports with unique identifiers', async () => {
        for (let i = 0; i < 55; i++) {
            await saveReportLocal({ id: `uuid-${i}`, data: 'test-report' });
        }
        const reports = await getPendingReports();

        // Filter by our specific IDs
        const testReports = reports.filter(r => r.id.startsWith('uuid-'));
        expect(testReports.length).toBeGreaterThanOrEqual(55);
        expect(reports[0]).toHaveProperty('timestamp');
        expect(reports[0]).toHaveProperty('status', 'pending');
    });

    it('should purge only synced records older than 7 days', async () => {
        const db = await initDB();

        const eightDaysAgo = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago
        const sixDaysAgo = Date.now() - (6 * 24 * 60 * 60 * 1000);   // 6 days ago

        const setupTx = db.transaction('reports', 'readwrite');
        const setupStore = setupTx.objectStore('reports');

        setupStore.put({ id: 'old-synced', status: 'synced', timestamp: eightDaysAgo });
        setupStore.put({ id: 'old-pending', status: 'pending', timestamp: eightDaysAgo }); // Should stay
        setupStore.put({ id: 'new-synced', status: 'synced', timestamp: sixDaysAgo });     // Should stay

        await new Promise((resolve) => { setupTx.oncomplete = resolve; });
        await purgeOldRecords();

        const verifyTx = db.transaction('reports', 'readonly');
        const verifyStore = verifyTx.objectStore('reports');

        const remaining = await new Promise((resolve) => {
            const req = verifyStore.getAll();
            req.onsuccess = (e) => resolve(e.target.result);
        });

        const ids = remaining.map(r => r.id);

        expect(ids).not.toContain('old-synced');
        expect(ids).toContain('old-pending');
        expect(ids).toContain('new-synced');
    });
});
