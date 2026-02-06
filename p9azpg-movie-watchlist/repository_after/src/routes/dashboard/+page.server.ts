import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { userMovies, movies, customLists } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	// Get all user movies with movie details
	const userMoviesList = await db
		.select()
		.from(userMovies)
		.leftJoin(movies, eq(userMovies.movieId, movies.id))
		.where(eq(userMovies.userId, locals.user.id))
		.orderBy(desc(userMovies.createdAt));

	// Get custom lists count
	const userLists = await db
		.select()
		.from(customLists)
		.where(eq(customLists.userId, locals.user.id));

	// Group movies by status
	const wantToWatch = userMoviesList.filter((m) => m.user_movies.status === 'want_to_watch');
	const watching = userMoviesList.filter((m) => m.user_movies.status === 'watching');
	const watched = userMoviesList.filter((m) => m.user_movies.status === 'watched');

	return {
		wantToWatch,
		watching,
		watched,
		customListsCount: userLists.length
	};
};
