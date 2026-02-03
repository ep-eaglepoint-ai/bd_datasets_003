// Notification REST API routes
// Requirement 8: Cursor-based pagination

import { Router, Response } from 'express';
import { notificationService } from '../services/notificationService.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { broadcastNotification, broadcastUnreadCount } from '../socket.js';
import { NotificationType, ResourceType } from '@prisma/client';

const router = Router();

// GET /api/notifications - list notifications with cursor-based pagination
// Requirement 8: cursor and limit params, returns data, nextCursor, hasMore
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const result = await notificationService.getNotifications(
      userId,
      cursor || null,
      limit
    );

    res.json(result);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// GET /api/notifications/unread-count
router.get('/unread-count', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const count = await notificationService.getUnreadCount(userId);
    res.json({ count });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// PATCH /api/notifications/:id/read - mark single notification as read
router.patch('/:id/read', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const notificationId = req.params.id;

    const notification = await notificationService.markAsRead(notificationId, userId);

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    // Requirement 6: Server broadcasts authoritative unread count
    const unreadCount = await notificationService.getUnreadCount(userId);
    broadcastUnreadCount(userId, unreadCount);

    res.json({ notification, unreadCount });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// PATCH /api/notifications/read-all - mark all notifications as read
router.patch('/read-all', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const updatedCount = await notificationService.markAllAsRead(userId);

    // Requirement 6: Server broadcasts authoritative unread count
    const unreadCount = await notificationService.getUnreadCount(userId);
    broadcastUnreadCount(userId, unreadCount);

    res.json({ updatedCount, unreadCount });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// POST /api/notifications - create a new notification (internal/admin use)
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, type, title, message, resourceType, resourceId } = req.body;

    if (!userId || !type || !title || !message || !resourceType || !resourceId) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Validate enum values
    if (!Object.values(NotificationType).includes(type)) {
      res.status(400).json({ error: 'Invalid notification type' });
      return;
    }

    if (!Object.values(ResourceType).includes(resourceType)) {
      res.status(400).json({ error: 'Invalid resource type' });
      return;
    }

    const notification = await notificationService.createNotification({
      userId,
      type,
      title,
      message,
      resourceType,
      resourceId,
    });

    // Broadcast to user via socket
    broadcastNotification(userId, notification);

    // Update unread count
    const unreadCount = await notificationService.getUnreadCount(userId);
    broadcastUnreadCount(userId, unreadCount);

    res.status(201).json(notification);
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

export default router;
