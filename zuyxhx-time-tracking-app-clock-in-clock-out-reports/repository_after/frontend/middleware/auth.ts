export default defineNuxtRouteMiddleware((to) => {
  const authStore = useAuthStore()
  
  const publicPages = ['/', '/login', '/register']
  const authRequired = !publicPages.includes(to.path)
  
  if (authRequired && !authStore.token) {
    return navigateTo('/login')
  }
})
