// Individual notification item component

import React from 'react';
import type { Notification } from '../types';

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onNavigate: (notification: Notification) => void;
}

const typeIcons: Record<string, string> = {
  task_assigned: '📋',
  task_updated: '✏️',
  task_completed: '✅',
  mention: '@',
  comment: '💬',
};

const formatTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

export const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onMarkAsRead,
  onNavigate,
}) => {
  const handleClick = () => {
    if (!notification.isRead) {
      onMarkAsRead(notification.id);
    }
    onNavigate(notification);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <>
      <style>
        {`
          .notification-item {
            display: flex;
            align-items: flex-start;
            padding: 12px 16px;
            border-bottom: 1px solid #e5e7eb;
            cursor: pointer;
            transition: background-color 0.15s;
          }
          .notification-item:hover {
            background-color: #f9fafb;
          }
          .notification-item:focus {
            outline: 2px solid #3b82f6;
            outline-offset: -2px;
            background-color: #f9fafb;
          }
          .notification-item.unread {
            background-color: #eff6ff;
          }
          .notification-item.unread:hover {
            background-color: #dbeafe;
          }
          .notification-icon {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background-color: #e5e7eb;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 12px;
            flex-shrink: 0;
            font-size: 14px;
          }
          .notification-content {
            flex: 1;
            min-width: 0;
          }
          .notification-title {
            font-size: 14px;
            font-weight: 500;
            color: #1f2937;
            margin-bottom: 2px;
          }
          .notification-message {
            font-size: 13px;
            color: #6b7280;
            margin-bottom: 4px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .notification-time {
            font-size: 12px;
            color: #9ca3af;
          }
          .notification-unread-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: #3b82f6;
            margin-left: 8px;
            flex-shrink: 0;
          }
        `}
      </style>
      <div
        className={`notification-item ${notification.isRead ? '' : 'unread'}`}
        role="listitem"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-label={`${notification.isRead ? '' : 'Unread: '}${notification.title}. ${notification.message}. ${formatTime(notification.createdAt)}`}
      >
        <div className="notification-icon" aria-hidden="true">
          {typeIcons[notification.type] || '📌'}
        </div>
        <div className="notification-content">
          <div className="notification-title">{notification.title}</div>
          <div className="notification-message">{notification.message}</div>
          <div className="notification-time">{formatTime(notification.createdAt)}</div>
        </div>
        {!notification.isRead && (
          <div
            className="notification-unread-dot"
            aria-hidden="true"
            title="Unread"
          />
        )}
      </div>
    </>
  );
};
