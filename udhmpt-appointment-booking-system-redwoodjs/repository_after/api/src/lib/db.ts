import { PrismaClient } from '@prisma/client'

// Real database connection
export const db = new PrismaClient()

// Helper to ensure SQLite WAL mode and busy_timeout
// Can be called during initialization or before critical operations
export const initDb = async () => {
    try {
        await db.$executeRawUnsafe('PRAGMA journal_mode=WAL;')
        await db.$executeRawUnsafe('PRAGMA busy_timeout=5000;')
    } catch (e) {
        // Ignore errors during build/migration if DB not ready
    }
}

export type PrismaLike = typeof db;

export default db;
