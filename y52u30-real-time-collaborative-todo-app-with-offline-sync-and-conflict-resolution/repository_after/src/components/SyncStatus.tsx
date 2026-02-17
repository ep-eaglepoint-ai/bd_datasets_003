'use client';

import React from 'react';
import { SyncStatus as SyncStatusType } from '../types';

interface SyncStatusProps {
  status: SyncStatusType;
}

export function SyncStatus({ status }: SyncStatusProps) {
  const getStatusInfo = () => {
    switch (status) {
      case 'synced':
        return { text: 'Synced', color: '#4CAF50', icon: 'check' };
      case 'syncing':
        return { text: 'Syncing...', color: '#2196F3', icon: 'sync' };
      case 'pending':
        return { text: 'Pending', color: '#FF9800', icon: 'clock' };
      case 'offline':
        return { text: 'Offline', color: '#9E9E9E', icon: 'offline' };
      case 'error':
        return { text: 'Error', color: '#f44336', icon: 'error' };
      default:
        return { text: 'Unknown', color: '#999', icon: 'question' };
    }
  };

  const { text, color } = getStatusInfo();

  return (
    <div style={{ ...styles.container, color }}>
      <span style={{ ...styles.dot, backgroundColor: color }} />
      <span style={styles.text}>{text}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  text: {
    fontWeight: 500,
  },
};
