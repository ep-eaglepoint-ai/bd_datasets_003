<script lang="ts">
	import type { PageData } from './$types';
	import { getPosterUrl } from '$lib/api/tmdb';

	let { data }: { data: PageData } = $props();

	// Calculate max for monthly chart scaling
	// svelte-ignore state_referenced_locally
	const maxMonthly = Math.max(...data.monthlyData.map((m) => m.count), 1);
</script>

<svelte:head>
	<title>Stats - CineTrack</title>
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<div class="animate-fade-in mb-8">
		<h1 class="font-display text-gradient mb-2 text-4xl font-bold">Your Stats</h1>
		<p class="text-gray-400">Insights into your viewing habits</p>
	</div>

	<!-- Key Metrics -->
	<div
		class="animate-fade-in mb-8 grid grid-cols-1 gap-6 md:grid-cols-3"
		style="animation-delay: 0.1s;"
	>
		<div class="card p-6">
			<div class="text-center">
				<div class="text-gradient mb-2 text-5xl font-bold">{data.totalWatched}</div>
				<p class="text-gray-400">Movies Watched</p>
			</div>
		</div>

		<div class="card p-6">
			<div class="text-center">
				<div class="text-gradient mb-2 text-5xl font-bold">{data.averageRating}</div>
				<p class="text-gray-400">Average Rating</p>
				<p class="mt-1 text-xs text-gray-500">Based on {data.ratedCount} ratings</p>
			</div>
		</div>

		<div class="card p-6">
			<div class="text-center">
				<div class="text-gradient mb-2 text-5xl font-bold">
					{data.monthlyData.reduce((sum, m) => sum + m.count, 0)}
				</div>
				<p class="text-gray-400">Movies This Year</p>
			</div>
		</div>
	</div>

	<!-- Monthly Breakdown -->
	<div class="card animate-fade-in mb-8 p-6" style="animation-delay: 0.2s;">
		<h2 class="font-display mb-6 text-2xl font-bold">
			Movies Watched per Month ({new Date().getFullYear()})
		</h2>

		<div class="space-y-3">
			{#each data.monthlyData as monthData}
				<div class="flex items-center gap-4">
					<div class="w-12 text-sm text-gray-400">{monthData.month}</div>
					<div class="bg-cinema-darker relative h-8 flex-1 overflow-hidden rounded-full">
						<div
							class="from-cinema-purple to-cinema-pink flex h-full items-center justify-end rounded-full bg-linear-to-r pr-3 transition-all duration-500"
							style="width: {maxMonthly > 0 ? (monthData.count / maxMonthly) * 100 : 0}%"
						>
							{#if monthData.count > 0}
								<span class="text-sm font-semibold text-white">{monthData.count}</span>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Favorite Genres -->
	<div class="card animate-fade-in mb-8 p-6" style="animation-delay: 0.3s;">
		<h2 class="font-display mb-6 text-2xl font-bold">Favorite Genres</h2>

		{#if data.favoriteGenres.length > 0}
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
				{#each data.favoriteGenres as genre, index}
					<div class="bg-cinema-darker border-cinema-purple/30 rounded-lg border p-4">
						<div class="mb-2 flex items-center justify-between">
							<span class="text-cinema-pink text-lg font-semibold">#{index + 1}</span>
							<span class="text-2xl">🎬</span>
						</div>
						<h3 class="mb-1 text-xl font-bold">{genre.genre}</h3>
						<div class="flex items-center gap-4 text-sm text-gray-400">
							<span>{genre.count} movies</span>
							<span>•</span>
							<span>⭐ {genre.avgRating.toFixed(1)} avg</span>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<p class="py-8 text-center text-gray-400">No genre data available yet</p>
		{/if}
	</div>

	<!-- Top Rated Movies -->
	{#if data.topRated.length > 0}
		<div class="animate-fade-in" style="animation-delay: 0.4s;">
			<h2 class="font-display mb-6 text-2xl font-bold">Your Top Rated Movies</h2>

			<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{#each data.topRated as item}
					{#if item.movies}
						<a href="/movie/{item.movies.id}" class="card group cursor-pointer">
							<div class="relative aspect-2/3 overflow-hidden">
								<img
									src={getPosterUrl(item.movies.posterPath)}
									alt={item.movies.title}
									class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
								/>
								<div
									class="bg-cinema-accent absolute top-2 right-2 rounded px-2 py-1 text-xs font-bold"
								>
									⭐ {item.user_movies.rating}
								</div>
							</div>
							<div class="p-3">
								<h3 class="mb-1 line-clamp-2 text-sm font-semibold">{item.movies.title}</h3>
								<p class="text-xs text-gray-400">
									{item.movies.releaseDate?.substring(0, 4) || 'N/A'}
								</p>
							</div>
						</a>
					{/if}
				{/each}
			</div>
		</div>
	{/if}
</div>
