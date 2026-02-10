/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LoginTable from '../../repository_after/frontend/src/components/LoginTable.vue'
import { loginAttemptApi, type LoginAttempt, type SuspiciousActivity } from '../../repository_after/frontend/src/api'

// Mock the API module
vi.mock('../../repository_after/frontend/src/api', () => ({
  loginAttemptApi: {
    getLoginAttempts: vi.fn(),
    getSuspiciousActivity: vi.fn(),
  },
}))

// Mock data
const mockLoginAttempts: LoginAttempt[] = [
  {
    id: 1,
    username: 'testuser',
    ip_address: '192.168.1.100',
    timestamp: '2024-02-02T12:00:00Z',
    success: false,
  },
  {
    id: 2,
    username: 'admin',
    ip_address: '192.168.1.200',
    timestamp: '2024-02-02T12:05:00Z',
    success: true,
  },
  {
    id: 3,
    username: 'attacker',
    ip_address: '192.168.1.100',
    timestamp: '2024-02-02T12:10:00Z',
    success: false,
  },
]

const mockSuspiciousActivity: SuspiciousActivity = {
  suspicious_ips: ['192.168.1.100'],
  total_suspicious_ips: 1,
}

const mockEmptySuspiciousActivity: SuspiciousActivity = {
  suspicious_ips: [],
  total_suspicious_ips: 0,
}

