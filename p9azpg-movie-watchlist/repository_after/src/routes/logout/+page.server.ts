import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { deleteSession, deleteSessionCookie } from '$lib/server/auth';

export const actions: Actions = {
	default: async ({ cookies }) => {
		const sessionId = cookies.get('session');

		if (sessionId) {
			await deleteSession(sessionId);
			deleteSessionCookie(cookies);
		}

		throw redirect(303, '/login');
	}
};
