// API service for notification endpoints
// Requirement 8: Cursor-based pagination

import type { Notification, PaginatedResponse } from '../types';

const API_BASE = '/api';

export const notificationApi = {
  // Requirement 8: Cursor-based pagination with cursor and limit params
  async getNotifications(
    cursor?: string | null,
    limit: number = 20
  ): Promise<PaginatedResponse<Notification>> {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    params.set('limit', limit.toString());

    const response = await fetch(
      `${API_BASE}/notifications?${params.toString()}`,
      { credentials: 'include' }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch notifications');
    }

    return response.json();
  },

  async getUnreadCount(): Promise<{ count: number }> {
    const response = await fetch(`${API_BASE}/notifications/unread-count`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch unread count');
    }

    return response.json();
  },

  async markAsRead(
    notificationId: string
  ): Promise<{ notification: Notification; unreadCount: number }> {
    const response = await fetch(
      `${API_BASE}/notifications/${notificationId}/read`,
      {
        method: 'PATCH',
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error('Failed to mark notification as read');
    }

    return response.json();
  },

  async markAllAsRead(): Promise<{ updatedCount: number; unreadCount: number }> {
    const response = await fetch(`${API_BASE}/notifications/read-all`, {
      method: 'PATCH',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to mark all notifications as read');
    }

    return response.json();
  },
};
