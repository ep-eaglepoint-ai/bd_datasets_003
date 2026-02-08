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

const USER_DOCUMENTS_KEY = (userId: string) => `user_docs:${userId}`;

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
        // Track which documents this user is in
        await redis.sadd(USER_DOCUMENTS_KEY(userId), documentId);
    },

    async getPresence(documentId: string): Promise<Presence[]> {
        const rawPresence = await redis.hgetall(PRESENCE_KEY(documentId));
        return Object.values(rawPresence).map((p) => JSON.parse(p as string));
    },

    async removePresence(documentId: string, userId: string) {
        await redis.hdel(PRESENCE_KEY(documentId), userId);
        await redis.srem(USER_DOCUMENTS_KEY(userId), documentId);
    },

    async clearUserPresence(userId: string) {
        // Get all documents this user is in (scalable approach)
        const documentIds = await redis.smembers(USER_DOCUMENTS_KEY(userId));
        for (const docId of documentIds) {
            await redis.hdel(PRESENCE_KEY(docId), userId);
        }
        await redis.del(USER_DOCUMENTS_KEY(userId));
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
