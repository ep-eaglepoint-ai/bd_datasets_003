import { redirect, fail, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { userMovies, movies, customLists, listMovies } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	// Get filter from query params
	const filter = url.searchParams.get('filter');

	// Get user's custom lists
	const userLists = await db
		.select()
		.from(customLists)
		.where(eq(customLists.userId, locals.user.id))
		.orderBy(desc(customLists.createdAt));

	// Get list items for each custom list
	const listsWithMovies = await Promise.all(
		userLists.map(async (list) => {
			const items = await db
				.select()
				.from(listMovies)
				.leftJoin(movies, eq(listMovies.movieId, movies.id))
				.where(eq(listMovies.listId, list.id))
				.orderBy(listMovies.position);

			return {
				...list,
				movies: items
			};
		})
	);

	// Get default lists if filter is specified
	let filteredMovies: any[] = [];
	if (filter) {
		const allUserMovies = await db
			.select()
			.from(userMovies)
			.leftJoin(movies, eq(userMovies.movieId, movies.id))
			.where(and(eq(userMovies.userId, locals.user.id), eq(userMovies.status, filter)))
			.orderBy(desc(userMovies.createdAt));

		filteredMovies = allUserMovies;
	}

	return {
		customLists: listsWithMovies,
		filter,
		filteredMovies
	};
};

export const actions: Actions = {
	createList: async ({ request, locals }) => {
		if (!locals.user) {
			throw error(401, 'Unauthorized');
		}

		const data = await request.formData();
		const name = data.get('name')?.toString();
		const description = data.get('description')?.toString();

		if (!name) {
			return fail(400, { error: 'List name is required' });
		}

		await db.insert(customLists).values({
			userId: locals.user.id,
			name,
			description: description || null
		});

		return { success: true };
	},

	deleteList: async ({ request, locals }) => {
		if (!locals.user) {
			throw error(401, 'Unauthorized');
		}

		const data = await request.formData();
		const listId = parseInt(data.get('listId')?.toString() || '0');

		// Verify ownership
		const [list] = await db
			.select()
			.from(customLists)
			.where(and(eq(customLists.id, listId), eq(customLists.userId, locals.user.id)));

		if (!list) {
			throw error(404, 'List not found');
		}

		await db.delete(customLists).where(eq(customLists.id, listId));

		return { success: true };
	},

	addToCustomList: async ({ request, locals }) => {
		if (!locals.user) {
			throw error(401, 'Unauthorized');
		}

		const data = await request.formData();
		const listId = parseInt(data.get('listId')?.toString() || '0');
		const movieId = parseInt(data.get('movieId')?.toString() || '0');

		// Verify ownership
		const [list] = await db
			.select()
			.from(customLists)
			.where(and(eq(customLists.id, listId), eq(customLists.userId, locals.user.id)));

		if (!list) {
			throw error(404, 'List not found');
		}

		// Get current max position
		const existingItems = await db.select().from(listMovies).where(eq(listMovies.listId, listId));

		const maxPosition = Math.max(...existingItems.map((i) => i.position), -1);

		// Check if already in list
		const existing = existingItems.find((i) => i.movieId === movieId);
		if (existing) {
			return { success: true };
		}

		await db.insert(listMovies).values({
			listId,
			movieId,
			position: maxPosition + 1
		});

		return { success: true };
	},

	removeFromList: async ({ request, locals }) => {
		if (!locals.user) {
			throw error(401, 'Unauthorized');
		}

		const data = await request.formData();
		const listId = parseInt(data.get('listId')?.toString() || '0');
		const movieId = parseInt(data.get('movieId')?.toString() || '0');

		// Verify ownership
		const [list] = await db
			.select()
			.from(customLists)
			.where(and(eq(customLists.id, listId), eq(customLists.userId, locals.user.id)));

		if (!list) {
			throw error(404, 'List not found');
		}

		await db
			.delete(listMovies)
			.where(and(eq(listMovies.listId, listId), eq(listMovies.movieId, movieId)));

		return { success: true };
	}
};
