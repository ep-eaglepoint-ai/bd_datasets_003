<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import { getPosterUrl, getBackdropUrl, getProfileUrl } from '$lib/api/tmdb';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let showRatingModal = $state(false);
	let selectedRating = $state(0);
	let review = $state('');
	let loading = $state(false);

	$effect(() => {
		if (data.userMovie) {
			selectedRating = data.userMovie.rating || 0;
			review = data.userMovie.review || '';
		}
	});

	function openRatingModal() {
		showRatingModal = true;
	}

	function closeRatingModal() {
		showRatingModal = false;
	}

	function formatRuntime(minutes: number | undefined): string {
		if (!minutes) return 'N/A';
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return `${hours}h ${mins}m`;
	}

	// svelte-ignore state_referenced_locally
	const genres = data.movie.genres ? JSON.parse(JSON.stringify(data.movie.genres)) : [];
	// svelte-ignore state_referenced_locally
	const cast = data.movie.cast ? JSON.parse(JSON.stringify(data.movie.cast)) : [];
</script>

<svelte:head>
	<title>{data.movie.title} - CineTrack</title>
</svelte:head>

<!-- Backdrop -->
<div class="relative">
	<div class="absolute inset-0 overflow-hidden">
		<img
			src={getBackdropUrl(data.movie.backdrop_path)}
			alt={data.movie.title}
			class="h-full w-full object-cover opacity-20"
		/>
		<div
			class="from-cinema-darker via-cinema-darker/80 absolute inset-0 bg-linear-to-t to-transparent"
		></div>
	</div>

	<div class="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
		<div class="grid items-start gap-8 md:grid-cols-[300px_1fr]">
			<!-- Poster -->
			<div class="animate-fade-in">
				<img
					src={getPosterUrl(data.movie.poster_path, 'w500')}
					alt={data.movie.title}
					class="shadow-cinema-purple/20 w-full rounded-xl shadow-2xl"
				/>
			</div>

			<!-- Movie Info -->
			<div class="animate-fade-in" style="animation-delay: 0.1s;">
				<h1 class="font-display mb-2 text-5xl font-bold">{data.movie.title}</h1>

				<div class="mb-6 flex flex-wrap items-center gap-4 text-gray-400">
					<span>{data.movie.release_date?.substring(0, 4) || 'N/A'}</span>
					<span>•</span>
					<span>{formatRuntime(data.movie.runtime)}</span>
					<span>•</span>
					<span class="flex items-center gap-1">
						<span class="text-cinema-accent">⭐</span>
						{data.movie.vote_average.toFixed(1)}
					</span>
				</div>

				<!-- Genres -->
				{#if genres.length > 0}
					<div class="mb-6 flex flex-wrap gap-2">
						{#each genres as genre}
							<span class="bg-cinema-purple/20 text-cinema-pink rounded-full px-3 py-1 text-sm">
								{genre.name}
							</span>
						{/each}
					</div>
				{/if}

				<!-- Action Buttons -->
				<div class="mb-6 flex flex-wrap gap-3">
					<form
						method="POST"
						action="?/addToList"
						use:enhance={() => {
							return async ({ update }) => {
								await update();
								invalidateAll();
							};
						}}
					>
						<input type="hidden" name="status" value="want_to_watch" />
						<input type="hidden" name="movieData" value={JSON.stringify(data.movie)} />
						<button
							type="submit"
							class:btn-primary={data.userMovie?.status === 'want_to_watch'}
							class:btn-secondary={data.userMovie?.status !== 'want_to_watch'}
						>
							{data.userMovie?.status === 'want_to_watch' ? '✓ Want to Watch' : '+ Want to Watch'}
						</button>
					</form>

					<form
						method="POST"
						action="?/addToList"
						use:enhance={() => {
							return async ({ update }) => {
								await update();
								invalidateAll();
							};
						}}
					>
						<input type="hidden" name="status" value="watching" />
						<input type="hidden" name="movieData" value={JSON.stringify(data.movie)} />
						<button
							type="submit"
							class:btn-primary={data.userMovie?.status === 'watching'}
							class:btn-secondary={data.userMovie?.status !== 'watching'}
						>
							{data.userMovie?.status === 'watching' ? '✓ Watching' : '+ Watching'}
						</button>
					</form>

					<button
						onclick={openRatingModal}
						class:btn-primary={data.userMovie?.status === 'watched'}
						class:btn-secondary={data.userMovie?.status !== 'watched'}
					>
						{data.userMovie?.status === 'watched'
							? `✓ Watched ${data.userMovie.rating ? `(${data.userMovie.rating}⭐)` : ''}`
							: '+ Mark as Watched'}
					</button>
				</div>

				<!-- Synopsis -->
				<div class="mb-6">
					<h2 class="font-display mb-3 text-2xl font-bold">Overview</h2>
					<p class="leading-relaxed text-gray-300">
						{data.movie.overview || 'No overview available.'}
					</p>
				</div>

				<!-- User Review -->
				{#if data.userMovie?.review}
					<div class="bg-cinema-dark/50 border-cinema-purple/30 rounded-lg border p-4">
						<h3 class="mb-2 font-semibold">Your Review</h3>
						<p class="text-gray-300">{data.userMovie.review}</p>
					</div>
				{/if}
			</div>
		</div>

		<!-- Cast -->
		{#if cast.length > 0}
			<div class="animate-fade-in mt-12" style="animation-delay: 0.2s;">
				<h2 class="font-display mb-6 text-2xl font-bold">Cast</h2>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
					{#each cast as member}
						<div class="card">
							<div class="aspect-2/3 overflow-hidden">
								<img
									src={getProfileUrl(member.profile_path)}
									alt={member.name}
									class="h-full w-full object-cover"
								/>
							</div>
							<div class="p-3">
								<p class="text-sm font-semibold">{member.name}</p>
								<p class="line-clamp-2 text-xs text-gray-400">{member.character}</p>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- Rating Modal -->
{#if showRatingModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
		onclick={closeRatingModal}
		role="button"
		tabindex="0"
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="card w-full max-w-md p-6" onclick={(e) => e.stopPropagation()}>
			<h3 class="font-display mb-6 text-2xl font-bold">Rate & Review</h3>

			<form
				method="POST"
				action="?/rate"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						await update();
						await invalidateAll();
						loading = false;
						closeRatingModal();
					};
				}}
			>
				<!-- Star Rating -->
				<div class="mb-6">
					<!-- svelte-ignore a11y_label_has_associated_control -->
					<label class="mb-3 block text-sm font-medium">Your Rating</label>
					<div class="flex justify-center gap-2">
						{#each Array(5) as _, i}
							<button
								type="button"
								onclick={() => (selectedRating = i + 1)}
								class="star {i < selectedRating ? 'star-filled' : 'star-empty'}"
							>
								★
							</button>
						{/each}
					</div>
					<input type="hidden" name="rating" value={selectedRating} />
				</div>

				<!-- Review -->
				<div class="mb-6">
					<label for="review" class="mb-2 block text-sm font-medium">Review (optional)</label>
					<textarea
						id="review"
						name="review"
						bind:value={review}
						rows="4"
						class="input-field resize-none"
						placeholder="Share your thoughts about this movie..."
					></textarea>
				</div>

				<div class="flex gap-3">
					<button
						type="submit"
						disabled={selectedRating === 0 || loading}
						class="btn-primary flex-1 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{loading ? 'Saving...' : 'Save Review'}
					</button>
					<button type="button" onclick={closeRatingModal} class="btn-secondary"> Cancel </button>
				</div>
			</form>
		</div>
	</div>
{/if}
