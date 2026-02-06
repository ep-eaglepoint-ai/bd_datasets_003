<script lang="ts">
	import { onMount } from 'svelte';
	import { getPosterUrl } from '$lib/api/tmdb';
	import type { TMDBMovie } from '$lib/api/tmdb';

	let query = $state('');
	let results: TMDBMovie[] = $state([]);
	let loading = $state(false);
	let error = $state('');

	async function handleSearch() {
		if (!query.trim()) return;

		loading = true;
		error = '';

		try {
			const response = await fetch(`/api/movies/search?q=${encodeURIComponent(query)}`);
			if (!response.ok) throw new Error('Search failed');

			const data = await response.json();
			results = data.results;
		} catch (err) {
			error = 'Failed to search movies';
		} finally {
			loading = false;
		}
	}

	function handleKeyPress(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleSearch();
		}
	}
</script>

<svelte:head>
	<title>Search Movies - CineTrack</title>
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<div class="animate-fade-in mb-8">
		<h1 class="font-display text-gradient mb-2 text-4xl font-bold">Discover Movies</h1>
		<p class="text-gray-400">Search for movies to add to your watchlist</p>
	</div>

	<!-- Search Bar -->
	<div class="animate-fade-in mb-8" style="animation-delay: 0.1s;">
		<div class="flex gap-3">
			<input
				type="text"
				bind:value={query}
				onkeypress={handleKeyPress}
				placeholder="Search for movies..."
				class="input-field flex-1"
			/>
			<button onclick={handleSearch} disabled={loading} class="btn-primary disabled:opacity-50">
				{loading ? 'Searching...' : 'Search'}
			</button>
		</div>
	</div>

	{#if error}
		<div class="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-400">
			{error}
		</div>
	{/if}

	{#if results.length > 0}
		<div class="animate-fade-in" style="animation-delay: 0.2s;">
			<p class="mb-4 text-gray-400">Found {results.length} results</p>

			<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{#each results as movie}
					<a href="/movie/{movie.id}" class="card group cursor-pointer">
						<div class="aspect-[2/3] overflow-hidden">
							<img
								src={getPosterUrl(movie.poster_path)}
								alt={movie.title}
								class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
							/>
						</div>
						<div class="p-3">
							<h3 class="mb-1 line-clamp-2 text-sm font-semibold">{movie.title}</h3>
							<div class="flex items-center justify-between text-xs">
								<span class="text-gray-400">{movie.release_date?.substring(0, 4) || 'N/A'}</span>
								<span class="text-cinema-accent">⭐ {movie.vote_average.toFixed(1)}</span>
							</div>
						</div>
					</a>
				{/each}
			</div>
		</div>
	{:else if !loading && query}
		<div class="py-16 text-center text-gray-400">
			No results found for "{query}"
		</div>
	{/if}

	{#if !query && !loading}
		<div class="animate-fade-in py-16 text-center">
			<div class="mb-4 text-6xl">🔍</div>
			<h3 class="font-display mb-2 text-2xl font-bold">Start your search</h3>
			<p class="text-gray-400">Enter a movie title to begin</p>
		</div>
	{/if}
</div>
