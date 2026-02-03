// BroadcastChannel hook for multi-tab coordination
// Requirement 3: Single tab toast display
// Requirement 4: Multi-tab read state sync
// Requirement 10: Proper cleanup on unmount

import { useEffect, useRef, useCallback } from 'react';
import type { BroadcastMessage } from '../types';
import { useNotificationStore } from '../stores/notificationStore';

// Generate unique tab ID
const TAB_ID = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export const useBroadcastChannel = () => {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const toastShownIdsRef = useRef<Set<string>>(new Set());

  const { markAsRead, markAllAsRead, setUnreadCount } = useNotificationStore();

  // Initialize BroadcastChannel
  useEffect(() => {
    // Requirement 3 & 4: Use BroadcastChannel API for tab coordination
    const channel = new BroadcastChannel('notification-channel');
    channelRef.current = channel;

    // Handle messages from other tabs
    const handleMessage = (event: MessageEvent<BroadcastMessage>) => {
      const { type, payload } = event.data;

      switch (type) {
        case 'toast-shown':
          // Requirement 3: Track which notifications have shown toasts
          if (payload.notificationId) {
            toastShownIdsRef.current.add(payload.notificationId);
          }
          break;

        case 'notification-read':
          // Requirement 4: Sync read state across tabs
          if (payload.notificationId) {
            markAsRead(payload.notificationId);
          }
          break;

        case 'all-read':
          // Sync mark-all-as-read across tabs
          markAllAsRead();
          break;

        case 'unread-count-update':
          // Requirement 6: Keep unread count in sync
          if (typeof payload.unreadCount === 'number') {
            setUnreadCount(payload.unreadCount);
          }
          break;
      }
    };

    channel.addEventListener('message', handleMessage);

    // Requirement 10: Cleanup on unmount
    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
      channelRef.current = null;
    };
  }, [markAsRead, markAllAsRead, setUnreadCount]);

  // Requirement 3: Check if toast should be shown for this notification
  const shouldShowToast = useCallback((notificationId: string): boolean => {
    // If we've already seen a toast-shown message for this notification, don't show
    if (toastShownIdsRef.current.has(notificationId)) {
      return false;
    }

    // This tab will show the toast - broadcast to other tabs
    toastShownIdsRef.current.add(notificationId);

    channelRef.current?.postMessage({
      type: 'toast-shown',
      payload: { notificationId, tabId: TAB_ID },
    } satisfies BroadcastMessage);

    return true;
  }, []);

  // Requirement 4: Broadcast read state to other tabs
  const broadcastRead = useCallback((notificationId: string) => {
    channelRef.current?.postMessage({
      type: 'notification-read',
      payload: { notificationId, tabId: TAB_ID },
    } satisfies BroadcastMessage);
  }, []);

  const broadcastAllRead = useCallback(() => {
    channelRef.current?.postMessage({
      type: 'all-read',
      payload: { tabId: TAB_ID },
    } satisfies BroadcastMessage);
  }, []);

  const broadcastUnreadCount = useCallback((unreadCount: number) => {
    channelRef.current?.postMessage({
      type: 'unread-count-update',
      payload: { unreadCount, tabId: TAB_ID },
    } satisfies BroadcastMessage);
  }, []);

  return {
    tabId: TAB_ID,
    shouldShowToast,
    broadcastRead,
    broadcastAllRead,
    broadcastUnreadCount,
  };
};

export { TAB_ID };
