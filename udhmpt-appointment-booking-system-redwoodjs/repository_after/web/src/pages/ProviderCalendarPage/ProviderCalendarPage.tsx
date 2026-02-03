import React, { useState } from 'react'
import { DateTime } from 'luxon'
import ProviderCalendar from '../../components/ProviderCalendar/ProviderCalendar'

// Mock booking data for demonstration
const mockBookings = [
  {
    id: 1,
    customerName: 'John Doe',
    startUtc: '2026-01-15T10:00:00Z',
    endUtc: '2026-01-15T10:30:00Z',
    customerEmail: 'john@example.com',
    reference: 'BK-001',
    status: 'confirmed' as const,
    createdAt: '2026-01-14T10:00:00Z',
    updatedAt: '2026-01-14T10:00:00Z'
  },
  {
    id: 2,
    customerName: 'Jane Smith',
    startUtc: '2026-01-15T11:00:00Z',
    endUtc: '2026-01-15T11:30:00Z',
    customerEmail: 'jane@example.com',
    reference: 'BK-002',
    status: 'confirmed' as const,
    createdAt: '2026-01-14T11:00:00Z',
    updatedAt: '2026-01-14T11:00:00Z'
  }
]

const mockFetchBookings = async (startISO: string, endISO: string) => {
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 500))
  return mockBookings
}

const mockSaveBooking = async (booking: any) => {
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 500))
  console.log('Saving booking:', booking)
}

export const ProviderCalendarPage = () => {
  const [view, setView] = useState<'day' | 'week' | 'month'>('week')
  const [currentDate, setCurrentDate] = useState(DateTime.now().toISO() || '')

  const handlePrevious = () => {
    const newDate = DateTime.fromISO(currentDate).minus({ days: 7 })
    setCurrentDate(newDate.toISO() || '')
  }

  const handleNext = () => {
    const newDate = DateTime.fromISO(currentDate).plus({ days: 7 })
    setCurrentDate(newDate.toISO() || '')
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Provider Calendar</h1>
        <p className="text-gray-600">Manage your appointments and availability</p>
      </div>

      <div className="mb-6 flex space-x-4">
        <div className="flex space-x-2">
          <button
            onClick={() => setView('day')}
            className={`px-4 py-2 rounded-md ${
              view === 'day'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Day
          </button>
          <button
            onClick={() => setView('week')}
            className={`px-4 py-2 rounded-md ${
              view === 'week'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setView('month')}
            className={`px-4 py-2 rounded-md ${
              view === 'month'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Month
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handlePrevious}
            className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
          >
            ←
          </button>
          <span className="px-3 py-2 text-gray-700">
            {DateTime.fromISO(currentDate).toLocaleString(DateTime.DATE_MED)}
          </span>
          <button
            onClick={handleNext}
            className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
          >
            →
          </button>
        </div>
      </div>

      <ProviderCalendar
        view={view}
        currentDateISO={currentDate}
        fetchBookings={mockFetchBookings}
        saveBooking={mockSaveBooking}
      />
    </div>
  )
}

export default ProviderCalendarPage
