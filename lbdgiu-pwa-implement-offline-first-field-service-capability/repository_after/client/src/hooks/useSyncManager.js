import { useState, useEffect } from 'react';
import { getPendingReports, markAsSynced } from '../services/db';
import { uploadReport } from '../services/api';

export const useSyncManager = () => {
    const [syncStatus, setSyncStatus] = useState(navigator.onLine ? 'Online' : 'Offline'); // Offline, Syncing..., Success

    const performSync = async () => {
        const pending = await getPendingReports();
        if (pending.length === 0) return;

        setSyncStatus('Syncing...');

        // Chunking (Process 5 reports at a time)
        const CHUNK_SIZE = 5;
        for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
            const chunk = pending.slice(i, i + CHUNK_SIZE);

            await Promise.all(chunk.map(async (report) => {
                try {
                    await uploadReport(report);
                    await markAsSynced(report.id); // Update status in IndexedDB
                } catch (err) {
                    console.error(`Failed to sync report ${report.id}:`, err);
                }
            }));

            // Small breather to keep UI responsive
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        setSyncStatus('Success');
        setTimeout(() => setSyncStatus(navigator.onLine ? 'Online' : 'Offline'), 3000);
    };

    useEffect(() => {
        // Listen for 'online' event
        const handleOnline = () => {
            setSyncStatus('Online');
            performSync();
        };

        const handleOffline = () => setSyncStatus('Offline');

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Initial check
        if (navigator.onLine) performSync();

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return { syncStatus, performSync };
};