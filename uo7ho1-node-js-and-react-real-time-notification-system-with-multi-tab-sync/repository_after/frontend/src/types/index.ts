// Frontend type definitions

export type NotificationType =
  | 'task_assigned'
  | 'task_updated'
  | 'task_completed'
  | 'mention'
  | 'comment';

export type ResourceType = 'task' | 'project' | 'comment';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  resourceType: ResourceType;
  resourceId: string;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
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

// Connection states for Requirement 7
export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

// BroadcastChannel message types for Requirement 3 & 4
export interface BroadcastMessage {
  type: 'toast-shown' | 'notification-read' | 'all-read' | 'unread-count-update';
  payload: {
    notificationId?: string;
    unreadCount?: number;
    tabId?: string;
  };
}

// Socket event types
export interface ServerToClientEvents {
  'notification:new': (notification: Notification) => void;
  'notification:updated': (notification: Notification) => void;
  'unread-count:changed': (count: number) => void;
  'missed-notifications': (notifications: Notification[]) => void;
}

export interface ClientToServerEvents {
  'notification:mark-read': (notificationId: string) => void;
  'notification:mark-all-read': () => void;
  'get-missed': (lastNotificationId: string | null) => void;
}
