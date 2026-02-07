import type { SearchAvailabilityQuery } from 'types/graphql'
import type { CellSuccessProps, CellFailureProps } from '@redwoodjs/web'

export const QUERY = gql`
  query SearchAvailabilityQuery($input: SearchAvailabilityInput!) {
    searchAvailability(input: $input) {
      startUtcISO
      endUtcISO
      startLocalISO
      endLocalISO
    }
  }
`

export const Loading = () => <div>Loading available slots...</div>

export const Empty = () => <div>No availability found for the selected range.</div>

export const Failure = ({ error }: CellFailureProps) => (
  <div style={{ color: 'red' }}>Error: {error?.message}</div>
)

export const Success = ({
  searchAvailability,
  onSelectSlot,
}: CellSuccessProps<SearchAvailabilityQuery> & { onSelectSlot: (slot: any) => void }) => {
  return (
    <div className="grid grid-cols-2 gap-2">
      {searchAvailability.map((slot) => (
        <button
          key={slot.startUtcISO}
          onClick={() => onSelectSlot(slot)}
          className="p-2 border rounded hover:bg-blue-100 text-sm"
        >
          {new Date(slot.startLocalISO).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </button>
      ))}
    </div>
  )
}
