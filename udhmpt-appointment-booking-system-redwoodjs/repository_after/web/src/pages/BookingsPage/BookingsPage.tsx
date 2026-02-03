import React, { useState } from 'react'
import { DateTime } from 'luxon'

// Real GraphQL queries
const SEARCH_AVAILABILITY_QUERY = `
  query SearchAvailability($input: SearchAvailabilityInput!) {
    searchAvailability(input: $input) {
      startUtcISO
      endUtcISO
      startLocalISO
    }
  }
`

const CREATE_BOOKING_MUTATION = `
  mutation CreateBooking($input: CreateBookingInput!) {
    createBooking(input: $input) {
      id
      reference
      startUtc
      endUtc
      customerEmail
    }
  }
`

// Real GraphQL client
const graphqlRequest = async (query: string, variables?: any) => {
  const response = await fetch('http://localhost:8911/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    throw new Error(`GraphQL error: ${response.statusText}`)
  }

  const result = await response.json()
  if (result.errors) {
    throw new Error(result.errors[0].message)
  }

  return result.data
}

export const BookingPage = ({ providerId, customerEmail }: any) => {
  const [selectedService, setSelectedService] = useState<number | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<any>(null)
  const [startDate, setStartDate] = useState(DateTime.now().toISODate())
  const [slots, setSlots] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const loadSlots = async () => {
    if (!selectedService) return
    setLoading(true)
    try {
      const data = await graphqlRequest(SEARCH_AVAILABILITY_QUERY, {
        input: {
          providerId,
          serviceId: selectedService,
          startISO: `${startDate}T00:00:00Z`,
          endISO: `${startDate}T23:59:59Z`,
          customerTz: Intl.DateTimeFormat().resolvedOptions().timeZone
        }
      })
      setSlots(data.searchAvailability)
    } catch (error: any) {
      setMessage(`Failed to load slots: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    loadSlots()
  }, [selectedService, startDate])

  const handleBooking = async () => {
    if (!selectedSlot || !selectedService) return
    setLoading(true)
    try {
      const data = await graphqlRequest(CREATE_BOOKING_MUTATION, {
        input: {
          providerId,
          serviceId: selectedService,
          startUtcISO: selectedSlot.startUtcISO,
          endUtcISO: selectedSlot.endUtcISO,
          customerEmail,
          cutoffHours: 24
        }
      })
      setMessage(`Booking confirmed! Reference: ${data.createBooking.reference}`)
      setSelectedSlot(null)
      setSlots([])
    } catch (error: any) {
      setMessage(`Failed to create booking: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Book Appointment</h1>
      
      {message && (
        <div className="mb-4 p-4 bg-blue-100 text-blue-700 rounded-md">
          {message}
        </div>
      )}

      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Select Date</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          min={DateTime.now().toISODate()}
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Select Service</label>
        <select
          value={selectedService || ''}
          onChange={(e) => setSelectedService(Number(e.target.value))}
          className="w-full px-3 py-2 border rounded-md"
        >
          <option value="">Choose a service...</option>
          <option value="1">Consultation (30 min)</option>
          <option value="2">Full Session (60 min)</option>
        </select>
      </div>

      {loading && <div>Loading available slots...</div>}
      
      {slots.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-3">Available Slots</h3>
          <div className="grid grid-cols-3 gap-3">
            {slots.map((slot, index) => (
              <button
                key={index}
                onClick={() => setSelectedSlot(slot)}
                className={`p-3 border rounded-md text-sm ${
                  selectedSlot?.startUtcISO === slot.startUtcISO
                    ? 'bg-blue-500 text-white'
                    : 'bg-white hover:bg-gray-50'
                }`}
              >
                {DateTime.fromISO(slot.startLocalISO).toFormat('h:mm a')}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedSlot && (
        <div className="mb-6">
          <button
            onClick={handleBooking}
            className="w-full bg-blue-500 text-white py-3 px-4 rounded-md hover:bg-blue-600"
          >
            Book Selected Slot
          </button>
        </div>
      )}
    </div>
  )
}

export default BookingPage
