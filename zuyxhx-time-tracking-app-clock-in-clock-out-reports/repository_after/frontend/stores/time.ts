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

      try {
        const response = await fetch(`${useRuntimeConfig().public.apiBase}/time/status`, {
          headers: { 'Authorization': `Bearer ${authStore.token}` }
        })

        if (response.ok) {
          const status: StatusResponse = await response.json()
          this.isClockedIn = status.is_clocked_in
          this.activeEntry = status.active_entry
        }
      } catch {
        this.error = 'Failed to fetch status'
      }
    },

    async clockIn(request?: ClockInRequest): Promise<{ success: boolean; error?: string }> {
      const authStore = useAuthStore()
      this.loading = true

      try {
        const response = await fetch(`${useRuntimeConfig().public.apiBase}/time/clock-in`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authStore.token}`
          },
          body: JSON.stringify(request || {})
        })

        if (!response.ok) {
          const err = await response.json()
          return { success: false, error: err.detail }
        }

        const entry: TimeEntry = await response.json()
        this.activeEntry = entry
        this.isClockedIn = true
        return { success: true }
      } catch {
        return { success: false, error: 'Network error' }
      } finally {
        this.loading = false
      }
    },

    async clockOut(request?: ClockOutRequest): Promise<{ success: boolean; error?: string }> {
      const authStore = useAuthStore()
      this.loading = true

      try {
        const response = await fetch(`${useRuntimeConfig().public.apiBase}/time/clock-out`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authStore.token}`
          },
          body: JSON.stringify(request || {})
        })

        if (!response.ok) {
          const err = await response.json()
          return { success: false, error: err.detail }
        }

        this.activeEntry = null
        this.isClockedIn = false
        await this.fetchEntries()
        return { success: true }
      } catch {
        return { success: false, error: 'Network error' }
      } finally {
        this.loading = false
      }
    },

    async fetchEntries(startDate?: string, endDate?: string) {
      const authStore = useAuthStore()
      if (!authStore.token) return

      this.loading = true
      try {
        let url = `${useRuntimeConfig().public.apiBase}/time?page=${this.page}&per_page=${this.perPage}`
        if (startDate) url += `&start_date=${startDate}`
        if (endDate) url += `&end_date=${endDate}`

        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${authStore.token}` }
        })

        if (response.ok) {
          const data: TimeEntryListResponse = await response.json()
          this.entries = data.entries
          this.total = data.total
        }
      } catch {
        this.error = 'Failed to fetch entries'
      } finally {
        this.loading = false
      }
    }
  }
})
