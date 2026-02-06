import { Request, Response } from "express";
import { SessionStore } from "./sessionStore";

const store = new SessionStore();

export function createSession(req: Request, res: Response) {
    const { sessionId, userId, ttlMs } = req.body;

    if (!sessionId || !userId || typeof ttlMs !== "number") {
        return res.status(400).json({ error: "invalid input" });
    }

    const session = store.createSession(sessionId, userId, ttlMs);
    return res.status(201).json(session);
}

export function getSession(req: Request, res: Response) {
    const sessionId = req.params.id;
    const session = store.getSession(sessionId);

    if (!session) {
        return res.status(404).json({ error: "session not found" });
    }

    return res.status(200).json(session);
}
