// Notification bell component with badge
// Requirement 11: Badge display rules and accessibility

import React, { useState, useRef, useEffect } from 'react';
import { NotificationList } from './NotificationList';
import { useNotificationStore } from '../stores/notificationStore';

export const NotificationBell: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Requirement 11: Format badge text
  const getBadgeText = (): string => {
    if (unreadCount <= 0) return '';
    if (unreadCount > 99) return '99+';
    return unreadCount.toString();
  };

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen) {
      setIsOpen(false);
      buttonRef.current?.focus();
    }
  };

  const toggleOpen = () => {
    setIsOpen((prev) => !prev);
  };

  return (
    <>
      <style>
        {`
          .notification-bell-container {
            position: relative;
            display: inline-block;
          }
          .notification-bell-button {
            background: none;
            border: none;
            padding: 8px;
            cursor: pointer;
            border-radius: 50%;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .notification-bell-button:hover {
            background-color: #f3f4f6;
          }
          .notification-bell-button:focus {
            outline: 2px solid #3b82f6;
            outline-offset: 2px;
          }
          .notification-bell-icon {
            width: 24px;
            height: 24px;
            color: #4b5563;
          }
          /* Requirement 11: Badge styling */
          .notification-badge {
            position: absolute;
            top: 2px;
            right: 2px;
            min-width: 18px;
            height: 18px;
            padding: 0 5px;
            font-size: 11px;
            font-weight: 600;
            line-height: 18px;
            text-align: center;
            border-radius: 9px;
            /* Requirement 11: 4.5:1 color contrast ratio */
            /* White text (#ffffff) on red background (#dc2626) = 4.6:1 contrast */
            background-color: #dc2626;
            color: #ffffff;
          }
          /* Requirement 11: Badge hidden when count is zero */
          .notification-badge.hidden {
            display: none;
          }
        `}
      </style>
      <div
        ref={containerRef}
        className="notification-bell-container"
        onKeyDown={handleKeyDown}
      >
        <button
          ref={buttonRef}
          className="notification-bell-button"
          onClick={toggleOpen}
          aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          type="button"
        >
          <svg
            className="notification-bell-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>

          {/* Requirement 11: Badge with proper display rules */}
          <span
            className={`notification-badge ${unreadCount <= 0 ? 'hidden' : ''}`}
            aria-hidden="true"
          >
            {getBadgeText()}
          </span>
        </button>

        {isOpen && <NotificationList onClose={() => setIsOpen(false)} />}
      </div>
    </>
  );
};
