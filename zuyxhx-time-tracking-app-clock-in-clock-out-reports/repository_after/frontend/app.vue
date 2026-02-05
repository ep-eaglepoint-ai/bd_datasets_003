<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
const authStore = useAuthStore()

// Use callOnce to initialize auth state - runs once during SSR and hydration
// This ensures token is available before route guards run
if (process.client) {
  // Client-side: load token immediately (synchronous)
  authStore.loadToken()
}

onMounted(async () => {
  // Ensure token is loaded and fetch user data
  if (!authStore.token) {
    authStore.loadToken()
  }
  if (authStore.token) {
    await authStore.fetchUser()
  }
})
</script>
