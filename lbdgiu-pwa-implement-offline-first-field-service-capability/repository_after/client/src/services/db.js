const DB_NAME = 'FieldServiceDB';
const DB_VERSION = 1;
const STORE_NAME = 'reports';

export const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('status', 'status', { unique: false });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const saveReportLocal = async (report) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const entry = {
            ...report,
            status: 'pending',
            timestamp: Date.now(),
            last_modified: Date.now()
        };

        const request = store.put(entry);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
};

export const getPendingReports = async () => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('status');
        const request = index.getAll('pending');

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

/**
 * NEW: Updates a record status to 'synced' after successful API upload
 */
export const markAsSynced = async (id) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
            const data = getRequest.result;
            if (data) {
                data.status = 'synced';
                store.put(data);
            }
            resolve();
        };
        getRequest.onerror = () => reject(getRequest.error);
    });
};

export const purgeOldRecords = async () => {
    const db = await initDB();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - SEVEN_DAYS_MS;

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('timestamp');

        const range = IDBKeyRange.upperBound(cutoff);
        const cursorRequest = index.openCursor(range);

        cursorRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                if (cursor.value.status === 'synced') {
                    cursor.delete();
                }
                cursor.continue();
            }
        };

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
};