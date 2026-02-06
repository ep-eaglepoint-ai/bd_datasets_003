import React from 'react';
import { useSyncManager } from '../hooks/useSyncManager';

const SyncStatusIndicator = () => {
    const { syncStatus } = useSyncManager();

    const statusColors = {
        'Offline': '#ef4444',    // Red
        'Syncing...': '#3b82f6', // Blue
        'Success': '#22c55e',    // Green
        'Online': '#22c55e'      // Green
    };

    return (
        <div style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '10px 20px',
            borderRadius: '20px',
            backgroundColor: statusColors[syncStatus] || '#6b7280',
            color: 'white',
            fontWeight: 'bold',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            transition: 'all 0.3s ease'
        }}>
            Status: {syncStatus}
        </div>
    );
};

export default SyncStatusIndicator;