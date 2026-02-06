import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '../api/$types';
import { searchMovies } from '$lib/api/tmdb';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const query = url.searchParams.get('q');
	const page = parseInt(url.searchParams.get('page') || '1');

	if (!query) {
		throw error(400, 'Query parameter is required');
	}

	try {
		const results = await searchMovies(query, page);
		return json(results);
	} catch (err) {
		throw error(500, 'Failed to search movies');
	}
};
