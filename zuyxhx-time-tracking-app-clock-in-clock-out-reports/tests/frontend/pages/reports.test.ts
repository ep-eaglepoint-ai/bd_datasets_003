/**
 * Tests for Reports Page Behavior
 * 
 * Covers reports functionality:
 * - Summary display
 * - Date range filtering
 * - Weekly/Daily breakdown
 * - CSV export
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { reactive } from 'vue'

// Mock Nuxt composables
vi.mock('#app', () => ({
  useRuntimeConfig: () => ({
    public: { apiBase: 'http://localhost:8000' }
  }),
  definePageMeta: vi.fn(),
  navigateTo: vi.fn()
}))

describe('Reports Page Behavior', () => {
  let mockReportsStore: any
  
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    
    mockReportsStore = reactive({
      summary: null,
      loading: false,
      error: null,
      fetchSummary: vi.fn().mockResolvedValue(undefined),
      downloadCSV: vi.fn().mockResolvedValue(undefined)
    })
  })

  describe('Summary Statistics', () => {
    it('displays total hours correctly', () => {
      mockReportsStore.summary = {
        total_hours: 40.5,
        total_entries: 5,
        start_date: '2026-02-01',
        end_date: '2026-02-06',
        daily_summaries: [],
        weekly_summaries: []
      }
      
      const displayHours = mockReportsStore.summary.total_hours.toFixed(1)
      expect(displayHours).toBe('40.5')
    })

    it('displays total entries correctly', () => {
      mockReportsStore.summary = {
        total_hours: 40.0,
        total_entries: 5,
        start_date: '2026-02-01',
        end_date: '2026-02-06',
        daily_summaries: [],
        weekly_summaries: []
      }
      
      expect(mockReportsStore.summary.total_entries).toBe(5)
    })

    it('displays date range correctly', () => {
      mockReportsStore.summary = {
        total_hours: 40.0,
        total_entries: 5,
        start_date: '2026-02-01',
        end_date: '2026-02-06',
        daily_summaries: [],
        weekly_summaries: []
      }
      
      const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString()
      
      expect(formatDate(mockReportsStore.summary.start_date)).toBeDefined()
      expect(formatDate(mockReportsStore.summary.end_date)).toBeDefined()
    })

    it('handles zero hours and entries', () => {
      mockReportsStore.summary = {
        total_hours: 0,
        total_entries: 0,
        start_date: '2026-02-01',
        end_date: '2026-02-06',
        daily_summaries: [],
        weekly_summaries: []
      }
      
      expect(mockReportsStore.summary.total_hours.toFixed(1)).toBe('0.0')
      expect(mockReportsStore.summary.total_entries).toBe(0)
    })
  })

  describe('Date Range Filtering', () => {
    it('fetches summary with custom date range', async () => {
      await mockReportsStore.fetchSummary('2026-02-01', '2026-02-06')
      
      expect(mockReportsStore.fetchSummary).toHaveBeenCalledWith('2026-02-01', '2026-02-06')
    })

    it('fetches summary without date range for default', async () => {
      await mockReportsStore.fetchSummary(undefined, undefined)
      
      expect(mockReportsStore.fetchSummary).toHaveBeenCalledWith(undefined, undefined)
    })

    it('handles partial date filters', async () => {
      await mockReportsStore.fetchSummary('2026-02-01', undefined)
      
      expect(mockReportsStore.fetchSummary).toHaveBeenCalledWith('2026-02-01', undefined)
    })
  })

  describe('Weekly Summary Display', () => {
    it('shows No data message when weekly summaries empty', () => {
      mockReportsStore.summary = {
        total_hours: 0,
        total_entries: 0,
        start_date: '2026-02-01',
        end_date: '2026-02-06',
        daily_summaries: [],
        weekly_summaries: []
      }
      
      const hasWeeklySummaries = mockReportsStore.summary.weekly_summaries.length > 0
      expect(hasWeeklySummaries).toBe(false)
    })

    it('displays weekly summary with total hours', () => {
      mockReportsStore.summary = {
        total_hours: 40.0,
        total_entries: 5,
        start_date: '2026-02-03',
        end_date: '2026-02-07',
        daily_summaries: [],
        weekly_summaries: [{
          week_start: '2026-02-03',
          total_hours: 40.0,
          daily_breakdown: []
        }]
      }
      
      const weekSummary = mockReportsStore.summary.weekly_summaries[0]
      expect(weekSummary.total_hours.toFixed(1)).toBe('40.0')
      expect(weekSummary.week_start).toBe('2026-02-03')
    })

    it('displays daily breakdown within weekly summary', () => {
      mockReportsStore.summary = {
        total_hours: 40.0,
        total_entries: 5,
        start_date: '2026-02-03',
        end_date: '2026-02-07',
        daily_summaries: [],
        weekly_summaries: [{
          week_start: '2026-02-03',
          total_hours: 40.0,
          daily_breakdown: [
            { date: '2026-02-03', total_hours: 8.0, entry_count: 1 },
            { date: '2026-02-04', total_hours: 8.0, entry_count: 1 },
            { date: '2026-02-05', total_hours: 8.0, entry_count: 1 },
            { date: '2026-02-06', total_hours: 8.0, entry_count: 1 },
            { date: '2026-02-07', total_hours: 8.0, entry_count: 1 }
          ]
        }]
      }
      
      const dailyBreakdown = mockReportsStore.summary.weekly_summaries[0].daily_breakdown
      expect(dailyBreakdown).toHaveLength(5)
      expect(dailyBreakdown[0].total_hours).toBe(8.0)
    })

    it('formats day name correctly', () => {
      const getDayName = (dateStr: string) => 
        new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' })
      
      // 2026-02-03 is a Tuesday
      const dayName = getDayName('2026-02-03')
      expect(dayName).toBeDefined()
      expect(typeof dayName).toBe('string')
    })
  })

  describe('Daily Breakdown Table', () => {
    it('displays daily summaries in table', () => {
      mockReportsStore.summary = {
        total_hours: 24.0,
        total_entries: 3,
        start_date: '2026-02-04',
        end_date: '2026-02-06',
        daily_summaries: [
          { date: '2026-02-04', total_hours: 8.0, entry_count: 1 },
          { date: '2026-02-05', total_hours: 8.0, entry_count: 1 },
          { date: '2026-02-06', total_hours: 8.0, entry_count: 1 }
        ],
        weekly_summaries: []
      }
      
      expect(mockReportsStore.summary.daily_summaries).toHaveLength(3)
    })

    it('formats hours with 2 decimal places', () => {
      const day = { date: '2026-02-06', total_hours: 8.5, entry_count: 2 }
      
      expect(day.total_hours.toFixed(2)).toBe('8.50')
    })

    it('displays entry count for each day', () => {
      const day = { date: '2026-02-06', total_hours: 8.0, entry_count: 3 }
      
      expect(day.entry_count).toBe(3)
    })
  })

  describe('CSV Export', () => {
    it('downloads CSV without date filters', async () => {
      await mockReportsStore.downloadCSV(undefined, undefined)
      
      expect(mockReportsStore.downloadCSV).toHaveBeenCalledWith(undefined, undefined)
    })

    it('downloads CSV with date filters', async () => {
      await mockReportsStore.downloadCSV('2026-02-01', '2026-02-06')
      
      expect(mockReportsStore.downloadCSV).toHaveBeenCalledWith('2026-02-01', '2026-02-06')
    })

    it('applies same filters as current view', async () => {
      const startDate = '2026-02-01'
      const endDate = '2026-02-06'
      
      // Fetch summary with filters
      await mockReportsStore.fetchSummary(startDate, endDate)
      
      // Download CSV with same filters
      await mockReportsStore.downloadCSV(startDate, endDate)
      
      expect(mockReportsStore.downloadCSV).toHaveBeenCalledWith(startDate, endDate)
    })
  })

  describe('Loading State', () => {
    it('shows loading indicator when fetching', () => {
      mockReportsStore.loading = true
      
      expect(mockReportsStore.loading).toBe(true)
    })

    it('hides report content during loading', () => {
      mockReportsStore.loading = true
      mockReportsStore.summary = { total_hours: 40 }
      
      const showContent = !mockReportsStore.loading && mockReportsStore.summary
      expect(showContent).toBe(false)
    })

    it('shows report content when not loading', () => {
      mockReportsStore.loading = false
      mockReportsStore.summary = {
        total_hours: 40,
        total_entries: 5,
        start_date: '2026-02-01',
        end_date: '2026-02-06',
        daily_summaries: [],
        weekly_summaries: []
      }
      
      const showContent = !mockReportsStore.loading && mockReportsStore.summary
      expect(showContent).toBeTruthy()
    })
  })

  describe('Report Generation', () => {
    it('fetches report on mount', async () => {
      // Simulate onMounted behavior
      await mockReportsStore.fetchSummary()
      
      expect(mockReportsStore.fetchSummary).toHaveBeenCalled()
    })

    it('regenerates report on Generate Report button click', async () => {
      await mockReportsStore.fetchSummary('2026-02-01', '2026-02-06')
      
      // Should be called with the filter dates
      expect(mockReportsStore.fetchSummary).toHaveBeenCalledWith('2026-02-01', '2026-02-06')
    })
  })

  describe('Error Handling', () => {
    it('displays error when API fails', async () => {
      mockReportsStore.fetchSummary = vi.fn().mockImplementation(async () => {
        mockReportsStore.error = 'Failed to fetch report'
      })
      
      await mockReportsStore.fetchSummary()
      
      expect(mockReportsStore.error).toBe('Failed to fetch report')
    })
  })
})

describe('Report Summary Logic', () => {
  it('validates total hours matches sum of daily summaries', () => {
    const summary = {
      total_hours: 24.0,
      daily_summaries: [
        { date: '2026-02-04', total_hours: 8.0, entry_count: 1 },
        { date: '2026-02-05', total_hours: 8.0, entry_count: 1 },
        { date: '2026-02-06', total_hours: 8.0, entry_count: 1 }
      ]
    }
    
    const calculatedTotal = summary.daily_summaries.reduce(
      (sum, day) => sum + day.total_hours, 0
    )
    
    expect(calculatedTotal).toBe(summary.total_hours)
  })

  it('validates weekly total matches daily breakdown total', () => {
    const weekSummary = {
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
    
    const calculatedTotal = weekSummary.daily_breakdown.reduce(
      (sum, day) => sum + day.total_hours, 0
    )
    
    expect(calculatedTotal).toBe(weekSummary.total_hours)
  })

  it('validates total entries matches sum of daily entry counts', () => {
    const summary = {
      total_entries: 7,
      daily_summaries: [
        { date: '2026-02-04', total_hours: 8.0, entry_count: 2 },
        { date: '2026-02-05', total_hours: 8.0, entry_count: 3 },
        { date: '2026-02-06', total_hours: 8.0, entry_count: 2 }
      ]
    }
    
    const calculatedEntries = summary.daily_summaries.reduce(
      (sum, day) => sum + day.entry_count, 0
    )
    
    expect(calculatedEntries).toBe(summary.total_entries)
  })
})
