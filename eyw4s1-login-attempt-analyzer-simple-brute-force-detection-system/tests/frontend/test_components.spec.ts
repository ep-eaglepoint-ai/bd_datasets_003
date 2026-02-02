/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createApp } from 'vue'
import SummaryPanel from '../../../repository_after/frontend/src/components/SummaryPanel.vue'
import LoginAttemptsTable from '../../../repository_after/frontend/src/components/LoginAttemptsTable.vue'
import LoginTable from '../../../repository_after/frontend/src/components/LoginTable.vue'
import App from '../../../repository_after/frontend/src/App.vue'
import { loginAttemptApi, type LoginAttempt, type SuspiciousActivity } from '../../../repository_after/frontend/src/api'

// Mock the API module
vi.mock('../../../repository_after/frontend/src/api', () => ({
  loginAttemptApi: {
    getLoginAttempts: vi.fn(),
    getSuspiciousActivity: vi.fn(),
  },
}))

// Mock data
const mockLoginAttempts = [
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
]

const mockSuspiciousActivity = {
  suspicious_ips: ['192.168.1.100'],
  total_suspicious_ips: 1,
}

describe('SummaryPanel', () => {
  it('renders summary statistics correctly', () => {
    const wrapper = mount(SummaryPanel, {
      props: {
        totalAttempts: 10,
        suspiciousCount: 2,
        loading: false,
      },
    })

    expect(wrapper.find('.summary-panel h2').text()).toBe('Summary Statistics')
    expect(wrapper.find('.stat-value').text()).toBe('10')
    expect(wrapper.findAll('.stat-value')[1].text()).toBe('2')
    expect(wrapper.find('.stat-label').text()).toBe('Total Attempts')
    expect(wrapper.findAll('.stat-label')[1].text()).toBe('Suspicious IPs')
  })

  it('applies suspicious styling to suspicious count', () => {
    const wrapper = mount(SummaryPanel, {
      props: {
        totalAttempts: 10,
        suspiciousCount: 2,
        loading: false,
      },
    })

    const suspiciousStatValue = wrapper.findAll('.stat-value')[1]
    expect(suspiciousStatValue.classes()).toContain('suspicious')
  })

  it('handles zero values correctly', () => {
    const wrapper = mount(SummaryPanel, {
      props: {
        totalAttempts: 0,
        suspiciousCount: 0,
        loading: false,
      },
    })

    expect(wrapper.find('.stat-value').text()).toBe('0')
    expect(wrapper.findAll('.stat-value')[1].text()).toBe('0')
  })
})

describe('LoginAttemptsTable', () => {
  it('renders table with correct headers', () => {
    const wrapper = mount(LoginAttemptsTable, {
      props: {
        attempts: [],
        suspiciousIPs: [],
        loading: false,
        error: null,
      },
    })

    const headers = wrapper.findAll('th')
    expect(headers[0].text()).toBe('Username')
    expect(headers[1].text()).toBe('IP Address')
    expect(headers[2].text()).toBe('Timestamp')
    expect(headers[3].text()).toBe('Status')
  })

  it('displays loading state correctly', () => {
    const wrapper = mount(LoginAttemptsTable, {
      props: {
        attempts: [],
        suspiciousIPs: [],
        loading: true,
        error: null,
      },
    })

    expect(wrapper.find('.loading').text()).toBe('Loading login attempts...')
  })

  it('displays error state correctly', () => {
    const wrapper = mount(LoginAttemptsTable, {
      props: {
        attempts: [],
        suspiciousIPs: [],
        loading: false,
        error: 'Network error',
      },
    })

    expect(wrapper.find('.error').text()).toBe('Network error')
  })

  it('displays no data message when no attempts', () => {
    const wrapper = mount(LoginAttemptsTable, {
      props: {
        attempts: [],
        suspiciousIPs: [],
        loading: false,
        error: null,
      },
    })

    expect(wrapper.find('.empty').text()).toBe('No login attempts found')
  })

  it('renders login attempts correctly', () => {
    const wrapper = mount(LoginAttemptsTable, {
      props: {
        attempts: mockLoginAttempts,
        suspiciousIPs: [],
        loading: false,
        error: null,
      },
    })

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)

    // Check first row
    const firstRow = rows[0]
    expect(firstRow.find('td:nth-child(1)').text()).toBe('testuser')
    expect(firstRow.find('td:nth-child(2)').text()).toBe('192.168.1.100')
    expect(firstRow.find('td:nth-child(4)').text()).toContain('Failed')

    // Check second row
    const secondRow = rows[1]
    expect(secondRow.find('td:nth-child(1)').text()).toBe('admin')
    expect(secondRow.find('td:nth-child(2)').text()).toBe('192.168.1.200')
    expect(secondRow.find('td:nth-child(4)').text()).toContain('Success')
  })

  it('highlights suspicious IP addresses', () => {
    const wrapper = mount(LoginAttemptsTable, {
      props: {
        attempts: mockLoginAttempts,
        suspiciousIPs: ['192.168.1.100'],
        loading: false,
        error: null,
      },
    })

    const rows = wrapper.findAll('tbody tr')
    expect(rows[0].classes()).toContain('suspicious')
    expect(rows[1].classes()).not.toContain('suspicious')
  })

  it('applies correct status styling', () => {
    const wrapper = mount(LoginAttemptsTable, {
      props: {
        attempts: mockLoginAttempts,
        suspiciousIPs: [],
        loading: false,
        error: null,
      },
    })

    const statusElements = wrapper.findAll('tbody tr td:nth-child(4) span')
    expect(statusElements[0].classes()).toContain('failed')
    expect(statusElements[1].classes()).toContain('success')
  })
})

