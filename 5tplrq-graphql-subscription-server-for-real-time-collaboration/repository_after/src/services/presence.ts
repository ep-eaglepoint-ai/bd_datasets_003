import { redis } from '../pubsub/redis.js';

export interface CursorPosition {
    line: number;
    column: number;
}

export interface Presence {
    userId: string;
    documentId: string;
    cursor: CursorPosition;
    lastSeen: number;
}

const PRESENCE_KEY = (documentId: string) => `presence:${documentId}`;
const USER_CONNECTIONS_KEY = (userId: string) => `connections:${userId}`;

export const PresenceService = {
    async updatePresence(documentId: string, userId: string, cursor: CursorPosition) {
        const presence: Presence = {
            userId,
            documentId,
            cursor,
            lastSeen: Date.now(),
        };
        await redis.hset(PRESENCE_KEY(documentId), userId, JSON.stringify(presence));
        await redis.expire(PRESENCE_KEY(documentId), 3600); // 1 hour TTL
    },

    async getPresence(documentId: string): Promise<Presence[]> {
        const rawPresence = await redis.hgetall(PRESENCE_KEY(documentId));
        return Object.values(rawPresence).map((p) => JSON.parse(p as string));
    },

    async removePresence(documentId: string, userId: string) {
        await redis.hdel(PRESENCE_KEY(documentId), userId);
    },

    async clearUserPresence(userId: string) {
        // This is tricky because a user might be in multiple documents.
        // In a real system, we might keep a set of documents the user is in.
        const keys = await redis.keys('presence:*');
        for (const key of keys) {
            await redis.hdel(key, userId);
        }
    },

    async trackConnection(userId: string): Promise<number> {
        const count = await redis.incr(USER_CONNECTIONS_KEY(userId));
        return count;
    },

    async untrackConnection(userId: string) {
        await redis.decr(USER_CONNECTIONS_KEY(userId));
    },

    async getConnectionCount(userId: string): Promise<number> {
        const count = await redis.get(USER_CONNECTIONS_KEY(userId));
        return count ? parseInt(count) : 0;
    }
};
