// Socket.io server configuration
// Requirement 1: Authenticate via session cookies from handshake headers

import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import cookie from 'cookie';
import { PrismaClient } from '@prisma/client';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  NotificationWithResource,
} from './types/index.js';
import { notificationService } from './services/notificationService.js';

const prisma = new PrismaClient();

type NotificationSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type NotificationServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

// Map of userId to set of socket IDs
const userSockets = new Map<string, Set<string>>();

let io: NotificationServer;

export const initializeSocket = (httpServer: HttpServer): NotificationServer => {
  io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      credentials: true,
    },
    // Requirement 1: Authentication tokens must NOT be in WebSocket URL
    // We only accept credentials via cookies
    allowRequest: (req, callback) => {
      // Reject if token is in query string
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      if (url.searchParams.has('token') || url.searchParams.has('auth')) {
        callback('Authentication tokens in URL are not allowed', false);
        return;
      }
      callback(null, true);
    },
  });

  // Requirement 1: Socket authentication middleware
  io.use(async (socket, next) => {
    try {
      // Parse cookies from handshake headers
      const cookieHeader = socket.handshake.headers.cookie;

      if (!cookieHeader) {
        return next(new Error('Authentication error: No session cookie'));
      }

      const cookies = cookie.parse(cookieHeader);
      const sessionId = cookies['session_id'];

      if (!sessionId) {
        return next(new Error('Authentication error: Missing session cookie'));
      }

      // Validate session against session store
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { user: { select: { id: true } } },
      });

      if (!session) {
        return next(new Error('Authentication error: Invalid session'));
      }

      if (session.expiresAt < new Date()) {
        return next(new Error('Authentication error: Session expired'));
      }

      // Attach user data to socket
      socket.data.userId = session.userId;
      socket.data.sessionId = sessionId;

      next();
    } catch (error) {
      next(new Error('Authentication error: Server error'));
    }
  });

  io.on('connection', (socket: NotificationSocket) => {
    const userId = socket.data.userId;

    if (!userId) {
      socket.disconnect();
      return;
    }

    // Track connected sockets per user
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(socket.id);

    // Join user-specific room for targeted broadcasts
    socket.join(`user:${userId}`);

    console.log(`User ${userId} connected (socket: ${socket.id})`);

    // Requirement 5: Handle reconnection - get missed notifications
    socket.on('get-missed', async (lastNotificationId: string | null) => {
      try {
        const missedNotifications = await notificationService.getMissedNotifications(
          userId,
          lastNotificationId
        );

        if (missedNotifications.length > 0) {
          socket.emit('missed-notifications', missedNotifications);
        }
      } catch (error) {
        console.error('Error fetching missed notifications:', error);
      }
    });

    // Handle mark single notification as read
    socket.on('notification:mark-read', async (notificationId: string) => {
      try {
        const notification = await notificationService.markAsRead(notificationId, userId);

        if (notification) {
          // Requirement 6: Server broadcasts authoritative unread count
          const unreadCount = await notificationService.getUnreadCount(userId);

          // Broadcast to all user's connected clients
          io.to(`user:${userId}`).emit('notification:updated', notification);
          io.to(`user:${userId}`).emit('unread-count:changed', unreadCount);
        }
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    });

    // Handle mark all notifications as read
    socket.on('notification:mark-all-read', async () => {
      try {
        await notificationService.markAllAsRead(userId);

        // Requirement 6: Server broadcasts authoritative unread count (always 0 after mark-all)
        const unreadCount = await notificationService.getUnreadCount(userId);

        io.to(`user:${userId}`).emit('unread-count:changed', unreadCount);
      } catch (error) {
        console.error('Error marking all notifications as read:', error);
      }
    });

    socket.on('disconnect', () => {
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
        }
      }
      console.log(`User ${userId} disconnected (socket: ${socket.id})`);
    });
  });

  return io;
};

// Broadcast new notification to specific user
export const broadcastNotification = (
  userId: string,
  notification: NotificationWithResource
): void => {
  if (io) {
    io.to(`user:${userId}`).emit('notification:new', notification);
  }
};

// Broadcast unread count change to specific user
export const broadcastUnreadCount = (userId: string, count: number): void => {
  if (io) {
    io.to(`user:${userId}`).emit('unread-count:changed', count);
  }
};

// Get count of connected sockets for a user
export const getUserConnectionCount = (userId: string): number => {
  return userSockets.get(userId)?.size || 0;
};

export const getIO = (): NotificationServer => io;
