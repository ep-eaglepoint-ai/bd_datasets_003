<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import { getPosterUrl } from '$lib/api/tmdb';

	let { data }: { data: PageData } = $props();

	let showCreateModal = $state(false);
	let listName = $state('');
	let listDescription = $state('');
	let loading = $state(false);

	function openCreateModal() {
		showCreateModal = true;
		listName = '';
		listDescription = '';
	}

	function closeCreateModal() {
		showCreateModal = false;
	}

	const statusLabels: Record<string, string> = {
		want_to_watch: 'Want to Watch',
		watching: 'Currently Watching',
		watched: 'Watched'
	};
</script>

<svelte:head>
	<title>My Lists - CineTrack</title>
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<div class="animate-fade-in mb-8 flex items-center justify-between">
		<div>
			<h1 class="font-display text-gradient mb-2 text-4xl font-bold">My Lists</h1>
			<p class="text-gray-400">Organize your movie collection</p>
		</div>

		<button onclick={openCreateModal} class="btn-primary"> + Create List </button>
	</div>

	<!-- Default Lists -->
	<div class="animate-fade-in mb-8" style="animation-delay: 0.1s;">
		<h2 class="font-display mb-4 text-2xl font-bold">Default Lists</h2>

		<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
			<a
				href="/lists?filter=want_to_watch"
				class="card hover:border-cinema-purple cursor-pointer p-6"
			>
				<div class="mb-2 flex items-center justify-between">
					<h3 class="text-xl font-semibold">Want to Watch</h3>
					<span class="text-3xl">📋</span>
				</div>
				<p class="mb-2 text-sm text-gray-400">Movies on your radar</p>
				<p class="text-cinema-purple text-2xl font-bold">
					{data.filteredMovies.filter((m) => m.user_movies?.status === 'want_to_watch').length || 0}
				</p>
			</a>

			<a href="/lists?filter=watching" class="card hover:border-cinema-purple cursor-pointer p-6">
				<div class="mb-2 flex items-center justify-between">
					<h3 class="text-xl font-semibold">Watching</h3>
					<span class="text-3xl">🎞️</span>
				</div>
				<p class="mb-2 text-sm text-gray-400">Currently in progress</p>
				<p class="text-cinema-pink text-2xl font-bold">
					{data.filteredMovies.filter((m) => m.user_movies?.status === 'watching').length || 0}
				</p>
			</a>

			<a href="/lists?filter=watched" class="card hover:border-cinema-purple cursor-pointer p-6">
				<div class="mb-2 flex items-center justify-between">
					<h3 class="text-xl font-semibold">Watched</h3>
					<span class="text-3xl">✅</span>
				</div>
				<p class="mb-2 text-sm text-gray-400">Completed movies</p>
				<p class="text-cinema-accent text-2xl font-bold">
					{data.filteredMovies.filter((m) => m.user_movies?.status === 'watched').length || 0}
				</p>
			</a>
		</div>
	</div>

	<!-- Filtered Movies View -->
	{#if data.filter && data.filteredMovies.length > 0}
		<div class="animate-fade-in mb-8" style="animation-delay: 0.2s;">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="font-display text-2xl font-bold">{statusLabels[data.filter]}</h2>
				<a href="/lists" class="text-cinema-pink hover:text-cinema-accent">← Back to Lists</a>
			</div>

			<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{#each data.filteredMovies as item}
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
		</div>
	{/if}

	<!-- Custom Lists -->
	{#if !data.filter}
		<div class="animate-fade-in" style="animation-delay: 0.3s;">
			<h2 class="font-display mb-4 text-2xl font-bold">Custom Lists</h2>

			{#if data.customLists.length > 0}
				<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
					{#each data.customLists as list}
						<div class="card p-6">
							<div class="mb-3 flex items-start justify-between">
								<div class="flex-1">
									<h3 class="mb-1 text-xl font-semibold">{list.name}</h3>
									{#if list.description}
										<p class="mb-2 text-sm text-gray-400">{list.description}</p>
									{/if}
									<p class="text-cinema-pink text-sm">{list.movies.length} movies</p>
								</div>

								<form
									method="POST"
									action="?/deleteList"
									use:enhance={() => {
										return async ({ update }) => {
											await update();
											invalidateAll();
										};
									}}
								>
									<input type="hidden" name="listId" value={list.id} />
									<button
										type="submit"
										class="text-sm text-red-400 hover:text-red-300"
										onclick={(e) => {
											if (!confirm('Are you sure you want to delete this list?')) {
												e.preventDefault();
											}
										}}
									>
										Delete
									</button>
								</form>
							</div>

							{#if list.movies.length > 0}
								<div class="grid grid-cols-4 gap-2">
									{#each list.movies.slice(0, 4) as item}
										{#if item.movies}
											<a
												href="/movie/{item.movies.id}"
												class="aspect-[2/3] overflow-hidden rounded"
											>
												<img
													src={getPosterUrl(item.movies.posterPath, 'w185')}
													alt={item.movies.title}
													class="h-full w-full object-cover transition-transform hover:scale-110"
												/>
											</a>
										{/if}
									{/each}
								</div>
							{:else}
								<div class="py-8 text-center text-sm text-gray-500">No movies yet</div>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<div class="card p-12 text-center">
					<div class="mb-4 text-5xl">📚</div>
					<p class="mb-4 text-gray-400">No custom lists yet</p>
					<button onclick={openCreateModal} class="btn-primary"> Create Your First List </button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- Create List Modal -->
{#if showCreateModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
		onclick={closeCreateModal}
		role="button"
		tabindex="0"
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="card w-full max-w-md p-6" onclick={(e) => e.stopPropagation()}>
			<h3 class="font-display mb-6 text-2xl font-bold">Create New List</h3>

			<form
				method="POST"
				action="?/createList"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						await update();
						await invalidateAll();
						loading = false;
						closeCreateModal();
					};
				}}
			>
				<div class="space-y-4">
					<div>
						<label for="name" class="mb-2 block text-sm font-medium">List Name *</label>
						<input
							type="text"
							id="name"
							name="name"
							bind:value={listName}
							required
							class="input-field"
							placeholder="e.g., Date Night Movies"
						/>
					</div>

					<div>
						<label for="description" class="mb-2 block text-sm font-medium"
							>Description (optional)</label
						>
						<textarea
							id="description"
							name="description"
							bind:value={listDescription}
							rows="3"
							class="input-field resize-none"
							placeholder="What's this list about?"
						></textarea>
					</div>

					<div class="flex gap-3">
						<button
							type="submit"
							disabled={!listName || loading}
							class="btn-primary flex-1 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{loading ? 'Creating...' : 'Create List'}
						</button>
						<button type="button" onclick={closeCreateModal} class="btn-secondary"> Cancel </button>
					</div>
				</div>
			</form>
		</div>
	</div>
{/if}
