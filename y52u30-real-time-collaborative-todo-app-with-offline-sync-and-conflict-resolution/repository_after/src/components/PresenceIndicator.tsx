'use client';

import React from 'react';
import { useTodoStore } from '../store/zustand-store';

export function PresenceIndicator() {
  const presence = useTodoStore((state) => state.presence);
  const userId = useTodoStore((state) => state.userId);

  // Filter out current user
  const otherUsers = presence.filter((p) => p.userId !== userId);

  if (otherUsers.length === 0) {
    return <span style={styles.alone}>Only you</span>;
  }

  return (
    <div style={styles.container}>
      <span style={styles.count}>{otherUsers.length + 1} online</span>
      <div style={styles.avatars}>
        {otherUsers.slice(0, 3).map((user) => (
          <div
            key={user.userId}
            style={styles.avatar}
            title={user.userId}
          >
            {user.userId.charAt(0).toUpperCase()}
          </div>
        ))}
        {otherUsers.length > 3 && (
          <div style={styles.moreAvatar}>+{otherUsers.length - 3}</div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  count: {
    fontSize: '12px',
    color: '#666',
  },
  avatars: {
    display: 'flex',
    gap: '4px',
  },
  avatar: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: '#4CAF50',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  moreAvatar: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: '#999',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
  },
  alone: {
    fontSize: '12px',
    color: '#999',
  },
};
