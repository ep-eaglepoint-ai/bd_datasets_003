import type { BookingsQuery } from 'types/graphql'
import type { CellSuccessProps, CellFailureProps } from '@redwoodjs/web'
import { DateTime } from 'luxon'

export const QUERY = gql`
  query BookingsQuery($providerId: Int, $startISO: String, $endISO: String) {
    bookings(providerId: $providerId, startISO: $startISO, endISO: $endISO) {
      id
      startUtc
      endUtc
      customerEmail
      reference
      status
      notes
    }
  }
`

interface Props extends CellSuccessProps<BookingsQuery> {
    onSelect?: (booking: BookingsQuery['bookings'][0]) => void
    renderSuccess?: (bookings: BookingsQuery['bookings']) => React.ReactNode
}

export const Loading = () => <div className="p-4 animate-pulse text-gray-400">Loading appointments...</div>

export const Empty = () => <div className="p-4 text-center text-gray-500">No appointments found.</div>

export const Failure = ({ error }: CellFailureProps) => (
    <div className="p-4 bg-red-50 text-red-700 rounded-md">Error: {error?.message}</div>
)

export const Success = ({ bookings, onSelect, renderSuccess }: Props) => {
    if (renderSuccess) {
        return <>{renderSuccess(bookings)}</>
    }

    return (
        <div className="space-y-3">
            {bookings.map((booking) => (
                <button
                    key={booking.id}
                    onClick={() => onSelect?.(booking)}
                    data-testid={`open-${booking.id}`}
                    className="w-full text-left p-4 border rounded-lg shadow-sm bg-white hover:border-blue-400 transition-colors group"
                >
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="font-semibold text-gray-900 group-hover:text-blue-600">
                                {booking.customerEmail}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">Ref: {booking.reference}</div>
                            {booking.status !== 'pending' && (
                                <span className={`inline-block mt-2 px-2 py-0.5 text-[10px] font-bold uppercase rounded ${booking.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                                    }`}>
                                    {booking.status}
                                </span>
                            )}
                        </div>
                        <div className="text-right">
                            <div className="text-sm font-bold text-gray-800">
                                {DateTime.fromISO(booking.startUtc).toFormat('h:mm a')}
                            </div>
                            <div className="text-xs text-gray-500">
                                {DateTime.fromISO(booking.startUtc).toFormat('LLL d')}
                            </div>
                        </div>
                    </div>
                </button>
            ))}
        </div>
    )
}

export default Success