describe('LoginTable Enhanced', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Suspicious IP Highlighting', () => {
    it('highlights rows with suspicious IPs correctly', async () => {
      // Mock API responses
      vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue(mockLoginAttempts)
      vi.mocked(loginAttemptApi.getSuspiciousActivity).mockResolvedValue(mockSuspiciousActivity)

      const wrapper = mount(LoginTable)

      // Wait for API calls to complete
      await new Promise(resolve => setTimeout(resolve, 0))

      // Get all table rows
      const rows = wrapper.findAll('tbody tr')

      // Check that rows with suspicious IPs are highlighted
      expect(rows[0].classes()).toContain('suspicious') // 192.168.1.100
      expect(rows[1].classes()).not.toContain('suspicious') // 192.168.1.200
      expect(rows[2].classes()).toContain('suspicious') // 192.168.1.100
    })

    it('does not highlight any rows when no suspicious IPs', async () => {
      // Mock API responses with no suspicious IPs
      vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue(mockLoginAttempts)
      vi.mocked(loginAttemptApi.getSuspiciousActivity).mockResolvedValue(mockEmptySuspiciousActivity)

      const wrapper = mount(LoginTable)

      // Wait for API calls to complete
      await new Promise(resolve => setTimeout(resolve, 0))

      // Get all table rows
      const rows = wrapper.findAll('tbody tr')

      // Check that no rows are highlighted
      rows.forEach(row => {
        expect(row.classes()).not.toContain('suspicious')
      })
    })

    it('updates highlighting when suspicious activity data changes', async () => {
      // Start with no suspicious IPs
      vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue(mockLoginAttempts)
      vi.mocked(loginAttemptApi.getSuspiciousActivity).mockResolvedValue(mockEmptySuspiciousActivity)

      const wrapper = mount(LoginTable)
      await new Promise(resolve => setTimeout(resolve, 0))

      // Initially no rows should be highlighted
      let rows = wrapper.findAll('tbody tr')
      rows.forEach(row => {
        expect(row.classes()).not.toContain('suspicious')
      })

      // Mock new suspicious activity
      vi.mocked(loginAttemptApi.getSuspiciousActivity).mockResolvedValue(mockSuspiciousActivity)

      // Trigger data refresh
      await wrapper.vm.fetchData()
      await new Promise(resolve => setTimeout(resolve, 0))

      // Now rows with suspicious IPs should be highlighted
      rows = wrapper.findAll('tbody tr')
      expect(rows[0].classes()).toContain('suspicious') // 192.168.1.100
      expect(rows[1].classes()).not.toContain('suspicious') // 192.168.1.200
    })
  })

  describe('Summary Panel Statistics', () => {
    it('displays correct total attempts count', async () => {
      vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue(mockLoginAttempts)
      vi.mocked(loginAttemptApi.getSuspiciousActivity).mockResolvedValue(mockSuspiciousActivity)

      const wrapper = mount(LoginTable)
      await new Promise(resolve => setTimeout(resolve, 0))

      // Check total attempts
      const totalAttemptsElement = wrapper.find('.stat-value')
      expect(totalAttemptsElement.text()).toBe('3')
    })

    it('displays correct failed attempts count', async () => {
      vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue(mockLoginAttempts)
      vi.mocked(loginAttemptApi.getSuspiciousActivity).mockResolvedValue(mockSuspiciousActivity)

      const wrapper = mount(LoginTable)
      await new Promise(resolve => setTimeout(resolve, 0))

      // Check failed attempts (2 out of 3 are failed)
      const failedAttemptsElement = wrapper.findAll('.stat-value')[1]
      expect(failedAttemptsElement.text()).toBe('2')
      expect(failedAttemptsElement.classes()).toContain('failed')
    })

    it('displays correct flagged IPs count', async () => {
      vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue(mockLoginAttempts)
      vi.mocked(loginAttemptApi.getSuspiciousActivity).mockResolvedValue(mockSuspiciousActivity)

      const wrapper = mount(LoginTable)
      await new Promise(resolve => setTimeout(resolve, 0))

      // Check flagged IPs
      const flaggedIPsElement = wrapper.findAll('.stat-value')[2]
      expect(flaggedIPsElement.text()).toBe('1')
      expect(flaggedIPsElement.classes()).toContain('suspicious')
    })

    it('matches summary stats with API data exactly', async () => {
      vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue(mockLoginAttempts)
      vi.mocked(loginAttemptApi.getSuspiciousActivity).mockResolvedValue(mockSuspiciousActivity)

      const wrapper = mount(LoginTable)
      await new Promise(resolve => setTimeout(resolve, 0))

      // Get component instance to access computed properties
      const component = wrapper.vm as any

      // Verify computed properties match API data
      expect(component.totalAttempts).toBe(3) // 3 attempts in mock data
      expect(component.failedAttempts).toBe(2) // 2 failed attempts
      expect(component.flaggedIPs).toBe(1) // 1 flagged IP
    })

    it('handles zero statistics correctly', async () => {
      vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue([])
      vi.mocked(loginAttemptApi.getSuspiciousActivity).mockResolvedValue(mockEmptySuspiciousActivity)

      const wrapper = mount(LoginTable)
      await new Promise(resolve => setTimeout(resolve, 0))

      // Check all stats are zero
      const statValues = wrapper.findAll('.stat-value')
      expect(statValues[0].text()).toBe('0') // Total attempts
      expect(statValues[1].text()).toBe('0') // Failed attempts
      expect(statValues[2].text()).toBe('0') // Flagged IPs
    })
  })

  describe('Reactive Updates', () => {
    it('updates summary stats when API data changes', async () => {
      // Start with initial data
      vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue(mockLoginAttempts)
      vi.mocked(loginAttemptApi.getSuspiciousActivity).mockResolvedValue(mockSuspiciousActivity)

      const wrapper = mount(LoginTable)
      await new Promise(resolve => setTimeout(resolve, 0))

      // Initial stats
      let statValues = wrapper.findAll('.stat-value')
      expect(statValues[0].text()).toBe('3') // Total attempts

      // Mock new data with more attempts
      const newAttempts = [
        ...mockLoginAttempts,
        {
          id: 4,
          username: 'newuser',
          ip_address: '192.168.1.300',
          timestamp: '2024-02-02T12:15:00Z',
          success: true,
        },
      ]

      vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue(newAttempts)

      // Trigger data refresh
      await wrapper.vm.fetchData()
      await new Promise(resolve => setTimeout(resolve, 0))

      // Check updated stats
      statValues = wrapper.findAll('.stat-value')
      expect(statValues[0].text()).toBe('4') // Updated total attempts
    })

    it('updates failed attempts count when success status changes', async () => {
      // Start with initial data
      vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue(mockLoginAttempts)
      vi.mocked(loginAttemptApi.getSuspiciousActivity).mockResolvedValue(mockSuspiciousActivity)

      const wrapper = mount(LoginTable)
      await new Promise(resolve => setTimeout(resolve, 0))

      // Initial failed attempts count
      let failedAttemptsElement = wrapper.findAll('.stat-value')[1]
      expect(failedAttemptsElement.text()).toBe('2') // 2 failed attempts

      // Mock new data with different success/failure pattern
      const newAttempts = mockLoginAttempts.map(attempt => ({
        ...attempt,
        success: true, // Make all attempts successful
      }))

      vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue(newAttempts)

      // Trigger data refresh
      await wrapper.vm.fetchData()
      await new Promise(resolve => setTimeout(resolve, 0))

      // Check updated failed attempts count
      failedAttemptsElement = wrapper.findAll('.stat-value')[1]
      expect(failedAttemptsElement.text()).toBe('0') // 0 failed attempts now
    })

    it('updates flagged IPs count when suspicious activity changes', async () => {
      // Start with initial data
      vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue(mockLoginAttempts)
      vi.mocked(loginAttemptApi.getSuspiciousActivity).mockResolvedValue(mockSuspiciousActivity)

      const wrapper = mount(LoginTable)
      await new Promise(resolve => setTimeout(resolve, 0))

      // Initial flagged IPs count
      let flaggedIPsElement = wrapper.findAll('.stat-value')[2]
      expect(flaggedIPsElement.text()).toBe('1') // 1 flagged IP

      // Mock new suspicious activity with more flagged IPs
      const newSuspiciousActivity: SuspiciousActivity = {
        suspicious_ips: ['192.168.1.100', '192.168.1.200'],
        total_suspicious_ips: 2,
      }

      vi.mocked(loginAttemptApi.getSuspiciousActivity).mockResolvedValue(newSuspiciousActivity)

      // Trigger data refresh
      await wrapper.vm.fetchData()
      await new Promise(resolve => setTimeout(resolve, 0))

      // Check updated flagged IPs count
      flaggedIPsElement = wrapper.findAll('.stat-value')[2]
      expect(flaggedIPsElement.text()).toBe('2') // 2 flagged IPs now
    })

    it('reactively updates table highlighting when suspicious IPs change', async () => {
      // Start with no suspicious IPs
      vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue(mockLoginAttempts)
      vi.mocked(loginAttemptApi.getSuspiciousActivity).mockResolvedValue(mockEmptySuspiciousActivity)

      const wrapper = mount(LoginTable)
      await new Promise(resolve => setTimeout(resolve, 0))

      // Initially no rows should be highlighted
      let rows = wrapper.findAll('tbody tr')
      rows.forEach(row => {
        expect(row.classes()).not.toContain('suspicious')
      })

      // Mock new suspicious activity
      vi.mocked(loginAttemptApi.getSuspiciousActivity).mockResolvedValue(mockSuspiciousActivity)

      // Trigger data refresh
      await wrapper.vm.fetchData()
      await new Promise(resolve => setTimeout(resolve, 0))

      // Now rows with suspicious IPs should be highlighted
      rows = wrapper.findAll('tbody tr')
      expect(rows[0].classes()).toContain('suspicious') // 192.168.1.100
      expect(rows[1].classes()).not.toContain('suspicious') // 192.168.1.200
      expect(rows[2].classes()).toContain('suspicious') // 192.168.1.100
    })
  })

  describe('Integration Tests', () => {
    it('fetches both login attempts and suspicious activity in parallel', async () => {
      vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue(mockLoginAttempts)
      vi.mocked(loginAttemptApi.getSuspiciousActivity).mockResolvedValue(mockSuspiciousActivity)

      const wrapper = mount(LoginTable)
      await new Promise(resolve => setTimeout(resolve, 0))

      // Verify both API calls were made
      expect(loginAttemptApi.getLoginAttempts).toHaveBeenCalledTimes(1)
      expect(loginAttemptApi.getSuspiciousActivity).toHaveBeenCalledTimes(1)
    })

    it('displays summary panel with correct structure', async () => {
      vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue(mockLoginAttempts)
      vi.mocked(loginAttemptApi.getSuspiciousActivity).mockResolvedValue(mockSuspiciousActivity)

      const wrapper = mount(LoginTable)
      await new Promise(resolve => setTimeout(resolve, 0))

      // Check summary panel structure
      expect(wrapper.find('.summary-panel').exists()).toBe(true)
      expect(wrapper.find('.summary-panel h3').text()).toBe('Summary Statistics')
      expect(wrapper.findAll('.stat-item')).toHaveLength(3)
      expect(wrapper.findAll('.stat-label')[0].text()).toBe('Total Attempts')
      expect(wrapper.findAll('.stat-label')[1].text()).toBe('Failed Attempts')
      expect(wrapper.findAll('.stat-label')[2].text()).toBe('Flagged IPs')
    })

    it('applies correct styling to summary statistics', async () => {
      vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue(mockLoginAttempts)
      vi.mocked(loginAttemptApi.getSuspiciousActivity).mockResolvedValue(mockSuspiciousActivity)

      const wrapper = mount(LoginTable)
      await new Promise(resolve => setTimeout(resolve, 0))

      // Check styling classes
      const statValues = wrapper.findAll('.stat-value')
      expect(statValues[0].classes()).toContain('stat-value') // Total attempts (blue)
      expect(statValues[1].classes()).toContain('failed') // Failed attempts (red)
      expect(statValues[2].classes()).toContain('suspicious') // Flagged IPs (yellow)
    })
  })
})
