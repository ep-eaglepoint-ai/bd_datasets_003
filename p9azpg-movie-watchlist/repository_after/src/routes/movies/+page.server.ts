import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getMovieDetails } from '$lib/api/tmdb';
import { db } from '$lib/server/db';
import { movies, userMovies } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({
	params,
	locals
}: {
	params: any;
	locals: App.Locals;
}) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	const movieId = parseInt(params.id);

	try {
		// Get movie details from TMDB
		const movieDetails = await getMovieDetails(movieId);

		// Check if user has this movie
		const [userMovie] = await db
			.select()
			.from(userMovies)
			.where(and(eq(userMovies.userId, locals.user.id), eq(userMovies.movieId, movieId)));

		return {
			movie: movieDetails,
			userMovie: userMovie || null
		};
	} catch (err) {
		throw error(404, 'Movie not found');
	}
};

export const actions: Actions = {
	addToList: async ({
		request,
		locals,
		params
	}: {
		request: Request;
		params: any;
		locals: App.Locals;
	}) => {
		if (!locals.user) {
			throw error(401, 'Unauthorized');
		}

		const data = await request.formData();
		const status = data.get('status')?.toString();
		const movieData = data.get('movieData')?.toString();

		if (!status || !movieData) {
			throw error(400, 'Invalid request');
		}

		const movie = JSON.parse(movieData);
		const movieId = parseInt(params.id);

		// Insert or update movie in database
		await db
			.insert(movies)
			.values({
				id: movieId,
				title: movie.title,
				overview: movie.overview,
				posterPath: movie.poster_path,
				releaseDate: movie.release_date,
				voteAverage: Math.round(movie.vote_average * 10),
				runtime: movie.runtime,
				genres: JSON.stringify(movie.genres || []),
				cast: JSON.stringify(movie.cast || [])
			})
			.onConflictDoUpdate({
				target: movies.id,
				set: {
					title: movie.title,
					overview: movie.overview,
					posterPath: movie.poster_path,
					releaseDate: movie.release_date,
					voteAverage: Math.round(movie.vote_average * 10),
					runtime: movie.runtime,
					genres: JSON.stringify(movie.genres || []),
					cast: JSON.stringify(movie.cast || [])
				}
			});

		// Check if user already has this movie
		const [existingUserMovie] = await db
			.select()
			.from(userMovies)
			.where(and(eq(userMovies.userId, locals.user.id), eq(userMovies.movieId, movieId)));

		if (existingUserMovie) {
			// Update status
			await db
				.update(userMovies)
				.set({ status, updatedAt: new Date() })
				.where(eq(userMovies.id, existingUserMovie.id));
		} else {
			// Insert new user movie
			await db.insert(userMovies).values({
				userId: locals.user.id,
				movieId,
				status
			});
		}

		return { success: true };
	},

	rate: async ({
		request,
		locals,
		params
	}: {
		request: Request;
		params: any;
		locals: App.Locals;
	}) => {
		if (!locals.user) {
			throw error(401, 'Unauthorized');
		}

		const data = await request.formData();
		const rating = parseInt(data.get('rating')?.toString() || '0');
		const review = data.get('review')?.toString() || '';
		const movieId = parseInt(params.id);

		if (rating < 1 || rating > 5) {
			throw error(400, 'Invalid rating');
		}

		// Update user movie with rating and review
		await db
			.update(userMovies)
			.set({
				status: 'watched',
				rating,
				review,
				watchedAt: new Date(),
				updatedAt: new Date()
			})
			.where(and(eq(userMovies.userId, locals.user.id), eq(userMovies.movieId, movieId)));

		return { success: true };
	}
};
