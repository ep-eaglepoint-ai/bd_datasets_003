// Zustand notification store with persistence
// Requirement 5: Persist last notification ID for reconnection

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Notification, ConnectionStatus } from '../types';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  connectionStatus: ConnectionStatus;
  lastNotificationId: string | null;
  isLoading: boolean;
  hasMore: boolean;
  nextCursor: string | null;

  // Actions
  setNotifications: (notifications: Notification[]) => void;
  addNotification: (notification: Notification) => void;
  addNotifications: (notifications: Notification[]) => void;
  updateNotification: (notification: Notification) => void;
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
  setUnreadCount: (count: number) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setLastNotificationId: (id: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setPagination: (hasMore: boolean, nextCursor: string | null) => void;
  reset: () => void;
}

const initialState = {
  notifications: [],
  unreadCount: 0,
  connectionStatus: 'disconnected' as ConnectionStatus,
  lastNotificationId: null,
  isLoading: false,
  hasMore: true,
  nextCursor: null,
};

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setNotifications: (notifications) => {
        set({ notifications });
        // Update last notification ID
        if (notifications.length > 0) {
          set({ lastNotificationId: notifications[0].id });
        }
      },

      addNotification: (notification) => {
        set((state) => ({
          notifications: [notification, ...state.notifications],
          lastNotificationId: notification.id,
        }));
      },

      addNotifications: (newNotifications) => {
        set((state) => {
          // Merge without duplicates
          const existingIds = new Set(state.notifications.map((n) => n.id));
          const uniqueNew = newNotifications.filter((n) => !existingIds.has(n.id));
          const merged = [...state.notifications, ...uniqueNew].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          return {
            notifications: merged,
            lastNotificationId: merged.length > 0 ? merged[0].id : state.lastNotificationId,
          };
        });
      },

      updateNotification: (notification) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === notification.id ? notification : n
          ),
        }));
      },

      // Requirement 4: Optimistic update
      markAsRead: (notificationId) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === notificationId
              ? { ...n, isRead: true, readAt: new Date().toISOString() }
              : n
          ),
          // Optimistic decrement (server will send authoritative count)
          unreadCount: Math.max(0, state.unreadCount - 1),
        }));
      },

      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({
            ...n,
            isRead: true,
            readAt: n.readAt || new Date().toISOString(),
          })),
          unreadCount: 0,
        }));
      },

      // Requirement 6: Server is authoritative for unread count
      setUnreadCount: (count) => {
        set({ unreadCount: Math.max(0, count) });
      },

      setConnectionStatus: (status) => {
        set({ connectionStatus: status });
      },

      setLastNotificationId: (id) => {
        set({ lastNotificationId: id });
      },

      setIsLoading: (loading) => {
        set({ isLoading: loading });
      },

      setPagination: (hasMore, nextCursor) => {
        set({ hasMore, nextCursor });
      },

      reset: () => {
        set(initialState);
      },
    }),
    {
      name: 'notification-storage',
      storage: createJSONStorage(() => localStorage),
      // Only persist these fields
      partialize: (state) => ({
        lastNotificationId: state.lastNotificationId,
      }),
    }
  )
);
