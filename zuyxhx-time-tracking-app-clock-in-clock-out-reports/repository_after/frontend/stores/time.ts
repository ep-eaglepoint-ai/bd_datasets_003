import { defineStore } from 'pinia'
import type { TimeEntry, TimeEntryListResponse, StatusResponse, ClockInRequest, ClockOutRequest } from '~/types'

export const useTimeStore = defineStore('time', {
  state: () => ({
    entries: [] as TimeEntry[],
    activeEntry: null as TimeEntry | null,
    isClockedIn: false,
    total: 0,
    page: 1,
    perPage: 50,
    loading: false,
    error: null as string | null
  }),

  actions: {
    async fetchStatus() {
      const authStore = useAuthStore()
      if (!authStore.token) return

      const api = useApi()
      const { data: status, error } = await api.get<StatusResponse>('/time/status')
      
      if (status) {
        this.isClockedIn = status.is_clocked_in
        this.activeEntry = status.active_entry
      } else if (error) {
        this.error = error
      }
    },

    async clockIn(request?: ClockInRequest): Promise<{ success: boolean; error?: string }> {
      const api = useApi()
      this.loading = true

      const { data: entry, error } = await api.post<TimeEntry>('/time/clock-in', request || {})
      
      this.loading = false
      
      if (error) {
        return { success: false, error }
      }

      if (entry) {
        this.activeEntry = entry
        this.isClockedIn = true
      }
      return { success: true }
    },

    async clockOut(request?: ClockOutRequest): Promise<{ success: boolean; error?: string }> {
      const api = useApi()
      this.loading = true

      const { data, error } = await api.post<TimeEntry>('/time/clock-out', request || {})
      
      this.loading = false
      
      if (error) {
        return { success: false, error }
      }

      this.activeEntry = null
      this.isClockedIn = false
      await this.fetchEntries()
      return { success: true }
    },

    async fetchEntries(startDate?: string, endDate?: string) {
      const authStore = useAuthStore()
      if (!authStore.token) return

      const api = useApi()
      this.loading = true
      
      let endpoint = `/time?page=${this.page}&per_page=${this.perPage}`
      if (startDate) endpoint += `&start_date=${startDate}`
      if (endDate) endpoint += `&end_date=${endDate}`

      const { data, error } = await api.get<TimeEntryListResponse>(endpoint)
      
      this.loading = false
      
      if (data) {
        this.entries = data.entries
        this.total = data.total
      } else if (error) {
        this.error = error
      }
    }
  }
})
