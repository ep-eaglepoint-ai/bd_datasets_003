import { createUser, createSession, setSessionCookie } from '$lib/server/auth';
import { fail, redirect } from '@sveltejs/kit';
import { users } from '$lib/server/db/schema';
import type { Actions } from './$types';
import { db } from '$lib/server/db';
import { eq } from 'drizzle-orm';

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const name = data.get('name')?.toString();
		const email = data.get('email')?.toString();
		const password = data.get('password')?.toString();

		if (!name || !email || !password) {
			return fail(400, { error: 'All fields are required' });
		}

		if (password.length < 8) {
			return fail(400, { error: 'Password must be at least 8 characters' });
		}

		// Check if user exists
		const [existingUser] = await db.select().from(users).where(eq(users.email, email));

		if (existingUser) {
			return fail(400, { error: 'Email already registered' });
		}

		try {
			const user = await createUser(email, password, name);
			const sessionId = await createSession(user.id);
			setSessionCookie(cookies, sessionId);

			// Do NOT put redirect here
		} catch (error) {
			// Log the actual error for debugging
			console.error(error);
			return fail(500, { error: 'Failed to create account' });
		}

		// Move redirect here.
		// It will only run if the catch block was NOT entered.
		redirect(303, '/dashboard');
	}
};
