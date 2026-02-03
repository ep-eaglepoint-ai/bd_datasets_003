import type { ApiError } from '~/types'

export function useApi() {
  const config = useRuntimeConfig()
  const authStore = useAuthStore()

  const baseURL = config.public.apiBase

  async function request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ data: T | null; error: string | null }> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers
    }

    if (authStore.token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${authStore.token}`
    }

    try {
      const response = await fetch(`${baseURL}${endpoint}`, {
        ...options,
        headers
      })

      if (!response.ok) {
        const errorData: ApiError = await response.json()
        return { data: null, error: errorData.detail || 'Request failed' }
      }

      if (response.status === 204) {
        return { data: null, error: null }
      }

      const data = await response.json()
      return { data, error: null }
    } catch (err) {
      return { data: null, error: 'Network error' }
    }
  }

  function get<T>(endpoint: string) {
    return request<T>(endpoint, { method: 'GET' })
  }

  function post<T>(endpoint: string, body?: unknown) {
    return request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined
    })
  }

  return { get, post, request }
}
