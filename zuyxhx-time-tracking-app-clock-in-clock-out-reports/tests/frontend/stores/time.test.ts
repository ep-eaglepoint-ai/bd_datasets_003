/**
 * Tests for Time Store (Pinia)
 * 
 * Covers time tracking functionality:
 * - Clock in/out behavior
 * - Status tracking
 * - Entry management
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTimeStore } from '../../../repository_after/frontend/stores/time'
import { useAuthStore } from '../../../repository_after/frontend/stores/auth'

// Mock fetch globally
global.fetch = vi.fn()

const mockRuntimeConfig = {
  public: {
    apiBase: 'http://localhost:8000'
  }
}

vi.mock('#app', () => ({
  useRuntimeConfig: () => mockRuntimeConfig
}))

describe('Time Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    
    // Set up authenticated state
    const authStore = useAuthStore()
    authStore.token = 'test-token'
  })

  describe('Initial State', () => {
    it('initializes with empty state', () => {
      const store = useTimeStore()
      expect(store.entries).toEqual([])
      expect(store.activeEntry).toBeNull()
      expect(store.isClockedIn).toBe(false)
      expect(store.loading).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  describe('fetchStatus', () => {
    it('updates isClockedIn to true when user is clocked in', async () => {
      const store = useTimeStore()
      const mockStatus = {
        is_clocked_in: true,
        active_entry: {
          id: 1,
          user_id: 1,
          start_at: '2026-02-06T09:00:00Z',
          end_at: null,
          is_active: true,
          notes: 'Working'
        }
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockStatus
      })

      await store.fetchStatus()

      expect(store.isClockedIn).toBe(true)
      expect(store.activeEntry).not.toBeNull()
      expect(store.activeEntry?.notes).toBe('Working')
    })

    it('updates isClockedIn to false when user is not clocked in', async () => {
      const store = useTimeStore()
      const mockStatus = {
        is_clocked_in: false,
        active_entry: null
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockStatus
      })

      await store.fetchStatus()

      expect(store.isClockedIn).toBe(false)
      expect(store.activeEntry).toBeNull()
    })

    it('does nothing when no auth token', async () => {
      const authStore = useAuthStore()
      authStore.token = null
      
      const store = useTimeStore()
      await store.fetchStatus()

      // fetch should not be called
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('sets error on API failure', async () => {
      const store = useTimeStore()

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: 'Server error' })
      })

      await store.fetchStatus()

      expect(store.error).toBe('Server error')
    })
  })

  describe('clockIn', () => {
    it('successfully clocks in user', async () => {
      const store = useTimeStore()
      const mockEntry = {
        id: 1,
        user_id: 1,
        start_at: '2026-02-06T09:00:00Z',
        end_at: null,
        is_active: true,
        notes: 'Starting work'
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockEntry
      })

      const result = await store.clockIn({ notes: 'Starting work' })

      expect(result.success).toBe(true)
      expect(store.isClockedIn).toBe(true)
      expect(store.activeEntry?.notes).toBe('Starting work')
      expect(store.loading).toBe(false)
    })

    it('clocks in without notes', async () => {
      const store = useTimeStore()
      const mockEntry = {
        id: 1,
        user_id: 1,
        start_at: '2026-02-06T09:00:00Z',
        end_at: null,
        is_active: true,
        notes: null
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockEntry
      })

      const result = await store.clockIn()

      expect(result.success).toBe(true)
      expect(store.isClockedIn).toBe(true)
    })

    it('returns error when already clocked in', async () => {
      const store = useTimeStore()

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: 'Already clocked in' })
      })

      const result = await store.clockIn()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Already clocked in')
      expect(store.loading).toBe(false)
    })

    it('sets loading state during request', async () => {
      const store = useTimeStore()
      
      let resolvePromise: any
      ;(global.fetch as any).mockReturnValueOnce(new Promise(resolve => {
        resolvePromise = resolve
      }))

      const promise = store.clockIn()
      
      // Check loading is true during request
      expect(store.loading).toBe(true)
      
      // Resolve the request
      resolvePromise({ ok: true, json: async () => ({ id: 1, start_at: '2026-02-06T09:00:00Z' }) })
      await promise
      
      expect(store.loading).toBe(false)
    })
  })

  describe('clockOut', () => {
    it('successfully clocks out user', async () => {
      const store = useTimeStore()
      store.isClockedIn = true
      store.activeEntry = {
        id: 1,
        user_id: 1,
        start_at: '2026-02-06T09:00:00Z',
        end_at: null,
        is_active: true,
        created_at: '2026-02-06T09:00:00Z',
        duration_hours: null,
        notes: null
      }

      const mockEntry = {
        id: 1,
        user_id: 1,
        start_at: '2026-02-06T09:00:00Z',
        end_at: '2026-02-06T17:00:00Z',
        is_active: false,
        duration_hours: 8.0
      }

      // First call for clockOut, second for fetchEntries
      ;(global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockEntry
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ entries: [mockEntry], total: 1, page: 1, per_page: 50 })
        })

      const result = await store.clockOut({ notes: 'End of day' })

      expect(result.success).toBe(true)
      expect(store.isClockedIn).toBe(false)
      expect(store.activeEntry).toBeNull()
    })

    it('returns error when not clocked in', async () => {
      const store = useTimeStore()

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: 'Not clocked in' })
      })

      const result = await store.clockOut()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Not clocked in')
    })
  })

  describe('fetchEntries', () => {
    it('fetches time entries successfully', async () => {
      const store = useTimeStore()
      const mockResponse = {
        entries: [
          { id: 1, start_at: '2026-02-06T09:00:00Z', end_at: '2026-02-06T17:00:00Z', duration_hours: 8 },
          { id: 2, start_at: '2026-02-05T09:00:00Z', end_at: '2026-02-05T17:00:00Z', duration_hours: 8 }
        ],
        total: 2,
        page: 1,
        per_page: 50
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      await store.fetchEntries()

      expect(store.entries).toHaveLength(2)
      expect(store.total).toBe(2)
    })

    it('applies date filters to API request', async () => {
      const store = useTimeStore()

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ entries: [], total: 0, page: 1, per_page: 50 })
      })

      await store.fetchEntries('2026-02-01', '2026-02-06')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('start_date=2026-02-01'),
        expect.any(Object)
      )
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('end_date=2026-02-06'),
        expect.any(Object)
      )
    })

    it('does nothing when no auth token', async () => {
      const authStore = useAuthStore()
      authStore.token = null
      
      const store = useTimeStore()
      await store.fetchEntries()

      expect(global.fetch).not.toHaveBeenCalled()
    })
  })
})
