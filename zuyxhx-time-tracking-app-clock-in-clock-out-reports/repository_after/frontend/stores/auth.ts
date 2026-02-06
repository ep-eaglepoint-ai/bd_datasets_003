import { defineStore } from 'pinia'
import type { User, Token, LoginCredentials, RegisterData, ApiError } from '~/types'

/**
 * Helper function to format 422 validation errors into readable messages
 */
function formatValidationError(err: any): string {
  if (typeof err.detail === 'string') {
    return err.detail
  }
  if (Array.isArray(err.detail)) {
    return err.detail
      .map((e: { loc?: string[]; msg?: string }) => {
        const field = e.loc?.slice(-1)[0] || 'field'
        return `${field}: ${e.msg || 'Invalid value'}`
      })
      .join(', ')
  }
  return 'Validation failed'
}

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
    /**
     * Load token from storage. Works during SSR by checking for cookie fallback
     * and on client by loading from localStorage.
     */
    loadToken() {
      if (process.client) {
        this.token = localStorage.getItem('auth_token')
      }
    },

    /**
     * Initialize auth state - call this early in app lifecycle for SSR support
     */
    async initAuth() {
      this.loadToken()
      if (this.token) {
        await this.fetchUser()
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
      const api = useApi()
      this.loading = true
      this.error = null

      const { data: result, error } = await api.post<User>('/auth/register', data)
      
      this.loading = false
      
      if (error) {
        this.error = error
        return { success: false, error }
      }

      return { success: true }
    },

    async login(credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> {
      const api = useApi()
      this.loading = true
      this.error = null

      const { data: token, error } = await api.post<Token>('/auth/login', credentials)
      
      this.loading = false
      
      if (error) {
        this.error = error
        return { success: false, error }
      }

      if (token) {
        this.saveToken(token.access_token)
      }
      return { success: true }
    },

    async fetchUser() {
      if (!this.token) return

      const api = useApi()
      const { data: user, error } = await api.get<User>('/auth/me')

      if (user) {
        this.user = user
      } else if (error) {
        this.clearToken()
      }
    },

    logout() {
      this.clearToken()
      navigateTo('/login')
    }
  }
})
