<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>Sign Up - CineTrack</title>
</svelte:head>

<div
	class="from-cinema-darker via-cinema-dark to-cinema-blue/20 flex min-h-screen items-center justify-center bg-gradient-to-br px-4 py-12"
>
	<div class="pointer-events-none absolute inset-0 overflow-hidden">
		<div class="bg-cinema-accent/10 absolute top-20 right-10 h-64 w-64 rounded-full blur-3xl"></div>
		<div
			class="bg-cinema-purple/10 absolute bottom-20 left-10 h-96 w-96 rounded-full blur-3xl"
		></div>
	</div>

	<div class="relative z-10 w-full max-w-md">
		<div class="animate-fade-in mb-8 text-center">
			<div class="mb-4 text-6xl">🎬</div>
			<h1 class="font-display text-gradient mb-2 text-5xl font-bold">CineTrack</h1>
			<p class="text-gray-400">Start tracking your movie journey</p>
		</div>

		<div class="card animate-fade-in p-8" style="animation-delay: 0.2s;">
			<h2 class="font-display mb-6 text-center text-2xl font-bold">Create Account</h2>

			{#if form?.error}
				<div
					class="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-400"
				>
					{form.error}
				</div>
			{/if}

			<form
				method="POST"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						await update();
						loading = false;
					};
				}}
			>
				<div class="space-y-4">
					<div>
						<label for="name" class="mb-2 block text-sm font-medium text-gray-300">Name</label>
						<input
							type="text"
							id="name"
							name="name"
							required
							class="input-field"
							placeholder="Your name"
						/>
					</div>

					<div>
						<label for="email" class="mb-2 block text-sm font-medium text-gray-300">Email</label>
						<input
							type="email"
							id="email"
							name="email"
							required
							class="input-field"
							placeholder="your@email.com"
						/>
					</div>

					<div>
						<label for="password" class="mb-2 block text-sm font-medium text-gray-300"
							>Password</label
						>
						<input
							type="password"
							id="password"
							name="password"
							required
							minlength="8"
							class="input-field"
							placeholder="••••••••"
						/>
						<p class="mt-1 text-xs text-gray-500">At least 8 characters</p>
					</div>

					<button
						type="submit"
						disabled={loading}
						class="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
					>
						{loading ? 'Creating account...' : 'Sign Up'}
					</button>
				</div>
			</form>

			<div class="mt-6 text-center text-sm text-gray-400">
				Already have an account?
				<a href="/login" class="text-cinema-pink hover:text-cinema-accent ml-1 font-semibold">
					Login
				</a>
			</div>
		</div>
	</div>
</div>
