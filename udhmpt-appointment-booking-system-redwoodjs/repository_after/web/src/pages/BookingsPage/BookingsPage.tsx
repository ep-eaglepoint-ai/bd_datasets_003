import React, { useState } from 'react'
import { DateTime } from 'luxon'
import { navigate } from '@redwoodjs/router'
import { useMutation, useQuery } from '@redwoodjs/web'
import { toast } from '@redwoodjs/web/toast'

import { BookingsCell } from 'src/components/BookingsCell/BookingsCell'
import BookingPanel from 'src/components/ProviderCalendar/BookingPanel'
import BookingActions from 'src/components/Booking/BookingActions'
import ServicesCell from 'src/components/ServicesCell'
import AvailabilityCell from 'src/components/Availability/AvailabilityCell'
import { useAuth } from 'src/auth/AuthContext'
import { useTimezone } from 'src/hooks/useTimezone'
import TimezoneSelector from 'src/components/UI/TimezoneSelector'

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

const PROVIDERS_QUERY = gql`
  query ProviderProfilesQuery {
    providerProfiles {
      id
      name
      bio
      cancellationWindowHours
      rescheduleWindowHours
      cancellationFeeCents
      rescheduleFeeCents
      penaltiesApplyForLateCancel
    }
  }
`

const CANCEL_BOOKING = gql`
  mutation CancelBookingMutation($id: Int!) {
    cancelBooking(id: $id) {
      id
      status
      canceledAt
    }
  }
`

const RESCHEDULE_BOOKING = gql`
  mutation RescheduleBookingMutation($id: Int!, $newStartUtcISO: String!, $newEndUtcISO: String!) {
    rescheduleBooking(id: $id, newStartUtcISO: $newStartUtcISO, newEndUtcISO: $newEndUtcISO) {
      id
      startUtc
      endUtc
      status
    }
  }
`

