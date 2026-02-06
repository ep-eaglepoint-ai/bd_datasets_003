import type { ServicesQuery } from 'types/graphql'
import type { CellSuccessProps, CellFailureProps } from '@redwoodjs/web'

export const QUERY = gql`
  query ServicesQuery($providerId: Int!) {
    services(providerId: $providerId) {
      id
      name
      durationMinutes
    }
  }
`

export const Loading = () => <div>Loading services...</div>

export const Empty = () => <div>No services available.</div>

export const Failure = ({ error }: CellFailureProps) => (
    <div style={{ color: 'red' }}>Error: {error?.message}</div>
)

export const Success = ({
    services,
    selectedService,
    onSelectService,
}: CellSuccessProps<ServicesQuery> & {
    selectedService: number | null
    onSelectService: (id: number) => void
}) => {
    return (
        <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Select Service</label>
            <select
                value={selectedService || ''}
                onChange={(e) => onSelectService(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-md"
            >
                <option value="">Choose a service...</option>
                {services.map((service) => (
                    <option key={service.id} value={service.id}>
                        {service.name} ({service.durationMinutes} min)
                    </option>
                ))}
            </select>
        </div>
    )
}
