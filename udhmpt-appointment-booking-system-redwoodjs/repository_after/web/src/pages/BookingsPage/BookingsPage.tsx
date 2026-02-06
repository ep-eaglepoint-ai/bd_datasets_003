import React, { useState } from 'react'
import { DateTime } from 'luxon'
import { useMutation } from '@redwoodjs/web'
import { toast } from '@redwoodjs/web/toast'

import ServicesCell from 'src/components/ServicesCell'
import AvailabilityCell from 'src/components/Availability/AvailabilityCell'

const CREATE_BOOKING_MUTATION = gql`
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

export const BookingPage = ({ providerId = 1, customerEmail = 'customer@example.com' }: any) => {
  const [selectedService, setSelectedService] = useState<number | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<any>(null)
  const [startDate, setStartDate] = useState(DateTime.now().toISODate())

  const [createBooking, { loading: creating }] = useMutation(CREATE_BOOKING_MUTATION, {
    onCompleted: (data) => {
      toast.success(`Booking confirmed! Reference: ${data.createBooking.reference}`)
      setSelectedSlot(null)
    },
    onError: (error) => {
      toast.error(`Failed to create booking: ${error.message}`)
    }
  })

  const handleBooking = () => {
    if (!selectedSlot || !selectedService) return
    createBooking({
      variables: {
        input: {
          providerId,
          serviceId: selectedService,
          startUtcISO: selectedSlot.startUtcISO,
          endUtcISO: selectedSlot.endUtcISO,
          customerEmail,
          cutoffHours: 24
        }
      }
    })
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Book Appointment</h1>

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

      <ServicesCell
        providerId={providerId}
        selectedService={selectedService}
        onSelectService={setSelectedService}
      />

      {selectedService && (
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-3">Available Slots</h3>
          <AvailabilityCell
            input={{
              providerId,
              serviceId: selectedService,
              startISO: `${startDate}T00:00:00Z`,
              endISO: `${startDate}T23:59:59Z`,
              customerTz: Intl.DateTimeFormat().resolvedOptions().timeZone
            }}
            onSelectSlot={(slot) => setSelectedSlot(slot)}
          />
        </div>
      )}

      {selectedSlot && (
        <div className="mt-6 border-t pt-6">
          <div className="mb-4 text-sm text-gray-600">
            Selected Slot: {DateTime.fromISO(selectedSlot.startLocalISO).toFormat('MMMM d, yyyy h:mm a')}
          </div>
          <button
            onClick={handleBooking}
            disabled={creating}
            className="w-full bg-blue-500 text-white py-3 px-4 rounded-md hover:bg-blue-600 disabled:opacity-50"
          >
            {creating ? 'Booking...' : 'Confirm Appointment'}
          </button>
        </div>
      )}
    </div>
  )
}

export default BookingPage
