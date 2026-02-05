import axios from 'axios'

// Create axios instance with default configuration
const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Types for API responses
export interface LoginAttempt {
  id: number
  username: string
  ip_address: string
  timestamp: string
  success: boolean
}

export interface SuspiciousActivity {
  suspicious_ips: string[]
  total_suspicious_ips: number
}

// API functions
export const loginAttemptApi = {
  // Get all recent login attempts
  getLoginAttempts: async (): Promise<LoginAttempt[]> => {
    const response = await api.get<LoginAttempt[]>('/login_attempts/')
    return response.data
  },

  // Get suspicious activity
  getSuspiciousActivity: async (): Promise<SuspiciousActivity> => {
    const response = await api.get<SuspiciousActivity>('/suspicious/')
    return response.data
  },
}

export default api
