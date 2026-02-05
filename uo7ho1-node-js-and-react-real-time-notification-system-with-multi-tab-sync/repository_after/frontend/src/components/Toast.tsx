// Toast notification component
// Requirement 9: Respect prefers-reduced-motion
// Requirement 15: Auto-dismiss, pause on hover, keyboard accessible

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { Notification } from '../types';

interface ToastProps {
  notification: Notification;
  onDismiss: () => void;
  onNavigate: () => void;
  onMarkAsRead: () => void;
}

// Requirement 15: 5 second auto-dismiss
const AUTO_DISMISS_DELAY = 5000;

export const Toast: React.FC<ToastProps> = ({
  notification,
  onDismiss,
  onNavigate,
  onMarkAsRead,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef<number | null>(null);
  const remainingTimeRef = useRef(AUTO_DISMISS_DELAY);
  const startTimeRef = useRef(Date.now());

  // Requirement 15: Auto-dismiss timer management
  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = window.setTimeout(() => {
      onDismiss();
    }, remainingTimeRef.current);
  }, [onDismiss]);

  const pauseTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      // Calculate remaining time
      const elapsed = Date.now() - startTimeRef.current;
      remainingTimeRef.current = Math.max(0, remainingTimeRef.current - elapsed);
    }
  }, []);

  // Requirement 15: Start auto-dismiss timer
  useEffect(() => {
    startTimer();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [startTimer]);

  // Requirement 15: Pause on hover
  const handleMouseEnter = () => {
    setIsHovered(true);
    pauseTimer();
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    startTimer();
  };

  // Requirement 15: Click navigates and marks as read
  const handleClick = () => {
    onMarkAsRead();
    onNavigate();
    onDismiss();
  };

  // Requirement 15: Keyboard accessible close button
  const handleCloseClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    onDismiss();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleClick();
    }
  };

  const handleCloseKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.stopPropagation();
      onDismiss();
    }
  };

  return (
    <>
      <style>
        {`
          @keyframes slideIn {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
          @keyframes slideOut {
            from {
              transform: translateX(0);
              opacity: 1;
            }
            to {
              transform: translateX(100%);
              opacity: 0;
            }
          }
          .toast {
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            padding: 12px 16px;
            margin-bottom: 8px;
            cursor: pointer;
            position: relative;
            min-width: 300px;
            max-width: 400px;
            border-left: 4px solid #3b82f6;
          }
          .toast:not(.reduced-motion) {
            animation: slideIn 0.3s ease-out;
          }
          /* Requirement 9: No animation when prefers-reduced-motion is enabled */
          .toast.reduced-motion {
            animation: none;
            animation-duration: 0ms;
          }
          .toast:focus {
            outline: 2px solid #3b82f6;
            outline-offset: 2px;
          }
          .toast-title {
            font-weight: 600;
            font-size: 14px;
            color: #1f2937;
            margin-bottom: 4px;
            padding-right: 24px;
          }
          .toast-message {
            font-size: 13px;
            color: #6b7280;
            line-height: 1.4;
          }
          .toast-close {
            position: absolute;
            top: 8px;
            right: 8px;
            background: none;
            border: none;
            padding: 4px;
            cursor: pointer;
            color: #9ca3af;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          /* Requirement 15: Visible focus indicator */
          .toast-close:focus {
            outline: 2px solid #3b82f6;
            outline-offset: 1px;
          }
          .toast-close:hover {
            color: #6b7280;
            background: #f3f4f6;
          }
        `}
      </style>
      <div
        className={`toast ${prefersReducedMotion ? 'reduced-motion' : ''}`}
        role="alert"
        aria-live="polite"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="toast-title">{notification.title}</div>
        <div className="toast-message">{notification.message}</div>

        {/* Requirement 15: Keyboard accessible close button */}
        <button
          className="toast-close"
          onClick={handleCloseClick}
          onKeyDown={handleCloseKeyDown}
          aria-label="Dismiss notification"
          type="button"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 4L12 12M12 4L4 12" />
          </svg>
        </button>
      </div>
    </>
  );
};
