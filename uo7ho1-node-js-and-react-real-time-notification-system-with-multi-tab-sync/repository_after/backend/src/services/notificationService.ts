// Notification service with N+1 query prevention
// Requirement 14: Batch fetch related resources

import { PrismaClient, NotificationType, ResourceType } from '@prisma/client';
import {
  NotificationData,
  NotificationWithResource,
  PaginatedResponse,
  CreateNotificationInput,
  TaskResource,
  ProjectResource,
  CommentResource,
} from '../types/index.js';

const prisma = new PrismaClient();

export class NotificationService {
  // Requirement 14: Batch fetch related resources to avoid N+1
  private async attachResources(
    notifications: NotificationData[]
  ): Promise<NotificationWithResource[]> {
    if (notifications.length === 0) return [];

    // Group notifications by resource type
    const taskIds: string[] = [];
    const projectIds: string[] = [];
    const commentIds: string[] = [];

    for (const notification of notifications) {
      switch (notification.resourceType) {
        case 'task':
          taskIds.push(notification.resourceId);
          break;
        case 'project':
          projectIds.push(notification.resourceId);
          break;
        case 'comment':
          commentIds.push(notification.resourceId);
          break;
      }
    }

    // Batch fetch all resources in parallel
    const [tasks, projects, comments] = await Promise.all([
      taskIds.length > 0
        ? prisma.task.findMany({
            where: { id: { in: taskIds } },
            select: { id: true, title: true, status: true, projectId: true },
          })
        : [],
      projectIds.length > 0
        ? prisma.project.findMany({
            where: { id: { in: projectIds } },
            select: { id: true, name: true },
          })
        : [],
      commentIds.length > 0
        ? prisma.comment.findMany({
            where: { id: { in: commentIds } },
            select: { id: true, content: true, taskId: true },
          })
        : [],
    ]);

    // Create lookup maps
    const taskMap = new Map<string, TaskResource>(
      tasks.map((t) => [t.id, t])
    );
    const projectMap = new Map<string, ProjectResource>(
      projects.map((p) => [p.id, p])
    );
    const commentMap = new Map<string, CommentResource>(
      comments.map((c) => [c.id, c])
    );

    // Attach resources to notifications
    return notifications.map((notification) => {
      let resource: TaskResource | ProjectResource | CommentResource | null = null;

      switch (notification.resourceType) {
        case 'task':
          resource = taskMap.get(notification.resourceId) || null;
          break;
        case 'project':
          resource = projectMap.get(notification.resourceId) || null;
          break;
        case 'comment':
          resource = commentMap.get(notification.resourceId) || null;
          break;
      }

      return { ...notification, resource };
    });
  }

  // Requirement 8: Cursor-based pagination
  async getNotifications(
    userId: string,
    cursor: string | null,
    limit: number = 20
  ): Promise<PaginatedResponse<NotificationWithResource>> {
    const notifications = await prisma.notification.findMany({
      where: {
        userId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // Fetch one extra to determine hasMore
    });

    const hasMore = notifications.length > limit;
    const data = hasMore ? notifications.slice(0, limit) : notifications;

    const notificationsWithResources = await this.attachResources(data);

    return {
      data: notificationsWithResources,
      nextCursor: hasMore && data.length > 0
        ? data[data.length - 1].createdAt.toISOString()
        : null,
      hasMore,
    };
  }

  // Get notifications created after a specific notification (for reconnection)
  // Requirement 5: Offline notification recovery
  async getMissedNotifications(
    userId: string,
    lastNotificationId: string | null
  ): Promise<NotificationWithResource[]> {
    let whereClause: { userId: string; createdAt?: { gt: Date } } = { userId };

    if (lastNotificationId) {
      const lastNotification = await prisma.notification.findUnique({
        where: { id: lastNotificationId },
        select: { createdAt: true },
      });

      if (lastNotification) {
        whereClause = {
          ...whereClause,
          createdAt: { gt: lastNotification.createdAt },
        };
      }
    }

    const notifications = await prisma.notification.findMany({
      where: whereClause,
      orderBy: { createdAt: 'asc' },
    });

    return this.attachResources(notifications);
  }

  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  async markAsRead(
    notificationId: string,
    userId: string
  ): Promise<NotificationData | null> {
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) return null;

    return prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  // Requirement 6: Server is authoritative for unread count
  async markAllAsRead(userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    return result.count;
  }

  async createNotification(
    input: CreateNotificationInput
  ): Promise<NotificationWithResource> {
    const notification = await prisma.notification.create({
      data: input,
    });

    const [notificationWithResource] = await this.attachResources([notification]);
    return notificationWithResource;
  }

  async getNotificationById(
    notificationId: string
  ): Promise<NotificationWithResource | null> {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) return null;

    const [notificationWithResource] = await this.attachResources([notification]);
    return notificationWithResource;
  }
}

export const notificationService = new NotificationService();
