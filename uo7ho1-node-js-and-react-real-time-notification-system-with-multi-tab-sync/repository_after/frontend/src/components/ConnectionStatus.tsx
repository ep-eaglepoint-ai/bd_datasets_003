// Connection status indicator component
// Requirement 7: Visual indicator with three states and ARIA live region

import React from 'react';
import { useNotificationStore } from '../stores/notificationStore';
import type { ConnectionStatus as ConnectionStatusType } from '../types';

const statusConfig: Record<
  ConnectionStatusType,
  { color: string; label: string; pulseClass: string }
> = {
  connected: {
    color: '#22c55e', // Green
    label: 'Connected',
    pulseClass: '',
  },
  reconnecting: {
    color: '#eab308', // Yellow
    label: 'Reconnecting',
    pulseClass: 'connection-status-pulse',
  },
  disconnected: {
    color: '#ef4444', // Red
    label: 'Disconnected',
    pulseClass: '',
  },
};

export const ConnectionStatus: React.FC = () => {
  const connectionStatus = useNotificationStore((state) => state.connectionStatus);
  const config = statusConfig[connectionStatus];

  return (
    <>
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          .connection-status-pulse {
            animation: pulse 1.5s ease-in-out infinite;
          }
          .connection-status-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            display: inline-block;
          }
          .connection-status-container {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: #6b7280;
          }
        `}
      </style>
      <div className="connection-status-container">
        {/* Requirement 7: ARIA live region for screen reader announcements */}
        <span
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
          style={{
            position: 'absolute',
            width: '1px',
            height: '1px',
            padding: 0,
            margin: '-1px',
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        >
          Connection status: {config.label}
        </span>

        {/* Visual indicator */}
        <span
          className={`connection-status-dot ${config.pulseClass}`}
          style={{ backgroundColor: config.color }}
          aria-hidden="true"
        />
        <span aria-hidden="true">{config.label}</span>
      </div>
    </>
  );
};
