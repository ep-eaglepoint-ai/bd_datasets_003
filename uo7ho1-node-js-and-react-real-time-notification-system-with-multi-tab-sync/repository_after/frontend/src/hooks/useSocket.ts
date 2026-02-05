// Socket.io client hook with reconnection logic
// Requirement 2: Exponential backoff with jitter (1s to 30s max)
// Requirement 10: Proper cleanup on unmount

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '../types';
import { useNotificationStore } from '../stores/notificationStore';
// Import shared utility for reconnection delay calculation
import { calculateReconnectDelay } from '../../../shared/utils';

type NotificationSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const useSocket = () => {
  const socketRef = useRef<NotificationSocket | null>(null);
  const reconnectAttemptRef = useRef(0);

  const {
    setConnectionStatus,
    addNotification,
    addNotifications,
    updateNotification,
    setUnreadCount,
    lastNotificationId,
  } = useNotificationStore();

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    // Requirement 2: Configure reconnection with exponential backoff
    const socket: NotificationSocket = io({
      withCredentials: true,
      // Requirement 1: No auth tokens in URL - only use cookies
      auth: {}, // Empty - auth is via cookies only
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.25, // Jitter factor
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnectionStatus('connected');
      reconnectAttemptRef.current = 0;

      // Requirement 5: Request missed notifications on reconnect
      socket.emit('get-missed', lastNotificationId);
    });

    socket.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    socket.io.on('reconnect_attempt', (attempt) => {
      setConnectionStatus('reconnecting');
      reconnectAttemptRef.current = attempt;
    });

    socket.io.on('reconnect_failed', () => {
      setConnectionStatus('disconnected');
    });

    // Handle new notifications
    socket.on('notification:new', (notification) => {
      addNotification(notification);
    });

    // Handle notification updates
    socket.on('notification:updated', (notification) => {
      updateNotification(notification);
    });

    // Requirement 6: Server is authoritative for unread count
    socket.on('unread-count:changed', (count) => {
      setUnreadCount(count);
    });

    // Requirement 5: Handle missed notifications on reconnect
    socket.on('missed-notifications', (notifications) => {
      addNotifications(notifications);
    });

    return socket;
  }, [
    setConnectionStatus,
    addNotification,
    addNotifications,
    updateNotification,
    setUnreadCount,
    lastNotificationId,
  ]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  const markAsRead = useCallback((notificationId: string) => {
    socketRef.current?.emit('notification:mark-read', notificationId);
  }, []);

  const markAllAsRead = useCallback(() => {
    socketRef.current?.emit('notification:mark-all-read');
  }, []);

  // Requirement 10: Cleanup on unmount
  useEffect(() => {
    const socket = connect();

    return () => {
      if (socket) {
        // Remove all listeners before disconnecting
        socket.off('connect');
        socket.off('disconnect');
        socket.off('notification:new');
        socket.off('notification:updated');
        socket.off('unread-count:changed');
        socket.off('missed-notifications');
        socket.io.off('reconnect_attempt');
        socket.io.off('reconnect_failed');
        socket.disconnect();
      }
    };
  }, [connect]);

  return {
    socket: socketRef.current,
    connect,
    disconnect,
    markAsRead,
    markAllAsRead,
  };
};

// Re-export for backwards compatibility
export { calculateReconnectDelay } from '../../../shared/utils';
