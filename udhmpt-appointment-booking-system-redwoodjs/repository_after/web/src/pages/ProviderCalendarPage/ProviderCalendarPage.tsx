import React, { useState } from 'react'
import { DateTime } from 'luxon'
import { navigate } from '@redwoodjs/router'
import { useMutation, useQuery } from '@redwoodjs/web'
import gql from 'graphql-tag'

import ProviderCalendar from 'src/components/ProviderCalendar/ProviderCalendar'
import BookingPanel from 'src/components/ProviderCalendar/BookingPanel'
import BookingActions from 'src/components/Booking/BookingActions'
import { useAuth } from 'src/auth/AuthContext'

const MY_PROVIDER_PROFILE = gql`
  query MyProviderProfileQuery {
    myProviderProfile {
      id
      timezone
      cancellationWindowHours
      rescheduleWindowHours
      cancellationFeeCents
      rescheduleFeeCents
      penaltiesApplyForLateCancel
    }
  }
`

const UPDATE_BOOKING = gql`
  mutation UpdateBookingMutation($id: Int!, $input: UpdateBookingInput!) {
    updateBooking(id: $id, input: $input) {
      id
      status
      notes
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

export const ProviderCalendarPage = ({ providerId = 1 }: { providerId?: number }) => {
  const [currentDate, setCurrentDate] = useState(DateTime.now().toISODate())
  const [view, setView] = useState<'day' | 'week' | 'month'>('day')
  const [selectedBooking, setSelectedBooking] = useState<any>(null)
  const { isAuthenticated, loading, logout, user } = useAuth()

  const { data: profileData, loading: profileLoading } = useQuery(MY_PROVIDER_PROFILE, {
    skip: !isAuthenticated || user?.role !== 'PROVIDER',
  })

  const profileId = profileData?.myProviderProfile?.id
  const policy = profileData?.myProviderProfile
  const providerTimezone = profileData?.myProviderProfile?.timezone || 'UTC'
  const effectiveProviderId = profileId || providerId

  const [updateBooking] = useMutation(UPDATE_BOOKING, {
    refetchQueries: ['BookingsQuery'],
  })
  const [cancelBooking] = useMutation(CANCEL_BOOKING, {
    refetchQueries: ['BookingsQuery'],
  })
  const [rescheduleBooking] = useMutation(RESCHEDULE_BOOKING, {
    refetchQueries: ['BookingsQuery'],
  })

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handlePrevious = () => {
    const newDate =
      view === 'month'
        ? DateTime.fromISO(currentDate).minus({ months: 1 })
        : view === 'week'
          ? DateTime.fromISO(currentDate).minus({ weeks: 1 })
          : DateTime.fromISO(currentDate).minus({ days: 1 })
    setCurrentDate(newDate.toISODate()!)
  }

  const handleNext = () => {
    const newDate =
      view === 'month'
        ? DateTime.fromISO(currentDate).plus({ months: 1 })
        : view === 'week'
          ? DateTime.fromISO(currentDate).plus({ weeks: 1 })
          : DateTime.fromISO(currentDate).plus({ days: 1 })
    setCurrentDate(newDate.toISODate()!)
  }

  if (loading || profileLoading) {
    return <div className="max-w-4xl mx-auto p-6 text-gray-500">Loading...</div>
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-900">Provider Calendar</h1>
        <p className="mt-2 text-gray-600">Please sign in to view your calendar.</p>
        <a
          href="/login"
          className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Go to Sign In
        </a>
      </div>
    )
  }

  if (user?.role === 'PROVIDER' && !profileId) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-900">Provider Calendar</h1>
        <p className="mt-2 text-gray-600">Complete onboarding to view your calendar.</p>
        <button
          onClick={() => navigate('/provider/onboarding')}
          className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Start Onboarding
        </button>
      </div>
    )
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
            onClick={() => navigate('/provider/onboarding')}
            className="px-3 py-2 bg-indigo-500 text-white rounded-md hover:bg-indigo-600 text-sm"
          >
            Onboarding
          </button>
          <div className="flex items-center rounded-md border border-gray-200 overflow-hidden">
            {(['day', 'week', 'month'] as const).map((option) => (
              <button
                key={option}
                onClick={() => setView(option)}
                className={`px-3 py-2 text-sm ${view === option ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
              >
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
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
          <button
            onClick={handleLogout}
            className="ml-2 px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 text-sm"
          >
            Logout
          </button>
        </div>
      </div>

      <ProviderCalendar
        view={view}
        currentDateISO={currentDate}
        providerId={effectiveProviderId}
        onSelectBooking={(booking) => setSelectedBooking(booking)}
        timezone={providerTimezone}
      />

      {selectedBooking && (
        <div className="mt-8">
          <BookingPanel
            booking={selectedBooking}
            onClose={() => setSelectedBooking(null)}
            onSave={async (updated) => {
              await updateBooking({
                variables: { id: selectedBooking.id, input: { status: updated.status, notes: updated.notes } },
              })
              setSelectedBooking({ ...selectedBooking, status: updated.status, notes: updated.notes })
            }}
            variant="inline"
            showActions={true}
            customerTz={providerTimezone}
          />
          {policy && (
            <div className="mt-6">
              <BookingActions
                booking={selectedBooking}
                customerTz={providerTimezone}
                policy={{
                  cancellationWindowHours: policy.cancellationWindowHours,
                  rescheduleWindowHours: policy.rescheduleWindowHours,
                  cancellationFee: policy.cancellationFeeCents || 0,
                  rescheduleFee: policy.rescheduleFeeCents || 0,
                  penaltiesApply: policy.penaltiesApplyForLateCancel,
                }}
                onCancel={(bookingId) => cancelBooking({ variables: { id: bookingId } })}
                onReschedule={(bookingId, newStartUtcISO, newEndUtcISO) =>
                  rescheduleBooking({ variables: { id: bookingId, newStartUtcISO, newEndUtcISO } })
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ProviderCalendarPage
