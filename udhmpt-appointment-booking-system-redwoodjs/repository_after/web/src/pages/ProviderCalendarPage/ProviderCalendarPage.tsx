import React, { useState } from 'react'
import { DateTime } from 'luxon'

import BookingsCell from 'src/components/BookingsCell'

export const ProviderCalendarPage = ({ providerId = 1 }: { providerId?: number }) => {
  const [currentDate, setCurrentDate] = useState(DateTime.now().toISODate())

  const handlePrevious = () => {
    const newDate = DateTime.fromISO(currentDate).minus({ days: 1 })
    setCurrentDate(newDate.toISODate()!)
  }

  const handleNext = () => {
    const newDate = DateTime.fromISO(currentDate).plus({ days: 1 })
    setCurrentDate(newDate.toISODate()!)
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Provider Calendar</h1>
          <p className="text-gray-600">Your appointments for {DateTime.fromISO(currentDate).toLocaleString(DateTime.DATE_HUGE)}</p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handlePrevious}
            className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
          >
            ←
          </button>
          <button
            onClick={() => setCurrentDate(DateTime.now().toISODate()!)}
            className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm"
          >
            Today
          </button>
          <button
            onClick={handleNext}
            className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
          >
            →
          </button>
        </div>
      </div>

      <BookingsCell
        providerId={providerId}
        startISO={`${currentDate}T00:00:00Z`}
        endISO={`${currentDate}T23:59:59Z`}
      />
    </div>
  )
}

export default ProviderCalendarPage
