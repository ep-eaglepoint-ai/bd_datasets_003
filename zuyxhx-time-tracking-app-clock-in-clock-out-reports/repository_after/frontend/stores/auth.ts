import { defineStore } from 'pinia'
import type { User, Token, LoginCredentials, RegisterData } from '~/types'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    token: null as string | null,
    loading: false,
    error: null as string | null
  }),

  getters: {
    isAuthenticated: (state) => !!state.token,
    currentUser: (state) => state.user
  },

  actions: {
    loadToken() {
      if (process.client) {
        this.token = localStorage.getItem('auth_token')
      }
    },

    saveToken(token: string) {
      this.token = token
      if (process.client) {
        localStorage.setItem('auth_token', token)
      }
    },

    clearToken() {
      this.token = null
      this.user = null
      if (process.client) {
        localStorage.removeItem('auth_token')
      }
    },

    async register(data: RegisterData): Promise<{ success: boolean; error?: string }> {
      this.loading = true
      this.error = null

      try {
        const response = await fetch(`${useRuntimeConfig().public.apiBase}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })

        if (!response.ok) {
          const err = await response.json()
          this.error = err.detail || 'Registration failed'
          return { success: false, error: this.error! }
        }

        return { success: true }
      } catch {
        this.error = 'Network error'
        return { success: false, error: this.error }
      } finally {
        this.loading = false
      }
    },

    async login(credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> {
      this.loading = true
      this.error = null

      try {
        const response = await fetch(`${useRuntimeConfig().public.apiBase}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials)
        })

        if (!response.ok) {
          const err = await response.json()
          this.error = err.detail || 'Login failed'
          return { success: false, error: this.error! }
        }

        const token: Token = await response.json()
        this.saveToken(token.access_token)
        return { success: true }
      } catch {
        this.error = 'Network error'
        return { success: false, error: this.error }
      } finally {
        this.loading = false
      }
    },

    async fetchUser() {
      if (!this.token) return


      try {
        const response = await fetch(`${useRuntimeConfig().public.apiBase}/auth/me`, {
          headers: { 'Authorization': `Bearer ${this.token}` }
        })

        if (response.ok) {
          this.user = await response.json()
        } else {
          this.clearToken()
        }
      } catch (error) {
        this.clearToken()
      }
    },

    logout() {
      this.clearToken()
      navigateTo('/login')
    }
  }
})
