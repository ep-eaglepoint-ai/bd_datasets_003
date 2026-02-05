const { saveReportLocal, getPendingReports, purgeOldRecords, initDB } = require('../repository_after/client/src/services/db');
const FDBFactory = require('fake-indexeddb/lib/FDBFactory');

beforeAll(() => {
    global.indexedDB = new FDBFactory();
});

describe('IndexedDB Persistence and Cleanup', () => {
    it('should store and retrieve 50+ reports with unique identifiers', async () => {
        for (let i = 0; i < 55; i++) {
            await saveReportLocal({ id: `uuid-${i}`, data: 'test-report' });
        }

        const reports = await getPendingReports();
        const testReports = reports.filter(r => r.id.startsWith('uuid-'));
        expect(testReports.length).toBeGreaterThanOrEqual(55);
        expect(reports[0]).toHaveProperty('timestamp');
        expect(reports[0]).toHaveProperty('status', 'pending');
    });

    it('should purge only synced records older than 7 days', async () => {
        const db = await initDB();

        const eightDaysAgo = Date.now() - (8 * 24 * 60 * 60 * 1000);
        const sixDaysAgo = Date.now() - (6 * 24 * 60 * 60 * 1000);

        const tx = db.transaction('reports', 'readwrite');
        const store = tx.objectStore('reports');
        store.put({ id: 'old-synced', status: 'synced', timestamp: eightDaysAgo });
        store.put({ id: 'old-pending', status: 'pending', timestamp: eightDaysAgo });
        store.put({ id: 'new-synced', status: 'synced', timestamp: sixDaysAgo });

        await new Promise(resolve => { tx.oncomplete = resolve; });
        await purgeOldRecords();

        const verifyTx = db.transaction('reports', 'readonly');
        const verifyStore = verifyTx.objectStore('reports');

        const remaining = await new Promise(resolve => {
            const req = verifyStore.getAll();
            req.onsuccess = e => resolve(e.target.result);
        });

        const ids = remaining.map(r => r.id);
        expect(ids).not.toContain('old-synced');
        expect(ids).toContain('old-pending');
        expect(ids).toContain('new-synced');
    });
});
