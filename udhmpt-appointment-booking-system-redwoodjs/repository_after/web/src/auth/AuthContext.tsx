import React, { createContext, useContext, useState, useEffect } from 'react'

type User = {
  id: number
  email: string
  role: 'PROVIDER' | 'CUSTOMER' | 'ADMIN'
  name?: string
}

type AuthContextType = {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<boolean>
  register: (email: string, password: string, name?: string) => Promise<boolean>
  logout: () => void
  loading: boolean
  getToken: () => Promise<string | null>
  type: string
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const apiBaseUrl =
    (import.meta as any)?.env?.VITE_API_BASE_URL ||
    (import.meta as any)?.env?.REDWOOD_ENV_API_BASE_URL ||
    '/.redwood/functions'

  // Real authentication with JWT token
  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch(`${apiBaseUrl}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const payload = await response.text()
      let data: any = null
      try {
        data = JSON.parse(payload)
      } catch (e) {
        console.error('Login response was not JSON:', payload)
      }

      if (response.ok && data?.user && data?.token) {
        setUser(data.user)
        setToken(data.token)
        localStorage.setItem('user', JSON.stringify(data.user))
        localStorage.setItem('token', data.token)
        return true
      }

      console.error('Login failed:', {
        status: response.status,
        payload,
      })
      return false
    } catch (error) {
      console.error('Login error:', error)
      return false
    }
  }

  const register = async (email: string, password: string, name?: string): Promise<boolean> => {
    try {
      const response = await fetch(`${apiBaseUrl}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, name }),
      })

      const payload = await response.text()
      let data: any = null
      try {
        data = JSON.parse(payload)
      } catch (e) {
        console.error('Register response was not JSON:', payload)
      }

      if (response.ok && data?.user && data?.token) {
        setUser(data.user)
        setToken(data.token)
        localStorage.setItem('user', JSON.stringify(data.user))
        localStorage.setItem('token', data.token)
        return true
      }

      console.error('Register failed:', {
        status: response.status,
        payload,
      })
      return false
    } catch (error) {
      console.error('Register error:', error)
      return false
    }
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('user')
    localStorage.removeItem('token')
  }

  useEffect(() => {
    const storedUser = localStorage.getItem('user')
    const storedToken = localStorage.getItem('token')
    if (storedUser && storedToken) {
      try {
        setUser(JSON.parse(storedUser))
        setToken(storedToken)
      } catch (error) {
        localStorage.removeItem('user')
        localStorage.removeItem('token')
      }
    }
    setLoading(false)
  }, [])

  const value = {
    user,
    token,
    login,
    register,
    logout,
    loading,
    getToken: async () => token || localStorage.getItem('token'),
    type: 'jwt',
    isAuthenticated: Boolean(token)
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
