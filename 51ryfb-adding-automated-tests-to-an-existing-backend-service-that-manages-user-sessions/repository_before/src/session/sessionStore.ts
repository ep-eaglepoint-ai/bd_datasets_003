type Session = {
    id: string;
    userId: string;
    expiresAt: number;
};

export class SessionStore {
    private sessions: Map<string, Session> = new Map();

    createSession(id: string, userId: string, ttlMs: number): Session {
        const session: Session = {
            id,
            userId,
            expiresAt: Date.now() + ttlMs,
        };

        this.sessions.set(id, session);
        return session;
    }

    getSession(id: string): Session | null {
        const session = this.sessions.get(id);
        if (!session) {
            return null;
        }

        if (Date.now() > session.expiresAt) {
            this.sessions.delete(id);
            return null;
        }

        return session;
    }
}
