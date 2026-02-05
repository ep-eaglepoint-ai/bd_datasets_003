import { defineStore } from 'pinia'
import type { ReportSummary } from '~/types'

export const useReportsStore = defineStore('reports', {
  state: () => ({
    summary: null as ReportSummary | null,
    loading: false,
    error: null as string | null
  }),

  actions: {
    async fetchSummary(startDate?: string, endDate?: string) {
      const authStore = useAuthStore()
      if (!authStore.token) return

      const api = useApi()
      this.loading = true
      
      let endpoint = '/reports/summary'
      const params = []
      if (startDate) params.push(`start_date=${startDate}`)
      if (endDate) params.push(`end_date=${endDate}`)
      if (params.length) endpoint += `?${params.join('&')}`

      const { data, error } = await api.get<ReportSummary>(endpoint)
      
      this.loading = false
      
      if (data) {
        this.summary = data
      } else if (error) {
        this.error = error
      }
    },

    async downloadCSV(startDate?: string, endDate?: string) {
      const authStore = useAuthStore()
      if (!authStore.token) return

      const api = useApi()
      
      let endpoint = '/reports/csv'
      const params = []
      if (startDate) params.push(`start_date=${startDate}`)
      if (endDate) params.push(`end_date=${endDate}`)
      if (params.length) endpoint += `?${params.join('&')}`

      const { data: blob, error } = await api.getBlob(endpoint)

      if (error) {
        this.error = error
        return
      }

      if (blob) {
        const downloadUrl = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = downloadUrl
        a.download = 'time_report.csv'
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(downloadUrl)
      }
    }
  }
})
