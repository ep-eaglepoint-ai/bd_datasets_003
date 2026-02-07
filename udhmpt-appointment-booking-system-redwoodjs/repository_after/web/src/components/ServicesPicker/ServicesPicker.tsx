import React from 'react'
import { gql, useQuery } from '@redwoodjs/web'

export const QUERY = gql`
  query ServicesQuery($providerId: Int) {
    services(providerId: $providerId) {
      id
      providerId
      name
      durationMinutes
      bufferBeforeMinutes
      bufferAfterMinutes
      capacity
    }
  }
`

const Loading = () => <div>Loading services...</div>

const Empty = () => <div>No services available.</div>

const Failure = ({ error }: { error: Error }) => (
  <div style={{ color: 'red' }}>Error: {error?.message}</div>
)

type ServiceOption = {
    id: number
    providerId: number
    name: string
    durationMinutes: number
    bufferBeforeMinutes?: number
    bufferAfterMinutes?: number
    capacity?: number
}

type ServicesPickerProps = {
  providerId?: number
  selectedService: ServiceOption | null
  onSelectService: (service: ServiceOption) => void
  durationMinutes?: number | null
}

const ServicesPicker: React.FC<ServicesPickerProps> = ({
  providerId,
  selectedService,
  onSelectService,
  durationMinutes,
}) => {
  const { data, loading, error } = useQuery(QUERY, {
    variables: { providerId },
  })

  if (loading) return <Loading />
  if (error) return <Failure error={error} />

  const services: ServiceOption[] = data?.services || []
  if (services.length === 0) return <Empty />

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

export default ServicesPicker
