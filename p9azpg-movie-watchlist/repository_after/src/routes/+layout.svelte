<script lang="ts">
	import './app.css';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: any } = $props();
</script>

<div class="flex min-h-screen flex-col">
	{#if data.user}
		<nav
			class="bg-cinema-dark bg-opacity-95 sticky top-0 z-50 border-b border-gray-800 backdrop-blur-lg"
		>
			<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<div class="flex h-16 items-center justify-between">
					<div class="flex items-center space-x-8">
						<a href="/dashboard" class="flex items-center space-x-2">
							<span class="text-3xl">🎬</span>
							<span class="font-display text-gradient text-2xl font-bold">CineTrack</span>
						</a>

						<div class="hidden space-x-6 md:flex">
							<a href="/dashboard" class="hover:text-cinema-pink text-gray-300 transition-colors">
								Dashboard
							</a>
							<a href="/search" class="hover:text-cinema-pink text-gray-300 transition-colors">
								Search
							</a>
							<a href="/lists" class="hover:text-cinema-pink text-gray-300 transition-colors">
								My Lists
							</a>
							<a href="/stats" class="hover:text-cinema-pink text-gray-300 transition-colors">
								Stats
							</a>
						</div>
					</div>

					<div class="flex items-center space-x-4">
						<span class="hidden text-sm text-gray-400 sm:block">
							Welcome, <span class="text-cinema-pink font-semibold">{data.user.name}</span>
						</span>
						<form method="POST" action="/logout">
							<button
								type="submit"
								class="hover:text-cinema-accent text-gray-300 transition-colors"
							>
								Logout
							</button>
						</form>
					</div>
				</div>
			</div>
		</nav>
	{/if}

	<main class="flex-1">
		{@render children()}
	</main>

	{#if data.user}
		<footer class="bg-cinema-dark mt-auto border-t border-gray-800 py-6">
			<div class="mx-auto max-w-7xl px-4 text-center text-sm text-gray-400 sm:px-6 lg:px-8">
				<p>&copy; 2024 CineTrack. Your personal movie companion.</p>
			</div>
		</footer>
	{/if}
</div>
