<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
const authStore = useAuthStore()

onMounted(() => {
  authStore.loadToken()
  if (authStore.token) {
    authStore.fetchUser()
  }
})
</script>
