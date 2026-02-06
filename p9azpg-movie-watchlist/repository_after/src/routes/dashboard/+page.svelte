<script lang="ts">
	import type { PageData } from './$types';
	import { getPosterUrl } from '$lib/api/tmdb';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Dashboard - CineTrack</title>
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<div class="animate-fade-in mb-8">
		<h1 class="font-display text-gradient mb-2 text-4xl font-bold">My Watchlist</h1>
		<p class="text-gray-400">Track and discover your favorite movies</p>
	</div>

	<!-- Quick Stats -->
	<div
		class="animate-fade-in mb-8 grid grid-cols-1 gap-6 md:grid-cols-4"
		style="animation-delay: 0.1s;"
	>
		<div class="card p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="mb-1 text-sm text-gray-400">Want to Watch</p>
					<p class="text-cinema-purple text-3xl font-bold">{data.wantToWatch.length}</p>
				</div>
				<div class="text-4xl">📋</div>
			</div>
		</div>

		<div class="card p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="mb-1 text-sm text-gray-400">Currently Watching</p>
					<p class="text-cinema-pink text-3xl font-bold">{data.watching.length}</p>
				</div>
				<div class="text-4xl">🎞️</div>
			</div>
		</div>

		<div class="card p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="mb-1 text-sm text-gray-400">Watched</p>
					<p class="text-cinema-accent text-3xl font-bold">{data.watched.length}</p>
				</div>
				<div class="text-4xl">✅</div>
			</div>
		</div>

		<div class="card p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="mb-1 text-sm text-gray-400">Custom Lists</p>
					<p class="text-3xl font-bold text-purple-400">{data.customListsCount}</p>
				</div>
				<div class="text-4xl">📚</div>
			</div>
		</div>
	</div>

	<!-- Currently Watching -->
	{#if data.watching.length > 0}
		<div class="animate-fade-in mb-8" style="animation-delay: 0.2s;">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="font-display text-2xl font-bold">Currently Watching</h2>
			</div>

			<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{#each data.watching as item}
					{#if item.movies}
						<a href="/movie/{item.movies.id}" class="card group cursor-pointer">
							<div class="aspect-[2/3] overflow-hidden">
								<img
									src={getPosterUrl(item.movies.posterPath)}
									alt={item.movies.title}
									class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
								/>
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

	<!-- Want to Watch -->
	{#if data.wantToWatch.length > 0}
		<div class="animate-fade-in mb-8" style="animation-delay: 0.3s;">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="font-display text-2xl font-bold">Want to Watch</h2>
			</div>

			<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{#each data.wantToWatch.slice(0, 10) as item}
					{#if item.movies}
						<a href="/movie/{item.movies.id}" class="card group cursor-pointer">
							<div class="aspect-[2/3] overflow-hidden">
								<img
									src={getPosterUrl(item.movies.posterPath)}
									alt={item.movies.title}
									class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
								/>
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

			{#if data.wantToWatch.length > 10}
				<div class="mt-4 text-center">
					<a href="/lists?filter=want_to_watch" class="text-cinema-pink hover:text-cinema-accent">
						View all {data.wantToWatch.length} movies →
					</a>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Recently Watched -->
	{#if data.watched.length > 0}
		<div class="animate-fade-in mb-8" style="animation-delay: 0.4s;">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="font-display text-2xl font-bold">Recently Watched</h2>
			</div>

			<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{#each data.watched.slice(0, 10) as item}
					{#if item.movies}
						<a href="/movie/{item.movies.id}" class="card group cursor-pointer">
							<div class="relative aspect-[2/3] overflow-hidden">
								<img
									src={getPosterUrl(item.movies.posterPath)}
									alt={item.movies.title}
									class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
								/>
								{#if item.user_movies.rating}
									<div
										class="bg-cinema-accent absolute top-2 right-2 rounded px-2 py-1 text-xs font-bold"
									>
										⭐ {item.user_movies.rating}
									</div>
								{/if}
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

			{#if data.watched.length > 10}
				<div class="mt-4 text-center">
					<a href="/lists?filter=watched" class="text-cinema-pink hover:text-cinema-accent">
						View all {data.watched.length} movies →
					</a>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Empty State -->
	{#if data.wantToWatch.length === 0 && data.watching.length === 0 && data.watched.length === 0}
		<div class="animate-fade-in py-16 text-center">
			<div class="mb-4 text-6xl">🎬</div>
			<h3 class="font-display mb-2 text-2xl font-bold">Your watchlist is empty</h3>
			<p class="mb-6 text-gray-400">Start by searching for movies you want to watch</p>
			<a href="/search" class="btn-primary inline-block"> Browse Movies </a>
		</div>
	{/if}
</div>
