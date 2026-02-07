import React, { useMemo, useState } from 'react'
import { navigate } from '@redwoodjs/router'
import { useMutation, useQuery } from '@redwoodjs/web'
import { toast } from '@redwoodjs/web/toast'
import gql from 'graphql-tag'

import { useAuth } from 'src/auth/AuthContext'
import TimezoneSelector from 'src/components/UI/TimezoneSelector'

const MY_PROVIDER_PROFILE = gql`
  query MyProviderProfileQuery {
    myProviderProfile {
      id
      name
      bio
      timezone
      bookingLeadTimeHours
      maxBookingsPerDay
      cancellationWindowHours
      rescheduleWindowHours
      cancellationFeeCents
      rescheduleFeeCents
      penaltiesApplyForLateCancel
    }
  }
`

const CREATE_PROVIDER_PROFILE = gql`
  mutation CreateProviderProfileMutation($input: CreateProviderProfileInput!) {
    createProviderProfile(input: $input) {
      id
      name
      bio
      timezone
      bookingLeadTimeHours
      maxBookingsPerDay
      cancellationWindowHours
      rescheduleWindowHours
      cancellationFeeCents
      rescheduleFeeCents
      penaltiesApplyForLateCancel
    }
  }
`

const UPDATE_PROVIDER_PROFILE = gql`
  mutation UpdateProviderProfileMutation($input: UpdateProviderProfileInput!) {
    updateProviderProfile(input: $input) {
      id
      name
      bio
      timezone
      bookingLeadTimeHours
      maxBookingsPerDay
      cancellationWindowHours
      rescheduleWindowHours
      cancellationFeeCents
      rescheduleFeeCents
      penaltiesApplyForLateCancel
    }
  }
`

const SERVICES_QUERY = gql`
  query ServicesForProviderQuery($providerId: Int) {
    services(providerId: $providerId) {
      id
      name
      durationMinutes
      capacity
      bufferBeforeMinutes
      bufferAfterMinutes
    }
  }
`

const CREATE_SERVICE = gql`
  mutation CreateServiceMutation($input: CreateServiceInput!) {
    createService(input: $input) {
      id
      name
      durationMinutes
      capacity
      bufferBeforeMinutes
      bufferAfterMinutes
    }
  }
`

const RECURRING_QUERY = gql`
  query RecurringAvailabilitiesQuery($providerId: Int!) {
    recurringAvailabilities(providerId: $providerId) {
      id
      weekday
      startLocal
      endLocal
      tz
    }
  }
`

const CREATE_RECURRING = gql`
  mutation CreateRecurringAvailabilityMutation($input: RecurringAvailabilityInput!) {
    createRecurringAvailability(input: $input) {
      id
      weekday
      startLocal
      endLocal
      tz
    }
  }
`

const CUSTOM_QUERY = gql`
  query CustomDayAvailabilitiesQuery($providerId: Int!) {
    customDayAvailabilities(providerId: $providerId) {
      id
      date
      startUtc
      endUtc
      tz
    }
  }
`

const CREATE_CUSTOM = gql`
  mutation CreateCustomDayAvailabilityMutation($input: CustomDayAvailabilityInput!) {
    createCustomDayAvailability(input: $input) {
      id
      date
      startUtc
      endUtc
      tz
    }
  }
`

const EXCEPTIONS_QUERY = gql`
  query AvailabilityExceptionsQuery($providerId: Int!) {
    availabilityExceptions(providerId: $providerId) {
      id
      startUtc
      endUtc
      reason
    }
  }
`

const CREATE_EXCEPTION = gql`
  mutation CreateAvailabilityExceptionMutation($input: AvailabilityExceptionInput!) {
    createAvailabilityException(input: $input) {
      id
      startUtc
      endUtc
      reason
    }
  }
`

const DELETE_EXCEPTION = gql`
  mutation DeleteAvailabilityExceptionMutation($id: Int!) {
    deleteAvailabilityException(id: $id) {
      id
    }
  }
`

