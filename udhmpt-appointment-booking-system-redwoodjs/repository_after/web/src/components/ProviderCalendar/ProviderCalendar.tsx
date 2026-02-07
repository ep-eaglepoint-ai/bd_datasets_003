import React, { useMemo } from 'react'
import { DateTime } from 'luxon'
import { useMutation } from '@redwoodjs/web'
import gql from 'graphql-tag'
import { useAuth } from '../../auth/AuthContext'
import { BookingsCell } from '../BookingsCell/BookingsCell'
import { toast } from '@redwoodjs/web/toast'

const CREATE_MANUAL_BLOCK = gql`
  mutation CreateManualBlockMutation($input: ManualBlockInput!) {
    createManualBlock(input: $input) {
      id
    }
  }
`

type View = 'day' | 'week' | 'month'

interface ProviderCalendarProps {
  view: View
  currentDateISO: string
  providerId?: number
  onSelectBooking?: (booking: any) => void
  timezone?: string
}

const ProviderCalendar: React.FC<ProviderCalendarProps> = ({
  view,
  currentDateISO,
  providerId,
  onSelectBooking,
  timezone = 'UTC',
}) => {
  const { user } = useAuth()

  const effectiveProviderId = useMemo(() => {
    return providerId || (user as any)?.providerProfileId
  }, [providerId, user])

  const dateRange = useMemo(() => {
    const dt = DateTime.fromISO(currentDateISO, { zone: timezone })
    if (view === 'day') {
      return {
        start: dt.startOf('day').toUTC().toISO()!,
        end: dt.endOf('day').toUTC().toISO()!,
      }
    }
    if (view === 'week') {
      const monday = dt.startOf('week')
      return {
        start: monday.startOf('day').toUTC().toISO()!,
        end: monday.plus({ days: 6 }).endOf('day').toUTC().toISO()!,
      }
    }
    return {
      start: dt.startOf('month').toUTC().toISO()!,
      end: dt.endOf('month').toUTC().toISO()!,
    }
  }, [view, currentDateISO, timezone])

  // Hourly grid for day view
  const hours = Array.from({ length: 14 }, (_, i) => i + 8) // 8 AM to 9 PM

  const [createManualBlock] = useMutation(CREATE_MANUAL_BLOCK, {
    refetchQueries: ['BookingsQuery'],
    onCompleted: () => toast.success('Time block created'),
    onError: (error) => toast.error(error.message),
  })

  const handleManualBlock = () => {
    const reason = prompt('Reason for block?')
    if (reason === null) return

    // For simplicity in this UI, we just block the next hour
    const start = DateTime.utc().plus({ hours: 1 }).startOf('hour')
    const end = start.plus({ hours: 1 })

    createManualBlock({
      variables: {
        input: {
          startUtcISO: start.toISO(),
          endUtcISO: end.toISO(),
          reason,
        },
      },
    })
  }

  if (!effectiveProviderId) {
    return (
      <div className="bg-white border rounded-lg p-6 text-sm text-gray-600">
        Provider profile not found. Please complete onboarding.
      </div>
    )
  }

  return (
    <div className="provider-calendar bg-gray-50 rounded-xl shadow-lg border border-gray-100 overflow-hidden">
      <div className="bg-white px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-gray-800 capitalize">{view} Schedule</h3>
          <p className="text-sm text-gray-500">
            Showing availability for {DateTime.fromISO(currentDateISO, { zone: timezone }).toLocaleString(DateTime.DATE_HUGE)}
          </p>
        </div>
        <button
          onClick={handleManualBlock}
          className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-100 transition-colors border border-red-200"
        >
          Block Time
        </button>
      </div>

      <div className="p-6">
        <BookingsCell
          providerId={effectiveProviderId}
          startISO={dateRange.start}
          endISO={dateRange.end}
          renderSuccess={(bookings: any[]) => (
            <div className="relative">
              {view === 'day' ? (
                <div className="grid grid-cols-[100px_1fr] border-l border-t border-gray-100">
                  {hours.map((hour) => (
                    <React.Fragment key={hour}>
                      <div className="h-20 border-b border-r border-gray-100 flex items-start justify-center pt-2 text-xs font-medium text-gray-400">
                        {DateTime.fromObject({ hour }, { zone: timezone }).toFormat('h a')}
                      </div>
                      <div className="h-20 border-b border-gray-50 relative group hover:bg-white transition-colors">
                        {bookings
                          .filter((b) => {
                            const bStart = DateTime.fromISO(b.startUtc, { zone: 'utc' }).setZone(timezone)
                            return bStart.hour === hour
                          })
                          .map((b) => (
                            <div
                              key={b.id}
                              style={{
                                top: `${(DateTime.fromISO(b.startUtc).minute / 60) * 100}%`,
                                height: `${(DateTime.fromISO(b.endUtc).diff(DateTime.fromISO(b.startUtc), 'minutes').minutes / 60) * 100}%`,
                              }}
                              onClick={() => onSelectBooking?.(b)}
                              className="absolute left-1 right-1 bg-blue-500/10 border-l-4 border-blue-500 p-2 overflow-hidden z-10 rounded-r shadow-sm cursor-pointer hover:bg-blue-500/20 transition-all"
                            >
                              <div className="text-[10px] font-bold text-blue-700 truncate">
                                {b.customerEmail}
                              </div>
                              <div className="text-[9px] text-blue-600/80">
                                {DateTime.fromISO(b.startUtc, { zone: 'utc' }).setZone(timezone).toFormat('h:mm')} - {DateTime.fromISO(b.endUtc, { zone: 'utc' }).setZone(timezone).toFormat('h:mm a')}
                              </div>
                            </div>
                          ))}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                    <div
                      key={d}
                      className="bg-gray-50 p-2 text-center text-xs font-bold text-gray-400 uppercase tracking-wider"
                    >
                      {d}
                    </div>
                  ))}
                  {Array.from({ length: view === 'week' ? 7 : 42 }).map((_, i) => {
                    const cellDate = DateTime.fromISO(dateRange.start, {
                      zone: 'utc',
                    }).setZone(timezone).plus({ days: i })
                    const isOtherMonth = view === 'month' && cellDate.month !== DateTime.fromISO(currentDateISO, { zone: timezone }).month

                    return (
                      <div
                        key={i}
                        className={`bg-white min-h-[120px] p-2 hover:bg-blue-50/30 transition-colors ${isOtherMonth ? 'bg-gray-50/50' : ''
                          }`}
                      >
                        <div className={`text-xs font-bold mb-2 ${isOtherMonth ? 'text-gray-300' : 'text-gray-400'}`}>
                          {cellDate.day}
                        </div>
                        <div className="space-y-1">
                          {bookings
                            .filter((b) =>
                              DateTime.fromISO(b.startUtc, { zone: 'utc' }).setZone(timezone).hasSame(cellDate, 'day')
                            )
                            .map((b) => (
                              <div
                                key={b.id}
                                onClick={() => onSelectBooking?.(b)}
                                className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 truncate shadow-sm cursor-pointer hover:bg-blue-100"
                                title={`${DateTime.fromISO(b.startUtc, { zone: 'utc' }).setZone(timezone).toFormat('h:mm a')} - ${b.customerEmail}`}
                              >
                                <span className="font-bold mr-1">
                                  {DateTime.fromISO(b.startUtc, { zone: 'utc' }).setZone(timezone).toFormat('HH:mm')}
                                </span>
                                {b.customerEmail.split('@')[0]}
                              </div>
                            ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        />
      </div>
    </div>
  )
}

export default ProviderCalendar
