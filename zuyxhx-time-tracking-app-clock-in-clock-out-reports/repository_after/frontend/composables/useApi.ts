import type { ApiError } from '~/types'

/**
 * Format validation errors (422 responses) into human-readable messages.
 * Handles both string detail and array of validation errors.
 */
function formatErrorDetail(errorData: any): string {
  if (!errorData) return 'Request failed'
  
  // Handle string detail
  if (typeof errorData.detail === 'string') {
    return errorData.detail
  }
  
  // Handle array of validation errors (Pydantic format)
  if (Array.isArray(errorData.detail)) {
    return errorData.detail
      .map((err: { loc?: (string | number)[]; msg?: string; type?: string }) => {
        // Get field name from location, skip 'body' if present
        const fieldPath = err.loc?.filter(l => l !== 'body') || []
        const field = fieldPath.length > 0 ? fieldPath.join('.') : 'value'
        const message = err.msg || 'Invalid value'
        return `${field}: ${message}`
      })
      .join('; ')
  }
  
  return 'Request failed'
}

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
        const errorData = await response.json()
        const formattedError = formatErrorDetail(errorData)
        return { data: null, error: formattedError }
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

  function put<T>(endpoint: string, body?: unknown) {
    return request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined
    })
  }

  function del<T>(endpoint: string) {
    return request<T>(endpoint, { method: 'DELETE' })
  }

  return { get, post, put, del, request }
}
