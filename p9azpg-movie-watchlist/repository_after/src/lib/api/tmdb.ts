// TMDB API Key - In production, use environment variable
const TMDB_API_KEY = 'YOUR_TMDB_API_KEY'; // User needs to add their own key
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export interface TMDBMovie {
	id: number;
	title: string;
	overview: string;
	poster_path: string | null;
	backdrop_path: string | null;
	release_date: string;
	vote_average: number;
	vote_count: number;
	popularity: number;
	genre_ids?: number[];
	genres?: { id: number; name: string }[];
	runtime?: number;
	cast?: { id: number; name: string; character: string; profile_path: string | null }[];
}

export interface TMDBSearchResponse {
	page: number;
	results: TMDBMovie[];
	total_pages: number;
	total_results: number;
}

export async function searchMovies(query: string, page = 1): Promise<TMDBSearchResponse> {
	const response = await fetch(
		`${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}`
	);

	if (!response.ok) {
		throw new Error('Failed to search movies');
	}

	return response.json();
}

export async function getMovieDetails(movieId: number): Promise<TMDBMovie> {
	const response = await fetch(
		`${TMDB_BASE_URL}/movie/${movieId}?api_key=${TMDB_API_KEY}&append_to_response=credits`
	);

	if (!response.ok) {
		throw new Error('Failed to get movie details');
	}

	const data = await response.json();

	// Extract top 5 cast members
	const cast =
		data.credits?.cast?.slice(0, 5).map((member: any) => ({
			id: member.id,
			name: member.name,
			character: member.character,
			profile_path: member.profile_path
		})) || [];

	return { ...data, cast };
}

export async function getPopularMovies(page = 1): Promise<TMDBSearchResponse> {
	const response = await fetch(
		`${TMDB_BASE_URL}/movie/popular?api_key=${TMDB_API_KEY}&page=${page}`
	);

	if (!response.ok) {
		throw new Error('Failed to get popular movies');
	}

	return response.json();
}

export async function getTrendingMovies(
	timeWindow: 'day' | 'week' = 'week'
): Promise<TMDBSearchResponse> {
	const response = await fetch(
		`${TMDB_BASE_URL}/trending/movie/${timeWindow}?api_key=${TMDB_API_KEY}`
	);

	if (!response.ok) {
		throw new Error('Failed to get trending movies');
	}

	return response.json();
}

export async function getRecommendations(movieId: number): Promise<TMDBSearchResponse> {
	const response = await fetch(
		`${TMDB_BASE_URL}/movie/${movieId}/recommendations?api_key=${TMDB_API_KEY}`
	);

	if (!response.ok) {
		throw new Error('Failed to get recommendations');
	}

	return response.json();
}

export function getPosterUrl(
	path: string | null,
	size: 'w185' | 'w342' | 'w500' | 'original' = 'w342'
): string {
	if (!path) return '/placeholder-poster.jpg';
	return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function getBackdropUrl(
	path: string | null,
	size: 'w780' | 'w1280' | 'original' = 'w1280'
): string {
	if (!path) return '/placeholder-backdrop.jpg';
	return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function getProfileUrl(path: string | null, size: 'w185' | 'h632' = 'w185'): string {
	if (!path) return '/placeholder-profile.jpg';
	return `${TMDB_IMAGE_BASE}/${size}${path}`;
}
