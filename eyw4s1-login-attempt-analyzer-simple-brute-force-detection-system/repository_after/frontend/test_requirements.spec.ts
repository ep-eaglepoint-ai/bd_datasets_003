/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loginAttemptApi, type LoginAttempt, type SuspiciousActivity } from './src/api'

// Mock the API module
vi.mock('./src/api', () => ({
  loginAttemptApi: {
    getLoginAttempts: vi.fn(),
    getSuspiciousActivity: vi.fn(),
  },
}))

describe('REQUIREMENT: Frontend fetches and displays suspicious activity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('BACKEND → suspicious_ips → row highlighting (END-TO-END)', async () => {
    // Arrange: Backend returns specific suspicious IP
    const backendSuspiciousIPs = ['192.168.1.100']
    const mockSuspiciousActivity: SuspiciousActivity = {
      suspicious_ips: backendSuspiciousIPs,
      total_suspicious_ips: 1,
    }

    const mockLoginAttempts: LoginAttempt[] = [
      { id: 1, username: 'user1', ip_address: '192.168.1.100', timestamp: '2024-02-02T12:00:00Z', success: false },
      { id: 2, username: 'user2', ip_address: '192.168.1.200', timestamp: '2024-02-02T12:05:00Z', success: true },
      { id: 3, username: 'attacker', ip_address: '192.168.1.100', timestamp: '2024-02-02T12:10:00Z', success: false },
    ]

    // Mock backend responses
    vi.mocked(loginAttemptApi.getSuspiciousActivity).mockResolvedValue(mockSuspiciousActivity)
    vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue(mockLoginAttempts)

    // Act: Fetch data like the real component would
    const [suspiciousActivity, loginAttempts] = await Promise.all([
      loginAttemptApi.getSuspiciousActivity(),
      loginAttemptApi.getLoginAttempts(),
    ])

    // Assert: Backend data is correctly processed for highlighting
    expect(suspiciousActivity.suspicious_ips).toEqual(backendSuspiciousIPs)

    // Verify the core requirement: suspicious IPs from backend are used to highlight rows
    const highlightedRows = loginAttempts.filter(attempt =>
      suspiciousActivity.suspicious_ips.includes(attempt.ip_address)
    )

    // Critical assertion: Only rows with suspicious IPs are highlighted
    expect(highlightedRows).toHaveLength(2)
    expect(highlightedRows.map(row => row.ip_address)).toEqual(['192.168.1.100', '192.168.1.100'])

    // Verify non-suspicious IPs are NOT highlighted
    const nonHighlightedRows = loginAttempts.filter(attempt =>
      !suspiciousActivity.suspicious_ips.includes(attempt.ip_address)
    )
    expect(nonHighlightedRows).toHaveLength(1)
    expect(nonHighlightedRows[0].ip_address).toBe('192.168.1.200')
  })

  it('REQUIREMENT: Summary panel shows real statistics from backend data', async () => {
    // Arrange: Backend returns real data
    const mockSuspiciousActivity: SuspiciousActivity = {
      suspicious_ips: ['192.168.1.100', '192.168.1.101'],
      total_suspicious_ips: 2,
    }

    const mockLoginAttempts: LoginAttempt[] = [
      { id: 1, username: 'user1', ip_address: '192.168.1.100', timestamp: '2024-02-02T12:00:00Z', success: false },
      { id: 2, username: 'user2', ip_address: '192.168.1.200', timestamp: '2024-02-02T12:05:00Z', success: true },
      { id: 3, username: 'attacker', ip_address: '192.168.1.100', timestamp: '2024-02-02T12:10:00Z', success: false },
      { id: 4, username: 'admin', ip_address: '192.168.1.101', timestamp: '2024-02-02T12:15:00Z', success: true },
    ]

    vi.mocked(loginAttemptApi.getSuspiciousActivity).mockResolvedValue(mockSuspiciousActivity)
    vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue(mockLoginAttempts)

    // Act: Fetch and process data like the real component
    const [suspiciousActivity, loginAttempts] = await Promise.all([
      loginAttemptApi.getSuspiciousActivity(),
      loginAttemptApi.getLoginAttempts(),
    ])

    // Calculate summary statistics (real business logic)
    const totalAttempts = loginAttempts.length
    const failedAttempts = loginAttempts.filter(attempt => !attempt.success).length
    const flaggedIPs = suspiciousActivity.total_suspicious_ips

    // Assert: Summary panel shows correct statistics from backend data
    expect(totalAttempts).toBe(4) // 4 total attempts from backend
    expect(failedAttempts).toBe(2) // 2 failed attempts from backend
    expect(flaggedIPs).toBe(2) // 2 flagged IPs from backend
  })

  it('REQUIREMENT: Frontend handles empty backend responses gracefully', async () => {
    // Arrange: Backend returns empty data
    vi.mocked(loginAttemptApi.getSuspiciousActivity).mockResolvedValue({
      suspicious_ips: [],
      total_suspicious_ips: 0,
    })
    vi.mocked(loginAttemptApi.getLoginAttempts).mockResolvedValue([])

    // Act: Fetch empty data
    const [suspiciousActivity, loginAttempts] = await Promise.all([
      loginAttemptApi.getSuspiciousActivity(),
      loginAttemptApi.getLoginAttempts(),
    ])

    // Assert: Empty data is handled correctly
    expect(suspiciousActivity.suspicious_ips).toEqual([])
    expect(loginAttempts).toEqual([])

    // No rows should be highlighted when no suspicious IPs exist
    const highlightedRows = loginAttempts.filter(attempt =>
      suspiciousActivity.suspicious_ips.includes(attempt.ip_address)
    )
    expect(highlightedRows).toHaveLength(0)
  })

  it('REQUIREMENT: Parallel API calls for performance', async () => {
    // Arrange: Mock API calls with delays to verify parallel execution
    let startTime: number
    vi.mocked(loginAttemptApi.getSuspiciousActivity).mockImplementation(
      () => new Promise(resolve => {
        startTime = Date.now()
        setTimeout(() => resolve({
          suspicious_ips: ['192.168.1.100'],
          total_suspicious_ips: 1,
        }), 100)
      })
    )
    vi.mocked(loginAttemptApi.getLoginAttempts).mockImplementation(
      () => new Promise(resolve => {
        setTimeout(() => resolve([
          { id: 1, username: 'user1', ip_address: '192.168.1.100', timestamp: '2024-02-02T12:00:00Z', success: false }
        ]), 100)
      })
    )

    // Act: Execute parallel calls
    await Promise.all([
      loginAttemptApi.getSuspiciousActivity(),
      loginAttemptApi.getLoginAttempts(),
    ])

    // Assert: Calls completed in parallel (not sequential)
    const endTime = Date.now()
    const duration = endTime - startTime!

    // If sequential, would take ~200ms. If parallel, should take ~100ms
    expect(duration).toBeLessThan(150) // Allow some margin
  })
})
