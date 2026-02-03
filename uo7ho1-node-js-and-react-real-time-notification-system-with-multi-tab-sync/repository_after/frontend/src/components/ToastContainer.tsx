// Toast container component
// Requirement 3: Single tab toast display using BroadcastChannel

import React, { useState, useEffect, useCallback } from 'react';
import { Toast } from './Toast';
import { useBroadcastChannel } from '../hooks/useBroadcastChannel';
import { useNotificationStore } from '../stores/notificationStore';
import type { Notification } from '../types';

interface ToastItem {
  notification: Notification;
  id: string;
}

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const { shouldShowToast, broadcastRead } = useBroadcastChannel();
  const notifications = useNotificationStore((state) => state.notifications);
  const markAsRead = useNotificationStore((state) => state.markAsRead);
  const prevNotificationsRef = React.useRef<Notification[]>([]);

  // Detect new notifications and show toast
  useEffect(() => {
    const prevIds = new Set(prevNotificationsRef.current.map((n) => n.id));

    // Find truly new notifications (not just from initial load)
    const newNotifications = notifications.filter(
      (n) => !prevIds.has(n.id) && !n.isRead
    );

    // Only show toasts if we had previous notifications (not initial load)
    if (prevNotificationsRef.current.length > 0) {
      newNotifications.forEach((notification) => {
        // Requirement 3: Only show toast if this is the first tab to receive it
        if (shouldShowToast(notification.id)) {
          setToasts((prev) => [
            ...prev,
            { notification, id: `toast-${notification.id}-${Date.now()}` },
          ]);
        }
      });
    }

    prevNotificationsRef.current = notifications;
  }, [notifications, shouldShowToast]);

  const handleDismiss = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  }, []);

  const handleNavigate = useCallback((notification: Notification) => {
    // Navigate to the resource
    const path = `/${notification.resourceType}s/${notification.resourceId}`;
    // In a real app, use react-router: navigate(path)
    console.log('Navigate to:', path);
    window.history.pushState({}, '', path);
  }, []);

  const handleMarkAsRead = useCallback(
    (notification: Notification) => {
      markAsRead(notification.id);
      // Requirement 4: Broadcast to other tabs
      broadcastRead(notification.id);
    },
    [markAsRead, broadcastRead]
  );

  return (
    <>
      <style>
        {`
          .toast-container {
            position: fixed;
            top: 16px;
            right: 16px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
          }
        `}
      </style>
      <div className="toast-container" aria-label="Notifications">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            notification={toast.notification}
            onDismiss={() => handleDismiss(toast.id)}
            onNavigate={() => handleNavigate(toast.notification)}
            onMarkAsRead={() => handleMarkAsRead(toast.notification)}
          />
        ))}
      </div>
    </>
  );
};