describe('LoginTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all login attempts correctly', async () => {
    // Mock API response
    vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue(mockLoginAttempts)

    const wrapper = mount(LoginTable)

    // Wait for API call to complete
    await new Promise(resolve => setTimeout(resolve, 0))

    // Check that table is rendered
    expect(wrapper.find('table').exists()).toBe(true)
    expect(wrapper.find('thead').exists()).toBe(true)
    expect(wrapper.find('tbody').exists()).toBe(true)

    // Check headers
    const headers = wrapper.findAll('th')
    expect(headers[0].text()).toBe('Username')
    expect(headers[1].text()).toBe('IP Address')
    expect(headers[2].text()).toBe('Timestamp')
    expect(headers[3].text()).toBe('Status')

    // Check data rows
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)

    // Check first attempt
    const firstRow = rows[0]
    expect(firstRow.find('td:nth-child(1)').text()).toBe('testuser')
    expect(firstRow.find('td:nth-child(2)').text()).toBe('192.168.1.100')
    expect(firstRow.find('td:nth-child(3)').text()).toContain('2024')
    expect(firstRow.find('td:nth-child(4)').text()).toBe('Failed')

    // Check second attempt
    const secondRow = rows[1]
    expect(secondRow.find('td:nth-child(1)').text()).toBe('admin')
    expect(secondRow.find('td:nth-child(2)').text()).toBe('192.168.1.200')
    expect(secondRow.find('td:nth-child(3)').text()).toContain('2024')
    expect(secondRow.find('td:nth-child(4)').text()).toBe('Success')
  })

  it('formats timestamp correctly', async () => {
    vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue(mockLoginAttempts)

    const wrapper = mount(LoginTable)
    await new Promise(resolve => setTimeout(resolve, 0))

    // Get the component instance to access methods
    const component = wrapper.vm as any

    // Test timestamp formatting
    const formattedTimestamp = component.formatTimestamp('2024-02-02T12:00:00Z')
    expect(formattedTimestamp).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/) // MM/DD/YYYY format
    expect(formattedTimestamp).toMatch(/\d{1,2}:\d{2}:\d{2}/) // HH:MM:SS format
  })

  it('formats status correctly', async () => {
    vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue(mockLoginAttempts)

    const wrapper = mount(LoginTable)
    await new Promise(resolve => setTimeout(resolve, 0))

    // Get the component instance to access methods
    const component = wrapper.vm as any

    // Test status formatting
    expect(component.formatStatus(true)).toBe('Success')
    expect(component.formatStatus(false)).toBe('Failed')
  })

  it('handles empty list correctly', async () => {
    // Mock empty response
    vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue([])

    const wrapper = mount(LoginTable)
    await new Promise(resolve => setTimeout(resolve, 0))

    // Should show empty message
    expect(wrapper.find('.empty').text()).toBe('No login attempts found')
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('handles loading state correctly', async () => {
    // Mock delayed response
    vi.mocked(loginAttemptApi.getLoginAttempts).mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(mockLoginAttempts), 100))
    )

    const wrapper = mount(LoginTable)

    // Initially should show loading
    expect(wrapper.find('.loading').text()).toBe('Loading login attempts...')

    // Wait for API call to complete
    await new Promise(resolve => setTimeout(resolve, 150))

    // Should show data, not loading
    expect(wrapper.find('.loading').exists()).toBe(false)
    expect(wrapper.find('table').exists()).toBe(true)
  })

  it('handles API errors correctly', async () => {
    // Mock API error
    const errorMessage = 'Network error'
    vi.mocked(loginAttemptApi.getLoginAttempts).mockRejectedValue(new Error(errorMessage))

    const wrapper = mount(LoginTable)
    await new Promise(resolve => setTimeout(resolve, 0))

    // Should show error message
    expect(wrapper.find('.error').text()).toBe(errorMessage)
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('fetches data from /api/login_attempts/ using Axios', async () => {
    const wrapper = mount(LoginTable)
    await new Promise(resolve => setTimeout(resolve, 0))

    // Verify API call was made
    expect(loginAttemptApi.getLoginAttempts).toHaveBeenCalledTimes(1)
  })
})

