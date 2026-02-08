import { prisma } from '../db/prisma.js';
import { pubsub } from '../pubsub/redis.js';
import { PresenceService } from '../services/presence.js';
import { AuthService } from '../services/auth.js';

const DOCUMENT_CHANGED = 'DOCUMENT_CHANGED';
const PRESENCE_UPDATED = 'PRESENCE_UPDATED';
const CURSOR_MOVED = 'CURSOR_MOVED';

async function validateAccess(documentId: string, userId: string, incrementMetric = false) {
    const doc = await prisma.document.findUnique({
        where: { id: documentId },
        include: { access: true },
    });
    if (!doc) throw new Error('Document not found');
    const hasAccess = doc.owner_id === userId ||
        doc.access.some(a => a.user_id === userId);
    if (!hasAccess) {
        if (incrementMetric) {
            // Import dynamically to avoid circular dependency
            const { getPermissionDenialsCounter } = await import('../index.js');
            const counter = getPermissionDenialsCounter();
            if (counter) counter.inc();
        }
        throw new Error('Unauthorized');
    }
    return doc;
}

export const resolvers = {
    Query: {
        document: async (_: any, { id }: { id: string }, context: any) => {
            if (!context.user) throw new Error('Unauthenticated');
            return validateAccess(id, context.user.userId, true);
        },
        documents: async (_: any, __: any, context: any) => {
            if (!context.user) throw new Error('Unauthenticated');
            return prisma.document.findMany({
                where: {
                    OR: [
                        { owner_id: context.user.userId },
                        { access: { some: { user_id: context.user.userId } } }
                    ]
                }
            });
        },
        documentPresence: async (_: any, { documentId }: { documentId: string }, context: any) => {
            if (!context.user) throw new Error('Unauthenticated');
            await validateAccess(documentId, context.user.userId, true);
            return PresenceService.getPresence(documentId);
        },
        me: (_: any, __: any, context: any) => {
            if (!context.user) return null;
            return prisma.user.findUnique({ where: { id: context.user.userId } });
        },
    },

    Mutation: {
        createDocument: async (_: any, { title, content }: { title: string, content?: string }, context: any) => {
            if (!context.user) throw new Error('Unauthenticated');
            return prisma.document.create({
                data: {
                    title,
                    content,
                    owner_id: context.user.userId,
                },
            });
        },
        updateDocument: async (_: any, { id, title, content }: { id: string, title?: string, content?: string }, context: any) => {
            if (!context.user) throw new Error('Unauthenticated');
            const doc = await prisma.document.findUnique({ where: { id } });
            if (!doc) throw new Error('Document not found');

            const access = await prisma.documentAccess.findFirst({
                where: { document_id: id, user_id: context.user.userId, permission: 'edit' }
            });
            if (doc.owner_id !== context.user.userId && !access) throw new Error('Unauthorized to edit');

            const updated = await prisma.document.update({
                where: { id },
                data: { title, content },
            });

            pubsub.publish(`${DOCUMENT_CHANGED}.${id}`, {
                documentChanged: {
                    documentId: id,
                    title: updated.title,
                    content: updated.content,
                    updatedBy: context.user.userId,
                },
            });

            return updated;
        },
        deleteDocument: async (_: any, { id }: { id: string }, context: any) => {
            if (!context.user) throw new Error('Unauthenticated');
            const doc = await prisma.document.findUnique({ where: { id } });
            if (!doc || doc.owner_id !== context.user.userId) throw new Error('Unauthorized');

            await prisma.document.delete({ where: { id } });
            return true;
        },
        updateCursor: async (_: any, { documentId, position }: { documentId: string, position: { line: number, column: number } }, context: any) => {
            if (!context.user) throw new Error('Unauthenticated');
            await validateAccess(documentId, context.user.userId);

            await PresenceService.updatePresence(documentId, context.user.userId, position);

            // Publish cursor movement
            console.log(`Publishing CURSOR_MOVED.${documentId} for user ${context.user.userId}`);
            pubsub.publish(`${CURSOR_MOVED}.${documentId}`, {
                cursorMoved: {
                    documentId,
                    userId: context.user.userId,
                    position,
                },
            });

            // Publish presence update for cursor change
            const presence = await PresenceService.getPresence(documentId);
            pubsub.publish(`${PRESENCE_UPDATED}.${documentId}`, {
                presenceUpdated: {
                    documentId,
                    users: presence,
                    type: 'update',
                },
            });

            return true;
        },
        grantAccess: async (_: any, { documentId, userId, permission }: { documentId: string, userId: string, permission: string }, context: any) => {
            if (!context.user) throw new Error('Unauthenticated');
            const doc = await prisma.document.findUnique({ where: { id: documentId } });
            if (!doc || doc.owner_id !== context.user.userId) throw new Error('Unauthorized');

            await prisma.documentAccess.create({
                data: {
                    document_id: documentId,
                    user_id: userId,
                    permission: permission as any,
                }
            });
            return true;
        },
        login: async (_: any, { email, name }: { email: string, name: string }) => {
            let user = await prisma.user.findUnique({ where: { email } });
            if (!user) {
                user = await prisma.user.create({ data: { email, name, password: 'hashed_password' } });
            }
            return AuthService.sign({ userId: user.id, email: user.email });
        },
    },

    Subscription: {
        documentChanged: {
            subscribe: async function* (_: any, { documentId }: { documentId: string }, context: any) {
                if (!context.user) throw new Error('Unauthenticated');
                await validateAccess(documentId, context.user.userId, true);
                const iterator = pubsub.asyncIterator(`${DOCUMENT_CHANGED}.${documentId}`) as AsyncIterable<any>;
                for await (const payload of iterator) {
                    if (payload.documentChanged.updatedBy !== context.user.userId) {
                        yield payload;
                    }
                }
            }
        },
        presenceUpdated: {
            subscribe: async function* (_: any, { documentId }: { documentId: string }, context: any) {
                if (!context.user) throw new Error('Unauthenticated');
                await validateAccess(documentId, context.user.userId, true);
                const iterator = pubsub.asyncIterator(`${PRESENCE_UPDATED}.${documentId}`) as AsyncIterable<any>;
                for await (const payload of iterator) {
                    yield payload;
                }
            }
        },
        cursorMoved: {
            subscribe: async function* (_: any, { documentId }: { documentId: string }, context: any) {
                if (!context.user) throw new Error('Unauthenticated');
                await validateAccess(documentId, context.user.userId, true);
                console.log(`Subscribing to CURSOR_MOVED.${documentId}`);
                const iterator = pubsub.asyncIterator(`${CURSOR_MOVED}.${documentId}`) as AsyncIterable<any>;
                for await (const payload of iterator) {
                    if (payload.cursorMoved.userId !== context.user.userId) {
                        yield payload;
                    }
                }
            }
        },
    },
};