export const BookingPage = ({ providerId = 1, customerEmail = 'customer@example.com' }: any) => {
  const { isAuthenticated, loading, user, logout } = useAuth()
  const [selectedService, setSelectedService] = useState<{
    id: number
    providerId: number
    name: string
    durationMinutes: number
  } | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<any>(null)
  const [selectedBooking, setSelectedBooking] = useState<any>(null)
  const [startDate, setStartDate] = useState(DateTime.now().toISODate())
  const [endDate, setEndDate] = useState(DateTime.now().plus({ days: 7 }).toISODate())
  const [selectedProviderId, setSelectedProviderId] = useState<string>('')
  const [durationFilter, setDurationFilter] = useState<string>('')
  const { timezone: customerTimezone, changeTimezone } = useTimezone()

  const { data: providersData } = useQuery(PROVIDERS_QUERY)

  const [cancelBooking] = useMutation(CANCEL_BOOKING, {
    refetchQueries: ['BookingsQuery'],
  })
  const [rescheduleBooking] = useMutation(RESCHEDULE_BOOKING, {
    refetchQueries: ['BookingsQuery'],
  })

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
    if (!isAuthenticated) {
      toast.error('Please sign in to book an appointment.')
      return
    }
    if (!selectedSlot || !selectedService) return
    createBooking({
      variables: {
        input: {
          providerId: selectedService.providerId,
          serviceId: selectedService.id,
          startUtcISO: selectedSlot.startUtcISO,
          endUtcISO: selectedSlot.endUtcISO,
          customerEmail: user?.email || customerEmail,
        }
      }
    })
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  if (loading) {
    return <div className="max-w-4xl mx-auto p-6 text-gray-500">Loading...</div>
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Book Appointment</h1>
        <p className="text-gray-600">Please sign in to book an appointment.</p>
        <a
          href="/login"
          className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Go to Sign In
        </a>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Book Appointment</h1>
        <div className="flex items-center space-x-2">
          {user?.role === 'PROVIDER' && (
            <>
              <button
                onClick={() => navigate('/provider/onboarding')}
                className="px-3 py-2 bg-indigo-500 text-white rounded-md hover:bg-indigo-600 text-sm"
              >
                Provider Onboarding
              </button>
              <button
                onClick={() => navigate('/calendar')}
                className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm"
              >
                Calendar
              </button>
            </>
          )}
          <button
            onClick={handleLogout}
            className="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 text-sm"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Date Range</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value)
              setSelectedSlot(null)
            }}
            min={DateTime.now().toISODate()}
            className="w-full px-3 py-2 border rounded-md"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value)
              setSelectedSlot(null)
            }}
            min={startDate}
            className="w-full px-3 py-2 border rounded-md"
          />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Provider</label>
          <select
            value={selectedProviderId}
            onChange={(e) => {
              setSelectedProviderId(e.target.value)
              setSelectedService(null)
              setSelectedSlot(null)
            }}
            className="w-full px-3 py-2 border rounded-md"
          >
            <option value="">All providers</option>
            {(providersData?.providerProfiles || []).map((provider: any) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Duration</label>
          <select
            value={durationFilter}
            onChange={(e) => {
              setDurationFilter(e.target.value)
              setSelectedService(null)
              setSelectedSlot(null)
            }}
            className="w-full px-3 py-2 border rounded-md"
          >
            <option value="">Any duration</option>
            {[15, 30, 45, 60, 90].map((duration) => (
              <option key={duration} value={String(duration)}>
                {duration} minutes
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-6">
        <TimezoneSelector
          value={customerTimezone}
          onChange={changeTimezone}
          label="Your Timezone"
          className="w-full"
        />
      </div>

      <ServicesCell
        providerId={selectedProviderId ? Number(selectedProviderId) : undefined}
        durationMinutes={durationFilter ? Number(durationFilter) : null}
        selectedService={selectedService}
        onSelectService={(service) => {
          setSelectedService(service)
          setSelectedSlot(null)
        }}
      />

      {selectedService && (
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-3">Available Slots</h3>
          <AvailabilityCell
            input={{
              providerId: selectedService.providerId,
              serviceId: selectedService.id,
              startISO: `${startDate}T00:00:00Z`,
              endISO: `${endDate}T23:59:59Z`,
              customerTz: customerTimezone
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

      <div className="mt-10 border-t pt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Your Bookings</h2>
          <p className="text-sm text-gray-500">Manage upcoming appointments</p>
        </div>
        <BookingsCell onSelect={(booking) => setSelectedBooking(booking)} />

        {selectedBooking && (
          <div className="mt-6">
            <BookingPanel
              booking={selectedBooking}
              onClose={() => setSelectedBooking(null)}
              onSave={async () => undefined}
              showActions={false}
              variant="inline"
              customerTz={customerTimezone}
            />
            <div className="mt-6">
              <BookingActions
                booking={selectedBooking}
                customerTz={customerTimezone}
                policy={{
                  cancellationWindowHours:
                    providersData?.providerProfiles?.find(
                      (provider: any) => provider.id === selectedBooking.providerId
                    )?.cancellationWindowHours || 24,
                  rescheduleWindowHours:
                    providersData?.providerProfiles?.find(
                      (provider: any) => provider.id === selectedBooking.providerId
                    )?.rescheduleWindowHours || 24,
                  cancellationFee:
                    providersData?.providerProfiles?.find(
                      (provider: any) => provider.id === selectedBooking.providerId
                    )?.cancellationFeeCents || 0,
                  rescheduleFee:
                    providersData?.providerProfiles?.find(
                      (provider: any) => provider.id === selectedBooking.providerId
                    )?.rescheduleFeeCents || 0,
                  penaltiesApply:
                    providersData?.providerProfiles?.find(
                      (provider: any) => provider.id === selectedBooking.providerId
                    )?.penaltiesApplyForLateCancel || false,
                }}
                onCancel={(bookingId) => cancelBooking({ variables: { id: bookingId } })}
                onReschedule={(bookingId, newStartUtcISO, newEndUtcISO) =>
                  rescheduleBooking({ variables: { id: bookingId, newStartUtcISO, newEndUtcISO } })
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default BookingPage
