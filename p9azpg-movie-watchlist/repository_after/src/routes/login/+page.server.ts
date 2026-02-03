import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword, createSession, setSessionCookie } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		throw redirect(303, '/dashboard');
	}
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString();
		const password = data.get('password')?.toString();

		if (!email || !password) {
			return fail(400, { error: 'Email and password are required' });
		}

		const [user] = await db.select().from(users).where(eq(users.email, email));

		if (!user) {
			return fail(400, { error: 'Invalid email or password' });
		}

		const validPassword = await verifyPassword(password, user.password);

		if (!validPassword) {
			return fail(400, { error: 'Invalid email or password' });
		}

		const sessionId = await createSession(user.id);
		setSessionCookie(cookies, sessionId);

		throw redirect(303, '/dashboard');
	}
};
