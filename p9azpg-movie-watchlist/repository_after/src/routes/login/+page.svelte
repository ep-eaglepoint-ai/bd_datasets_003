<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>Login - CineTrack</title>
</svelte:head>

<div
	class="from-cinema-darker via-cinema-dark to-cinema-blue/20 flex min-h-screen items-center justify-center bg-gradient-to-br px-4 py-12"
>
	<div class="pointer-events-none absolute inset-0 overflow-hidden">
		<div class="bg-cinema-purple/10 absolute top-20 left-10 h-64 w-64 rounded-full blur-3xl"></div>
		<div
			class="bg-cinema-pink/10 absolute right-10 bottom-20 h-96 w-96 rounded-full blur-3xl"
		></div>
	</div>

	<div class="relative z-10 w-full max-w-md">
		<div class="animate-fade-in mb-8 text-center">
			<div class="mb-4 text-6xl">🎬</div>
			<h1 class="font-display text-gradient mb-2 text-5xl font-bold">CineTrack</h1>
			<p class="text-gray-400">Your personal movie companion</p>
		</div>

		<div class="card animate-fade-in p-8" style="animation-delay: 0.2s;">
			<h2 class="font-display mb-6 text-center text-2xl font-bold">Welcome Back</h2>

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
							class="input-field"
							placeholder="••••••••"
						/>
					</div>

					<button
						type="submit"
						disabled={loading}
						class="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
					>
						{loading ? 'Logging in...' : 'Login'}
					</button>
				</div>
			</form>

			<div class="mt-6 text-center text-sm text-gray-400">
				Don't have an account?
				<a href="/register" class="text-cinema-pink hover:text-cinema-accent ml-1 font-semibold">
					Sign up
				</a>
			</div>
		</div>
	</div>
</div>
