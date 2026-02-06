import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '../../../repository_after/frontend/stores/auth'

global.fetch = vi.fn()
global.localStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
}

const mockRuntimeConfig = {
  public: {
    apiBase: 'http://localhost:8000'
  }
}

vi.mock('#app', () => ({
  useRuntimeConfig: () => mockRuntimeConfig,
  navigateTo: vi.fn()
}))

describe('Auth Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('initializes with null user and token', () => {
    const store = useAuthStore()
    expect(store.user).toBeNull()
    expect(store.token).toBeNull()
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('isAuthenticated returns false when no token', () => {
    const store = useAuthStore()
    expect(store.isAuthenticated).toBe(false)
  })

  it('isAuthenticated returns true when token exists', () => {
    const store = useAuthStore()
    store.token = 'test-token'
    expect(store.isAuthenticated).toBe(true)
  })

  it('saveToken stores token in state and localStorage', () => {
    const store = useAuthStore()
    store.saveToken('test-token-123')
    expect(store.token).toBe('test-token-123')
    expect(localStorage.setItem).toHaveBeenCalledWith('auth_token', 'test-token-123')
  })

  it('clearToken removes token from state and localStorage', () => {
    const store = useAuthStore()
    store.token = 'test-token'
    store.user = { id: 1, email: 'test@test.com', created_at: '2024-01-01' }
    store.clearToken()
    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
    expect(localStorage.removeItem).toHaveBeenCalledWith('auth_token')
  })

  it('register success returns success true', async () => {
    const store = useAuthStore()
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1, email: 'test@test.com' })
    })

    const result = await store.register({ email: 'test@test.com', password: 'password123' })
    expect(result.success).toBe(true)
    expect(store.loading).toBe(false)
  })

  it('register failure returns error', async () => {
    const store = useAuthStore()
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'Email already exists' })
    })

    const result = await store.register({ email: 'test@test.com', password: 'password123' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('Email already exists')
  })

  it('login success saves token', async () => {
    const store = useAuthStore()
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'token-123', token_type: 'bearer' })
    })

    const result = await store.login({ email: 'test@test.com', password: 'password123' })
    expect(result.success).toBe(true)
    expect(store.token).toBe('token-123')
  })

  it('login failure returns error', async () => {
    const store = useAuthStore()
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'Invalid credentials' })
    })

    const result = await store.login({ email: 'test@test.com', password: 'wrong' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid credentials')
  })
})
