// Backend type definitions

import { NotificationType, ResourceType } from '@prisma/client';

export interface NotificationData {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  resourceType: ResourceType;
  resourceId: string;
  isRead: boolean;
  createdAt: Date;
  readAt: Date | null;
}

export interface NotificationWithResource extends NotificationData {
  resource?: TaskResource | ProjectResource | CommentResource | null;
}

export interface TaskResource {
  id: string;
  title: string;
  status: string;
  projectId: string;
}

export interface ProjectResource {
  id: string;
  name: string;
}

export interface CommentResource {
  id: string;
  content: string;
  taskId: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  resourceType: ResourceType;
  resourceId: string;
}

// Socket event types
export interface ServerToClientEvents {
  'notification:new': (notification: NotificationWithResource) => void;
  'notification:updated': (notification: NotificationData) => void;
  'unread-count:changed': (count: number) => void;
  'missed-notifications': (notifications: NotificationWithResource[]) => void;
}

export interface ClientToServerEvents {
  'notification:mark-read': (notificationId: string) => void;
  'notification:mark-all-read': () => void;
  'get-missed': (lastNotificationId: string | null) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId: string;
  sessionId: string;
}

// Extend Express Session
declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}
