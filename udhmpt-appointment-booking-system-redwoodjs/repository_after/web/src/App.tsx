import React, { useState } from 'react'
import BookingPage from './pages/BookingsPage/BookingsPage'
import ProviderCalendarPage from './pages/ProviderCalendarPage/ProviderCalendarPage'
import LoginPage from './auth/LoginPage'
import { AuthProvider, useAuth } from './auth/AuthContext'

const AppContent = () => {
  const { user, logout } = useAuth()
  const [currentView, setCurrentView] = useState<'booking' | 'calendar'>('booking')

  if (!user) {
    return <LoginPage />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">
                Appointment Booking System
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              {user.role === 'CUSTOMER' && (
                <button
                  onClick={() => setCurrentView('booking')}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${
                    currentView === 'booking'
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  Book Appointment
                </button>
              )}
              
              {user.role === 'PROVIDER' && (
                <button
                  onClick={() => setCurrentView('calendar')}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${
                    currentView === 'calendar'
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  Calendar
                </button>
              )}

              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">
                  {user.name || user.email} ({user.role})
                </span>
                <button
                  onClick={logout}
                  className="px-3 py-1 text-sm bg-red-500 text-white rounded-md hover:bg-red-600"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="py-6">
        {currentView === 'booking' && user.role === 'CUSTOMER' && (
          <BookingPage 
            providerId={1} 
            customerEmail={user.email} 
          />
        )}
        
        {currentView === 'calendar' && user.role === 'PROVIDER' && (
          <ProviderCalendarPage />
        )}

        {user.role === 'CUSTOMER' && currentView === 'calendar' && (
          <div className="max-w-4xl mx-auto p-6">
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
              Calendar view is only available for providers.
            </div>
          </div>
        )}

        {user.role === 'PROVIDER' && currentView === 'booking' && (
          <div className="max-w-4xl mx-auto p-6">
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
              Booking view is only available for customers.
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export const App = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