describe('App Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders dashboard layout with table and panel', async () => {
    // Mock successful API responses
    vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue(mockLoginAttempts)
    vi.mocked(loginAttemptApi.getSuspiciousActivity).mockResolvedValue(mockSuspiciousActivity)

    const wrapper = mount(App)

    // Wait for API calls to complete
    await new Promise(resolve => setTimeout(resolve, 0))

    // Check that both components are rendered
    expect(wrapper.findComponent(SummaryPanel).exists()).toBe(true)
    expect(wrapper.findComponent(LoginAttemptsTable).exists()).toBe(true)

    // Check header
    expect(wrapper.find('h1').text()).toBe('Login Attempt Analyzer')
  })

  it('mocks Axios calls and verifies data binding', async () => {
    // Mock API responses
    vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue(mockLoginAttempts)
    vi.mocked(loginAttemptApi.getSuspiciousActivity).mockResolvedValue(mockSuspiciousActivity)

    const wrapper = mount(App)

    // Wait for API calls to complete
    await new Promise(resolve => setTimeout(resolve, 0))

    // Verify API calls were made
    expect(loginAttemptApi.getLoginAttempts).toHaveBeenCalledTimes(1)
    expect(loginAttemptApi.getSuspiciousActivity).toHaveBeenCalledTimes(1)

    // Verify data binding to SummaryPanel
    const summaryPanel = wrapper.findComponent(SummaryPanel)
    expect(summaryPanel.props('totalAttempts')).toBe(2)
    expect(summaryPanel.props('suspiciousCount')).toBe(1)

    // Verify data binding to LoginAttemptsTable
    const table = wrapper.findComponent(LoginAttemptsTable)
    expect(table.props('attempts')).toEqual(mockLoginAttempts)
    expect(table.props('suspiciousIPs')).toEqual(['192.168.1.100'])
  })
})
  it('shows loading states during API calls', async () => {
    // Mock delayed API responses
    vi.mocked(loginAttemptApi.getLoginAttempts).mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(mockLoginAttempts), 100))
    )
    vi.mocked(loginAttemptApi.getSuspiciousActivity).mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(mockSuspiciousActivity), 100))
    )

    const wrapper = mount(App)

    // Initially should show loading states
    expect(wrapper.findComponent(SummaryPanel).props('loading')).toBe(true)
    expect(wrapper.findComponent(LoginAttemptsTable).props('loading')).toBe(true)

    // Wait for API calls to complete
    await new Promise(resolve => setTimeout(resolve, 150))

    // Loading states should be false
    expect(wrapper.findComponent(SummaryPanel).props('loading')).toBe(false)
    expect(wrapper.findComponent(LoginAttemptsTable).props('loading')).toBe(false)
  })
})
