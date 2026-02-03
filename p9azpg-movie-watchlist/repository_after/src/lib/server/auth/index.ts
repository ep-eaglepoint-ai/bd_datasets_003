import bcrypt from 'bcrypt';
import { db } from '../db';
import { users, sessions } from '../db/schema';
import { eq } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';

const SALT_ROUNDS = 10;
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function hashPassword(password: string): Promise<string> {
	return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	return bcrypt.compare(password, hash);
}

export async function createUser(email: string, password: string, name: string) {
	const hashedPassword = await hashPassword(password);

	const [user] = await db
		.insert(users)
		.values({
			email,
			password: hashedPassword,
			name
		})
		.returning();

	return user;
}

export async function createSession(userId: number) {
	const sessionId = crypto.randomUUID();
	const expiresAt = new Date(Date.now() + SESSION_DURATION);

	await db.insert(sessions).values({
		id: sessionId,
		userId,
		expiresAt
	});

	return sessionId;
}

export async function validateSession(sessionId: string) {
	const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));

	if (!session) return null;

	if (new Date() > session.expiresAt) {
		await db.delete(sessions).where(eq(sessions.id, sessionId));
		return null;
	}

	const [user] = await db.select().from(users).where(eq(users.id, session.userId));

	return user;
}

export async function deleteSession(sessionId: string) {
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export function setSessionCookie(cookies: Cookies, sessionId: string) {
	cookies.set('session', sessionId, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		maxAge: SESSION_DURATION / 1000
	});
}

export function deleteSessionCookie(cookies: Cookies) {
	cookies.delete('session', { path: '/' });
}
