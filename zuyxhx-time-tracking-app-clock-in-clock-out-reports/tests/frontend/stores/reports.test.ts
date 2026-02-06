/**
 * Tests for Reports Store (Pinia)
 * 
 * Covers reports functionality:
 * - Fetching summary data
 * - Date range filtering
 * - CSV export
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useReportsStore } from '../../../repository_after/frontend/stores/reports'
import { useAuthStore } from '../../../repository_after/frontend/stores/auth'

// Mock fetch globally
global.fetch = vi.fn()

// Mock URL.createObjectURL and related DOM APIs for CSV download
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
global.URL.revokeObjectURL = vi.fn()

const mockRuntimeConfig = {
  public: {
    apiBase: 'http://localhost:8000'
  }
}

vi.mock('#app', () => ({
  useRuntimeConfig: () => mockRuntimeConfig
}))

describe('Reports Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    
    // Set up authenticated state
    const authStore = useAuthStore()
    authStore.token = 'test-token'
  })

  describe('Initial State', () => {
    it('initializes with null summary', () => {
      const store = useReportsStore()
      expect(store.summary).toBeNull()
      expect(store.loading).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  describe('fetchSummary', () => {
    it('fetches report summary successfully', async () => {
      const store = useReportsStore()
      const mockSummary = {
        total_hours: 40.0,
        total_entries: 5,
        start_date: '2026-02-01',
        end_date: '2026-02-06',
        daily_summaries: [
          { date: '2026-02-06', total_hours: 8.0, entry_count: 1 },
          { date: '2026-02-05', total_hours: 8.0, entry_count: 1 }
        ],
        weekly_summaries: [
          {
            week_start: '2026-02-03',
            total_hours: 40.0,
            daily_breakdown: [
              { date: '2026-02-03', total_hours: 8.0, entry_count: 1 },
              { date: '2026-02-04', total_hours: 8.0, entry_count: 1 },
              { date: '2026-02-05', total_hours: 8.0, entry_count: 1 },
              { date: '2026-02-06', total_hours: 8.0, entry_count: 1 },
              { date: '2026-02-07', total_hours: 8.0, entry_count: 1 }
            ]
          }
        ]
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSummary
      })

      await store.fetchSummary()

      expect(store.summary).not.toBeNull()
      expect(store.summary?.total_hours).toBe(40.0)
      expect(store.summary?.total_entries).toBe(5)
      expect(store.summary?.daily_summaries).toHaveLength(2)
      expect(store.summary?.weekly_summaries).toHaveLength(1)
    })

    it('applies date range filters', async () => {
      const store = useReportsStore()

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total_hours: 16.0,
          total_entries: 2,
          start_date: '2026-02-01',
          end_date: '2026-02-02',
          daily_summaries: [],
          weekly_summaries: []
        })
      })

      await store.fetchSummary('2026-02-01', '2026-02-02')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('start_date=2026-02-01'),
        expect.any(Object)
      )
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('end_date=2026-02-02'),
        expect.any(Object)
      )
    })

    it('handles API errors', async () => {
      const store = useReportsStore()

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: 'Failed to fetch report' })
      })

      await store.fetchSummary()

      expect(store.error).toBe('Failed to fetch report')
      expect(store.summary).toBeNull()
    })

    it('does nothing when no auth token', async () => {
      const authStore = useAuthStore()
      authStore.token = null
      
      const store = useReportsStore()
      await store.fetchSummary()

      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('sets and clears loading state', async () => {
      const store = useReportsStore()

      let resolvePromise: any
      ;(global.fetch as any).mockReturnValueOnce(new Promise(resolve => {
        resolvePromise = resolve
      }))

      const promise = store.fetchSummary()
      
      expect(store.loading).toBe(true)
      
      resolvePromise({
        ok: true,
        json: async () => ({
          total_hours: 8,
          total_entries: 1,
          start_date: '2026-02-06',
          end_date: '2026-02-06',
          daily_summaries: [],
          weekly_summaries: []
        })
      })
      await promise
      
      expect(store.loading).toBe(false)
    })
  })

  describe('downloadCSV', () => {
    it('downloads CSV file successfully', async () => {
      const store = useReportsStore()
      const mockBlob = new Blob(['Date,Start,End,Hours'], { type: 'text/csv' })

      // Mock createElement and appendChild for the download link
      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
        remove: vi.fn()
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as any)
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as any)

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        blob: async () => mockBlob
      })

      await store.downloadCSV()

      expect(mockAnchor.click).toHaveBeenCalled()
      expect(mockAnchor.download).toBe('time_report.csv')
      expect(URL.createObjectURL).toHaveBeenCalledWith(mockBlob)
      expect(URL.revokeObjectURL).toHaveBeenCalled()
    })

    it('applies date filters to CSV download', async () => {
      const store = useReportsStore()
      const mockBlob = new Blob(['Date,Start,End,Hours'], { type: 'text/csv' })

      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
        remove: vi.fn()
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as any)
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as any)

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        blob: async () => mockBlob
      })

      await store.downloadCSV('2026-02-01', '2026-02-06')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('start_date=2026-02-01'),
        expect.any(Object)
      )
    })

    it('handles download errors', async () => {
      const store = useReportsStore()

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: 'Export failed' })
      })

      await store.downloadCSV()

      expect(store.error).toBe('Export failed')
    })

    it('does nothing when no auth token', async () => {
      const authStore = useAuthStore()
      authStore.token = null
      
      const store = useReportsStore()
      await store.downloadCSV()

      expect(global.fetch).not.toHaveBeenCalled()
    })
  })
})

describe('Report Summary Logic', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    
    const authStore = useAuthStore()
    authStore.token = 'test-token'
  })

  it('calculates total hours correctly from daily summaries', async () => {
    const store = useReportsStore()
    const mockSummary = {
      total_hours: 24.5,
      total_entries: 4,
      start_date: '2026-02-04',
      end_date: '2026-02-06',
      daily_summaries: [
        { date: '2026-02-04', total_hours: 8.0, entry_count: 1 },
        { date: '2026-02-05', total_hours: 8.5, entry_count: 2 },
        { date: '2026-02-06', total_hours: 8.0, entry_count: 1 }
      ],
      weekly_summaries: []
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSummary
    })

    await store.fetchSummary()

    // Verify total matches sum of daily summaries
    const dailyTotal = store.summary?.daily_summaries.reduce(
      (sum, day) => sum + day.total_hours, 0
    )
    expect(dailyTotal).toBe(store.summary?.total_hours)
  })

  it('handles empty report period', async () => {
    const store = useReportsStore()
    const mockSummary = {
      total_hours: 0,
      total_entries: 0,
      start_date: '2026-01-01',
      end_date: '2026-01-07',
      daily_summaries: [],
      weekly_summaries: []
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSummary
    })

    await store.fetchSummary('2026-01-01', '2026-01-07')

    expect(store.summary?.total_hours).toBe(0)
    expect(store.summary?.total_entries).toBe(0)
    expect(store.summary?.daily_summaries).toHaveLength(0)
  })

  it('weekly summary includes daily breakdown', async () => {
    const store = useReportsStore()
    const mockSummary = {
      total_hours: 40.0,
      total_entries: 5,
      start_date: '2026-02-03',
      end_date: '2026-02-07',
      daily_summaries: [],
      weekly_summaries: [
        {
          week_start: '2026-02-03',
          total_hours: 40.0,
          daily_breakdown: [
            { date: '2026-02-03', total_hours: 8.0, entry_count: 1 },
            { date: '2026-02-04', total_hours: 8.0, entry_count: 1 },
            { date: '2026-02-05', total_hours: 8.0, entry_count: 1 },
            { date: '2026-02-06', total_hours: 8.0, entry_count: 1 },
            { date: '2026-02-07', total_hours: 8.0, entry_count: 1 }
          ]
        }
      ]
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSummary
    })

    await store.fetchSummary()

    const weeklyTotal = store.summary?.weekly_summaries[0].daily_breakdown.reduce(
      (sum, day) => sum + day.total_hours, 0
    )
    expect(weeklyTotal).toBe(store.summary?.weekly_summaries[0].total_hours)
  })
})
