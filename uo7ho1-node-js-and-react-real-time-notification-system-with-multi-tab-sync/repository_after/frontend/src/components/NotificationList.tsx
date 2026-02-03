// Notification list component with infinite scroll
// Requirement 12: Intersection Observer for infinite scroll
// Requirement 10: Cleanup on unmount

import React, { useRef, useEffect, useCallback } from 'react';
import { NotificationItem } from './NotificationItem';
import { useNotifications } from '../hooks/useNotifications';
import { useBroadcastChannel } from '../hooks/useBroadcastChannel';
import { useNotificationStore } from '../stores/notificationStore';
import type { Notification } from '../types';

interface NotificationListProps {
  onClose: () => void;
}

export const NotificationList: React.FC<NotificationListProps> = ({ onClose }) => {
  const { notifications, isLoading, isFetchingNextPage, hasMore, loadMore, markAllAsRead } =
    useNotifications();
  const { broadcastRead, broadcastAllRead } = useBroadcastChannel();
  const storeMarkAsRead = useNotificationStore((state) => state.markAsRead);
  const storeMarkAllAsRead = useNotificationStore((state) => state.markAllAsRead);

  // Requirement 12: Sentinel element ref for Intersection Observer
  const sentinelRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isFetchingRef = useRef(false);

  // Track fetching state to prevent duplicate fetches
  useEffect(() => {
    isFetchingRef.current = isFetchingNextPage;
  }, [isFetchingNextPage]);

  // Requirement 12: Intersection Observer setup
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    // Requirement 12: Observer watches sentinel element
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        // Requirement 12: Load more when sentinel is visible
        // Don't fetch if hasMore is false or if a fetch is already in progress
        if (entry.isIntersecting && hasMore && !isFetchingRef.current) {
          loadMore();
        }
      },
      {
        root: null,
        rootMargin: '100px', // Start loading before reaching the bottom
        threshold: 0,
      }
    );

    observerRef.current.observe(sentinel);

    // Requirement 10: Cleanup observer on unmount
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [hasMore, loadMore]);

  const handleMarkAsRead = useCallback(
    (notificationId: string) => {
      // Requirement 4: Optimistic update
      storeMarkAsRead(notificationId);
      // Requirement 4: Broadcast to other tabs
      broadcastRead(notificationId);
    },
    [storeMarkAsRead, broadcastRead]
  );

  const handleMarkAllAsRead = useCallback(() => {
    storeMarkAllAsRead();
    markAllAsRead();
    broadcastAllRead();
  }, [storeMarkAllAsRead, markAllAsRead, broadcastAllRead]);

  const handleNavigate = useCallback(
    (notification: Notification) => {
      const path = `/${notification.resourceType}s/${notification.resourceId}`;
      window.history.pushState({}, '', path);
      onClose();
    },
    [onClose]
  );

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <>
      <style>
        {`
          .notification-list {
            position: absolute;
            top: 100%;
            right: 0;
            width: 380px;
            max-height: 480px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            overflow: hidden;
            z-index: 1000;
          }
          .notification-list-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            border-bottom: 1px solid #e5e7eb;
          }
          .notification-list-title {
            font-size: 16px;
            font-weight: 600;
            color: #1f2937;
          }
          .notification-list-action {
            background: none;
            border: none;
            color: #3b82f6;
            font-size: 13px;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
          }
          .notification-list-action:hover {
            background-color: #eff6ff;
          }
          .notification-list-action:focus {
            outline: 2px solid #3b82f6;
            outline-offset: 1px;
          }
          .notification-list-content {
            overflow-y: auto;
            max-height: 400px;
          }
          .notification-list-empty {
            padding: 40px 20px;
            text-align: center;
            color: #9ca3af;
          }
          .notification-list-loading {
            padding: 16px;
            text-align: center;
            color: #6b7280;
          }
          .notification-list-sentinel {
            height: 1px;
          }
        `}
      </style>
      <div
        className="notification-list"
        role="dialog"
        aria-label="Notifications"
        onKeyDown={handleKeyDown}
      >
        <div className="notification-list-header">
          <span className="notification-list-title">Notifications</span>
          <button
            className="notification-list-action"
            onClick={handleMarkAllAsRead}
            type="button"
          >
            Mark all as read
          </button>
        </div>

        <div className="notification-list-content" role="list">
          {isLoading && notifications.length === 0 ? (
            <div className="notification-list-loading">Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div className="notification-list-empty">No notifications yet</div>
          ) : (
            <>
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={handleMarkAsRead}
                  onNavigate={handleNavigate}
                />
              ))}

              {/* Requirement 12: Loading state while fetching next page */}
              {isFetchingNextPage && (
                <div className="notification-list-loading">Loading more...</div>
              )}

              {/* Requirement 12: Sentinel element at the end of the list */}
              <div ref={sentinelRef} className="notification-list-sentinel" />
            </>
          )}
        </div>
      </div>
    </>
  );
};