const ProviderOnboardingPage: React.FC = () => {
  const { isAuthenticated, loading, user } = useAuth()
  const defaultTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    []
  )

  const [profileName, setProfileName] = useState('')
  const [profileBio, setProfileBio] = useState('')
  const [profileTimezone, setProfileTimezone] = useState(defaultTimezone)
  const [bookingLeadTimeHours, setBookingLeadTimeHours] = useState('1')
  const [maxBookingsPerDay, setMaxBookingsPerDay] = useState('')
  const [cancellationWindowHours, setCancellationWindowHours] = useState('24')
  const [rescheduleWindowHours, setRescheduleWindowHours] = useState('24')
  const [cancellationFeeCents, setCancellationFeeCents] = useState('0')
  const [rescheduleFeeCents, setRescheduleFeeCents] = useState('0')
  const [penaltiesApply, setPenaltiesApply] = useState(false)

  const [serviceName, setServiceName] = useState('')
  const [serviceDuration, setServiceDuration] = useState('30')
  const [serviceCapacity, setServiceCapacity] = useState('1')
  const [serviceBufferBefore, setServiceBufferBefore] = useState('0')
  const [serviceBufferAfter, setServiceBufferAfter] = useState('0')
  const [weekday, setWeekday] = useState('1')
  const [recurringStart, setRecurringStart] = useState('09:00')
  const [recurringEnd, setRecurringEnd] = useState('17:00')

  const [customDate, setCustomDate] = useState('')
  const [customStart, setCustomStart] = useState('09:00')
  const [customEnd, setCustomEnd] = useState('17:00')

  const [exceptionStart, setExceptionStart] = useState('')
  const [exceptionEnd, setExceptionEnd] = useState('')
  const [exceptionReason, setExceptionReason] = useState('')

  const {
    data: profileData,
    loading: profileLoading,
    refetch: refetchProfile,
  } = useQuery(MY_PROVIDER_PROFILE, {
    skip: !isAuthenticated || user?.role !== 'PROVIDER',
  })

  const providerProfile = profileData?.myProviderProfile

  const {
    data: servicesData,
    loading: servicesLoading,
    refetch: refetchServices,
  } = useQuery(SERVICES_QUERY, {
    variables: { providerId: providerProfile?.id },
    skip: !providerProfile?.id,
  })

  const [createProviderProfile, { loading: creatingProfile, error: profileError }] =
    useMutation(CREATE_PROVIDER_PROFILE, {
      onCompleted: () => {
        refetchProfile()
        toast.success('Provider profile created')
      },
      onError: (error) => toast.error(error.message),
    })

  const [updateProviderProfile, { loading: updatingProfile, error: updateError }] =
    useMutation(UPDATE_PROVIDER_PROFILE, {
      onCompleted: () => {
        refetchProfile()
        toast.success('Profile updated')
      },
      onError: (error) => toast.error(error.message),
    })

  const [createService, { loading: creatingService, error: serviceError }] =
    useMutation(CREATE_SERVICE, {
      onCompleted: () => {
        refetchServices()
        setServiceName('')
        setServiceDuration('30')
        setServiceCapacity('1')
        setServiceBufferBefore('0')
        setServiceBufferAfter('0')
        toast.success('Service added')
      },
      onError: (error) => toast.error(error.message),
    })

  const {
    data: recurringData,
    loading: recurringLoading,
    refetch: refetchRecurring,
  } = useQuery(RECURRING_QUERY, {
    variables: { providerId: providerProfile?.id },
    skip: !providerProfile?.id,
  })

  const {
    data: customData,
    loading: customLoading,
    refetch: refetchCustom,
  } = useQuery(CUSTOM_QUERY, {
    variables: { providerId: providerProfile?.id },
    skip: !providerProfile?.id,
  })

  const {
    data: exceptionsData,
    loading: exceptionsLoading,
    refetch: refetchExceptions,
  } = useQuery(EXCEPTIONS_QUERY, {
    variables: { providerId: providerProfile?.id },
    skip: !providerProfile?.id,
  })

  const [createRecurring, { loading: creatingRecurring, error: recurringError }] =
    useMutation(CREATE_RECURRING, {
      onCompleted: () => {
        refetchRecurring()
        toast.success('Recurring availability added')
      },
      onError: (error) => toast.error(error.message),
    })

  const [createCustom, { loading: creatingCustom, error: customError }] =
    useMutation(CREATE_CUSTOM, {
      onCompleted: () => {
        refetchCustom()
        toast.success('Custom day availability added')
      },
      onError: (error) => toast.error(error.message),
    })

  const [createException, { loading: creatingException, error: exceptionError }] =
    useMutation(CREATE_EXCEPTION, {
      onCompleted: () => {
        refetchExceptions()
        setExceptionStart('')
        setExceptionEnd('')
        setExceptionReason('')
        toast.success('Availability exception added')
      },
      onError: (error) => toast.error(error.message),
    })

  const [deleteException] = useMutation(DELETE_EXCEPTION, {
    onCompleted: () => {
      refetchExceptions()
      toast.success('Exception removed')
    },
    onError: (error) => toast.error(error.message),
  })

  const handleCreateProfile = (event: React.FormEvent) => {
    event.preventDefault()

    createProviderProfile({
      variables: {
        input: {
          name: profileName.trim(),
          bio: profileBio.trim() || undefined,
          timezone: profileTimezone.trim() || undefined,
          bookingLeadTimeHours: Number(bookingLeadTimeHours) || 1,
          maxBookingsPerDay: maxBookingsPerDay ? Number(maxBookingsPerDay) : null,
          cancellationWindowHours: Number(cancellationWindowHours) || 24,
          rescheduleWindowHours: Number(rescheduleWindowHours) || 24,
          cancellationFeeCents: Number(cancellationFeeCents) || 0,
          rescheduleFeeCents: Number(rescheduleFeeCents) || 0,
          penaltiesApplyForLateCancel: penaltiesApply,
        },
      },
    })
  }

  const handleUpdateProfile = (event: React.FormEvent) => {
    event.preventDefault()

    updateProviderProfile({
      variables: {
        input: {
          name: profileName.trim() || undefined,
          bio: profileBio.trim() || undefined,
          timezone: profileTimezone.trim() || undefined,
          bookingLeadTimeHours: Number(bookingLeadTimeHours) || 1,
          maxBookingsPerDay: maxBookingsPerDay ? Number(maxBookingsPerDay) : null,
          cancellationWindowHours: Number(cancellationWindowHours) || 24,
          rescheduleWindowHours: Number(rescheduleWindowHours) || 24,
          cancellationFeeCents: Number(cancellationFeeCents) || 0,
          rescheduleFeeCents: Number(rescheduleFeeCents) || 0,
          penaltiesApplyForLateCancel: penaltiesApply,
        },
      },
    })
  }

  const handleCreateService = (event: React.FormEvent) => {
    event.preventDefault()

    const duration = Number(serviceDuration)
    const capacity = Number(serviceCapacity)
    const bufferBefore = Number(serviceBufferBefore)
    const bufferAfter = Number(serviceBufferAfter)
    if (!serviceName.trim() || Number.isNaN(duration) || duration <= 0) return

    createService({
      variables: {
        input: {
          name: serviceName.trim(),
          durationMinutes: duration,
          capacity: Number.isNaN(capacity) || capacity <= 0 ? 1 : capacity,
          bufferBeforeMinutes: Number.isNaN(bufferBefore) ? 0 : bufferBefore,
          bufferAfterMinutes: Number.isNaN(bufferAfter) ? 0 : bufferAfter,
        },
      },
    })
  }

  const handleCreateRecurring = (event: React.FormEvent) => {
    event.preventDefault()

    createRecurring({
      variables: {
        input: {
          weekday: Number(weekday),
          startLocal: recurringStart,
          endLocal: recurringEnd,
        },
      },
    })
  }

  const handleCreateCustom = (event: React.FormEvent) => {
    event.preventDefault()

    if (!customDate) return

    createCustom({
      variables: {
        input: {
          date: customDate,
          startLocal: customStart,
          endLocal: customEnd,
        },
      },
    })
  }

  const handleCreateException = (event: React.FormEvent) => {
    event.preventDefault()

    if (!exceptionStart || !exceptionEnd) return

    createException({
      variables: {
        input: {
          startUtcISO: exceptionStart,
          endUtcISO: exceptionEnd,
          reason: exceptionReason.trim() || undefined,
        },
      },
    })
  }

  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  if (loading || profileLoading) {
    return <div className="max-w-3xl mx-auto p-6 text-gray-500">Loading...</div>
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-900">Provider Onboarding</h1>
        <p className="mt-2 text-gray-600">Please sign in as a provider to continue.</p>
        <a
          href="/login"
          className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Go to Sign In
        </a>
      </div>
    )
  }

  if (user?.role !== 'PROVIDER') {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-900">Provider Onboarding</h1>
        <p className="mt-2 text-gray-600">Only provider accounts can access onboarding.</p>
        <button
          onClick={() => navigate('/bookings')}
          className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Go to Bookings
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Provider Onboarding</h1>
          <p className="text-gray-600">Create your profile and the services you offer.</p>
        </div>
        <button type="button" onClick={() => navigate('/provider')}>
          Go to Provider
        </button>
      </div>

      {!providerProfile ? (
        <form onSubmit={handleCreateProfile} className="bg-white border rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Create Profile</h2>
          <p className="text-sm text-gray-600 mb-4">Set up your provider details.</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Bio</label>
              <textarea
                value={profileBio}
                onChange={(e) => setProfileBio(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                rows={3}
              />
            </div>

            <div>
              <TimezoneSelector
                value={profileTimezone}
                onChange={setProfileTimezone}
                label="Timezone"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Booking Lead Time (hours)</label>
              <input
                type="number"
                min={0}
                step={1}
                value={bookingLeadTimeHours}
                onChange={(e) => setBookingLeadTimeHours(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Max Bookings Per Day</label>
              <input
                type="number"
                min={0}
                step={1}
                value={maxBookingsPerDay}
                onChange={(e) => setMaxBookingsPerDay(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="Leave blank for unlimited"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Cancellation Window (hours)</label>
              <input
                type="number"
                min={0}
                step={1}
                value={cancellationWindowHours}
                onChange={(e) => setCancellationWindowHours(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Reschedule Window (hours)</label>
              <input
                type="number"
                min={0}
                step={1}
                value={rescheduleWindowHours}
                onChange={(e) => setRescheduleWindowHours(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Cancellation Fee (cents)</label>
              <input
                type="number"
                min={0}
                step={50}
                value={cancellationFeeCents}
                onChange={(e) => setCancellationFeeCents(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Reschedule Fee (cents)</label>
              <input
                type="number"
                min={0}
                step={50}
                value={rescheduleFeeCents}
                onChange={(e) => setRescheduleFeeCents(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                id="penaltiesApplyCreate"
                type="checkbox"
                checked={penaltiesApply}
                onChange={(e) => setPenaltiesApply(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="penaltiesApplyCreate" className="text-sm font-medium">
                Apply penalties for late cancel/reschedule
              </label>
            </div>
          </div>

          {profileError && (
            <p className="mt-4 text-sm text-red-600">{profileError.message}</p>
          )}

          <button
            type="submit"
            disabled={creatingProfile}
            className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {creatingProfile ? 'Creating...' : 'Create Profile'}
          </button>
        </form>
      ) : (
        <div className="space-y-6">
          <div className="bg-white border rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
            <form onSubmit={handleUpdateProfile} className="mt-4 space-y-4 text-sm">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  value={profileName || providerProfile.name}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Bio</label>
                <textarea
                  value={profileBio || providerProfile.bio || ''}
                  onChange={(e) => setProfileBio(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  rows={3}
                />
              </div>
              <div>
                <TimezoneSelector
                  value={profileTimezone || providerProfile.timezone}
                  onChange={setProfileTimezone}
                  label="Timezone"
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Booking Lead Time (hours)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={bookingLeadTimeHours || String(providerProfile.bookingLeadTimeHours || 1)}
                  onChange={(e) => setBookingLeadTimeHours(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max Bookings Per Day</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={maxBookingsPerDay || (providerProfile.maxBookingsPerDay ?? '').toString()}
                  onChange={(e) => setMaxBookingsPerDay(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="Leave blank for unlimited"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Cancellation Window (hours)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={
                    cancellationWindowHours ||
                    String(providerProfile.cancellationWindowHours ?? 24)
                  }
                  onChange={(e) => setCancellationWindowHours(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Reschedule Window (hours)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={
                    rescheduleWindowHours ||
                    String(providerProfile.rescheduleWindowHours ?? 24)
                  }
                  onChange={(e) => setRescheduleWindowHours(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Cancellation Fee (cents)</label>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={cancellationFeeCents || String(providerProfile.cancellationFeeCents ?? 0)}
                  onChange={(e) => setCancellationFeeCents(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Reschedule Fee (cents)</label>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={rescheduleFeeCents || String(providerProfile.rescheduleFeeCents ?? 0)}
                  onChange={(e) => setRescheduleFeeCents(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  id="penaltiesApplyUpdate"
                  type="checkbox"
                  checked={
                    penaltiesApply ||
                    Boolean(providerProfile.penaltiesApplyForLateCancel)
                  }
                  onChange={(e) => setPenaltiesApply(e.target.checked)}
                  className="h-4 w-4"
                />
                <label htmlFor="penaltiesApplyUpdate" className="text-sm font-medium">
                  Apply penalties for late cancel/reschedule
                </label>
              </div>
              {updateError && (
                <p className="text-sm text-red-600">{updateError.message}</p>
              )}
              <button
                type="submit"
                disabled={updatingProfile}
                className="inline-flex px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {updatingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </form>
            <button
              onClick={() => navigate('/calendar')}
              className="mt-4 inline-flex px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Go to Calendar
            </button>
          </div>

          <div className="bg-white border rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Services</h2>
            <p className="text-sm text-gray-600 mb-4">Add the services you offer and their durations.</p>

            <form onSubmit={handleCreateService} className="grid grid-cols-1 md:grid-cols-7 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Service Name</label>
                <input
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Duration (min)</label>
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={serviceDuration}
                  onChange={(e) => setServiceDuration(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Capacity</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={serviceCapacity}
                  onChange={(e) => setServiceCapacity(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Buffer Before</label>
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={serviceBufferBefore}
                  onChange={(e) => setServiceBufferBefore(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Buffer After</label>
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={serviceBufferAfter}
                  onChange={(e) => setServiceBufferAfter(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>

              <div className="md:col-span-7">
                <button
                  type="submit"
                  disabled={creatingService}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {creatingService ? 'Adding...' : 'Add Service'}
                </button>
              </div>
            </form>

            {serviceError && (
              <p className="mt-4 text-sm text-red-600">{serviceError.message}</p>
            )}

            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Current Services</h3>
              {servicesLoading ? (
                <p className="text-sm text-gray-500">Loading services...</p>
              ) : servicesData?.services?.length ? (
                <ul className="space-y-2">
                  {servicesData.services.map((service: any) => (
                    <li
                      key={service.id}
                      className="flex items-center justify-between border rounded-md px-3 py-2 text-sm"
                    >
                      <span>{service.name}</span>
                      <span className="text-gray-500">
                        {service.durationMinutes} min
                        {service.capacity > 1 && (
                          <span> • capacity {service.capacity}</span>
                        )}
                        {(service.bufferBeforeMinutes || service.bufferAfterMinutes) && (
                          <span>
                            {' '}
                            • buffer {service.bufferBeforeMinutes || 0}/{service.bufferAfterMinutes || 0} min
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No services created yet.</p>
              )}
            </div>
          </div>

          <div className="bg-white border rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Recurring Availability</h2>
            <p className="text-sm text-gray-600 mb-4">
              Set your weekly schedule. Add multiple windows per day if needed.
            </p>

            <form onSubmit={handleCreateRecurring} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Weekday</label>
                <select
                  value={weekday}
                  onChange={(e) => setWeekday(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {weekdayLabels.map((label, index) => (
                    <option key={label} value={index + 1}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Start</label>
                <input
                  type="time"
                  value={recurringStart}
                  onChange={(e) => setRecurringStart(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End</label>
                <input
                  type="time"
                  value={recurringEnd}
                  onChange={(e) => setRecurringEnd(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={creatingRecurring}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {creatingRecurring ? 'Adding...' : 'Add Window'}
                </button>
              </div>
            </form>

            {recurringError && (
              <p className="mt-4 text-sm text-red-600">{recurringError.message}</p>
            )}

            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Current Weekly Rules</h3>
              {recurringLoading ? (
                <p className="text-sm text-gray-500">Loading availability...</p>
              ) : recurringData?.recurringAvailabilities?.length ? (
                <ul className="space-y-2">
                  {recurringData.recurringAvailabilities.map((rule: any) => (
                    <li
                      key={rule.id}
                      className="flex items-center justify-between border rounded-md px-3 py-2 text-sm"
                    >
                      <span>
                        {weekdayLabels[rule.weekday - 1]} • {rule.startLocal} - {rule.endLocal}
                      </span>
                      <span className="text-gray-500">{rule.tz}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No recurring rules yet.</p>
              )}
            </div>
          </div>

          <div className="bg-white border rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Custom Day Availability</h2>
            <p className="text-sm text-gray-600 mb-4">
              Add extra availability for specific dates.
            </p>

            <form onSubmit={handleCreateCustom} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Date</label>
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Start</label>
                <input
                  type="time"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End</label>
                <input
                  type="time"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={creatingCustom}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {creatingCustom ? 'Adding...' : 'Add Custom Day'}
                </button>
              </div>
            </form>

            {customError && (
              <p className="mt-4 text-sm text-red-600">{customError.message}</p>
            )}

            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Upcoming Custom Days</h3>
              {customLoading ? (
                <p className="text-sm text-gray-500">Loading custom days...</p>
              ) : customData?.customDayAvailabilities?.length ? (
                <ul className="space-y-2">
                  {customData.customDayAvailabilities.map((day: any) => (
                    <li
                      key={day.id}
                      className="flex items-center justify-between border rounded-md px-3 py-2 text-sm"
                    >
                      <span>{new Date(day.date).toLocaleDateString()}</span>
                      <span className="text-gray-500">
                        {new Date(day.startUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                        {new Date(day.endUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No custom days added yet.</p>
              )}
            </div>
          </div>

          <div className="bg-white border rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Availability Exceptions</h2>
            <p className="text-sm text-gray-600 mb-4">
              Block out time ranges that should not be bookable.
            </p>

            <form onSubmit={handleCreateException} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Start</label>
                <input
                  type="datetime-local"
                  value={exceptionStart}
                  onChange={(e) => setExceptionStart(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End</label>
                <input
                  type="datetime-local"
                  value={exceptionEnd}
                  onChange={(e) => setExceptionEnd(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Reason</label>
                <input
                  value={exceptionReason}
                  onChange={(e) => setExceptionReason(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div className="md:col-span-3">
                <button
                  type="submit"
                  disabled={creatingException}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {creatingException ? 'Adding...' : 'Add Exception'}
                </button>
              </div>
            </form>

            {exceptionError && (
              <p className="mt-4 text-sm text-red-600">{exceptionError.message}</p>
            )}

            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Upcoming Exceptions</h3>
              {exceptionsLoading ? (
                <p className="text-sm text-gray-500">Loading exceptions...</p>
              ) : exceptionsData?.availabilityExceptions?.length ? (
                <ul className="space-y-2">
                  {exceptionsData.availabilityExceptions.map((exception: any) => (
                    <li
                      key={exception.id}
                      className="flex items-center justify-between border rounded-md px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium">
                          {new Date(exception.startUtc).toLocaleString()} - {new Date(exception.endUtc).toLocaleString()}
                        </div>
                        {exception.reason && (
                          <div className="text-gray-500">{exception.reason}</div>
                        )}
                      </div>
                      <button
                        onClick={() => deleteException({ variables: { id: exception.id } })}
                        className="text-red-600 hover:text-red-700 text-sm"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No exceptions added yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProviderOnboardingPage
