import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useApi } from '../../repository_after/frontend/composables/useApi'
import { useAuthStore } from '../../repository_after/frontend/stores/auth'

global.fetch = vi.fn()

const mockRuntimeConfig = {
  public: {
    apiBase: 'http://localhost:8000'
  }
}

vi.mock('#app', () => ({
  useRuntimeConfig: () => mockRuntimeConfig
}))

describe('useApi Composable', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('makes GET request successfully', async () => {
    const mockData = { id: 1, name: 'Test' }
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData
    })

    const { get } = useApi()
    const result = await get('/test')
    
    expect(result.data).toEqual(mockData)
    expect(result.error).toBeNull()
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/test',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('makes POST request with body', async () => {
    const mockData = { success: true }
    const postBody = { email: 'test@test.com' }
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData
    })

    const { post } = useApi()
    const result = await post('/test', postBody)
    
    expect(result.data).toEqual(mockData)
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/test',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(postBody)
      })
    )
  })

  it('includes Authorization header when token exists', async () => {
    const authStore = useAuthStore()
    authStore.token = 'test-token-123'

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({})
    })

    const { get } = useApi()
    await get('/protected')
    
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/protected',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token-123'
        })
      })
    )
  })

  it('handles API errors', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'Not found' })
    })

    const { get } = useApi()
    const result = await get('/notfound')
    
    expect(result.data).toBeNull()
    expect(result.error).toBe('Not found')
  })

  it('handles network errors', async () => {
    ;(global.fetch as any).mockRejectedValueOnce(new Error('Network error'))

    const { get } = useApi()
    const result = await get('/test')
    
    expect(result.data).toBeNull()
    expect(result.error).toBe('Network error')
  })

  it('handles 204 No Content response', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 204
    })

    const { post } = useApi()
    const result = await post('/logout')
    
    expect(result.data).toBeNull()
    expect(result.error).toBeNull()
  })

  it('handles 422 validation errors with array format', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ 
        detail: [
          { loc: ['body', 'email'], msg: 'value is not a valid email address' },
          { loc: ['body', 'password'], msg: 'field required' }
        ] 
      })
    })

    const { post } = useApi()
    const result = await post('/register', { email: 'invalid' })
    
    expect(result.data).toBeNull()
    expect(result.error).toContain('email')
    expect(result.error).toContain('password')
  })
})
