import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from '../lists/$types';
import { db } from '$lib/server/db';
import { userMovies, movies } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	// Get all watched movies with details
	const watchedMovies = await db
		.select()
		.from(userMovies)
		.leftJoin(movies, eq(userMovies.movieId, movies.id))
		.where(and(eq(userMovies.userId, locals.user.id), eq(userMovies.status, 'watched')));

	// Calculate stats
	const totalWatched = watchedMovies.length;

	// Average rating
	const ratingsSum = watchedMovies.reduce((sum, m) => sum + (m.user_movies.rating || 0), 0);
	const ratedCount = watchedMovies.filter((m) => m.user_movies.rating).length;
	const averageRating = ratedCount > 0 ? ratingsSum / ratedCount : 0;

	// Genre analysis
	const genreCounts: Record<string, number> = {};
	const genreRatings: Record<string, number[]> = {};

	watchedMovies.forEach((m) => {
		if (m.movies?.genres) {
			try {
				const genres = JSON.parse(m.movies.genres);
				genres.forEach((g: any) => {
					genreCounts[g.name] = (genreCounts[g.name] || 0) + 1;
					if (m.user_movies.rating) {
						if (!genreRatings[g.name]) genreRatings[g.name] = [];
						genreRatings[g.name].push(m.user_movies.rating);
					}
				});
			} catch (e) {}
		}
	});

	// Calculate favorite genres (by count and rating)
	const favoriteGenres = Object.entries(genreCounts)
		.map(([genre, count]) => {
			const ratings = genreRatings[genre] || [];
			const avgRating =
				ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
			return { genre, count, avgRating };
		})
		.sort((a, b) => {
			// Sort by average rating first, then by count
			if (Math.abs(a.avgRating - b.avgRating) > 0.5) {
				return b.avgRating - a.avgRating;
			}
			return b.count - a.count;
		})
		.slice(0, 5);

	// Movies watched per month this year
	const currentYear = new Date().getFullYear();
	const monthlyStats = new Array(12).fill(0);

	watchedMovies.forEach((m) => {
		if (m.user_movies.watchedAt) {
			const date = new Date(m.user_movies.watchedAt);
			if (date.getFullYear() === currentYear) {
				monthlyStats[date.getMonth()]++;
			}
		}
	});

	const months = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec'
	];
	const monthlyData = months.map((month, index) => ({
		month,
		count: monthlyStats[index]
	}));

	// Top rated movies
	const topRated = watchedMovies
		.filter((m) => m.user_movies.rating && m.user_movies.rating >= 4)
		.sort((a, b) => (b.user_movies.rating || 0) - (a.user_movies.rating || 0))
		.slice(0, 10);

	return {
		totalWatched,
		averageRating: averageRating.toFixed(1),
		favoriteGenres,
		monthlyData,
		topRated,
		ratedCount
	};
};
