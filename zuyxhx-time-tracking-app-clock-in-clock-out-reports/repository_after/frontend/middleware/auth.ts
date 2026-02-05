export default defineNuxtRouteMiddleware((to) => {
  const authStore = useAuthStore()
  
  // Initialize auth from localStorage on client-side before checking
  // This prevents redirect loops during SSR hydration
  if (process.client && !authStore.token) {
    authStore.loadToken()
  }
  
  const publicPages = ['/', '/login', '/register']
  const authRequired = !publicPages.includes(to.path)
  
  if (authRequired && !authStore.token) {
    return navigateTo('/login')
  }
})
