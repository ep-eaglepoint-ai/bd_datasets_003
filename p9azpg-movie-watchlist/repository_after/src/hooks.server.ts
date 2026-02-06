import { validateSession } from '$lib/server/auth';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get('session');

	if (sessionId) {
		const user = await validateSession(sessionId);
		if (user) {
			event.locals.user = user;
		}
	}

	return resolve(event);
};
