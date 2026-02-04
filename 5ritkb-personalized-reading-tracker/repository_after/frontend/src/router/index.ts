import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '../views/Dashboard.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { 
      path: '/login', 
      name: 'login', 
      component: () => import('../views/Login.vue') 
    },
    { 
      path: '/register', 
      name: 'register', 
      component: () => import('../views/Register.vue') 
    },
    { 
      path: '/', 
      name: 'dashboard', 
      component: Dashboard,
      meta: { requiresAuth: true }
    },
    { 
      path: '/search', 
      name: 'search', 
      component: () => import('../views/Search.vue'),
      meta: { requiresAuth: true }
    }
  ]
})

router.beforeEach((to, from, next) => {
  const isAuthenticated = !!localStorage.getItem('token')
  
  if (to.meta.requiresAuth && !isAuthenticated) {
    next('/login')
  } 
  else if ((to.name === 'login' || to.name === 'register') && isAuthenticated) {
    next('/')
  } 
  else {
    next()
  }
})

export default router