import type { CellSuccessProps, CellFailureProps } from '@redwoodjs/web'

export const QUERY = gql`
  query ServicesQuery($providerId: Int) {
    services(providerId: $providerId) {
      id
      providerId
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

type ServiceOption = {
    id: number
    providerId: number
    name: string
    durationMinutes: number
}

export const Success = ({
    services,
    selectedService,
    onSelectService,
    durationMinutes,
}: CellSuccessProps<{ services: ServiceOption[] }> & {
    selectedService: ServiceOption | null
    onSelectService: (service: ServiceOption) => void
    durationMinutes?: number | null
}) => {
    const filtered = durationMinutes
        ? services.filter((service) => service.durationMinutes === durationMinutes)
        : services

    return (
        <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Select Service</label>
            <select
                value={selectedService?.id || ''}
                onChange={(e) => {
                    const nextId = Number(e.target.value)
                    const next = filtered.find((service) => service.id === nextId)
                    if (next) onSelectService(next)
                }}
                className="w-full px-3 py-2 border rounded-md"
            >
                <option value="">Choose a service...</option>
                {filtered.map((service) => (
                    <option key={service.id} value={service.id}>
                        {service.name} ({service.durationMinutes} min)
                    </option>
                ))}
            </select>
        </div>
    )
}
