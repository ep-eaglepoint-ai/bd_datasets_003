import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// Mock RouteMap to avoid react-leaflet issues
vi.mock('../repository_after/frontend/src/components/RouteMap.jsx', () => ({
    default: () => <div data-testid="map-container">Route Map Mock</div>
}))

// Mock other dependencies if needed, but RouteMap is the critical one
vi.mock('../repository_after/frontend/src/api/tripApi.js', () => ({
    planTrip: vi.fn(),
    validateTrip: vi.fn(),
    checkHealth: vi.fn()
}))

let App

beforeAll(async () => {
    const mod = await import('../repository_after/frontend/src/App.jsx')
    App = mod.default
})

describe('App Component - State Management', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('renders header with app title', () => {
        render(<App />)
        expect(screen.getByText('TruckRoute Pro')).toBeInTheDocument()
    })

    it('renders trip form initially', () => {
        render(<App />)
        expect(screen.getByLabelText(/current location/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/pickup location/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/drop-off location/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/current cycle hours/i)).toBeInTheDocument()
    })

    it('renders map container', () => {
        render(<App />)
        expect(screen.getByTestId('map-container')).toBeInTheDocument()
    })

    it('displays cycle hours remaining in header', () => {
        render(<App />)
        expect(screen.getByText(/70\.0h remaining/i)).toBeInTheDocument()
    })

    it('updates cycle display when hours change', async () => {
        render(<App />)
        const cycleInput = screen.getByLabelText(/current cycle hours/i)
        fireEvent.change(cycleInput, { target: { value: '30', name: 'current_cycle_hours' } })
        await waitFor(() => {
            expect(screen.getByText(/40\.0h remaining/i)).toBeInTheDocument()
        })
    })

    it('does not show results panel initially', () => {
        render(<App />)
        expect(screen.queryByText('Trip Plan')).not.toBeInTheDocument()
    })

    it('does not show Plan New Trip button initially', () => {
        render(<App />)
        expect(screen.queryByText('Plan New Trip')).not.toBeInTheDocument()
    })
})

describe('App Component - Form Interactions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('updates current location on input', async () => {
        render(<App />)
        const input = screen.getByLabelText(/current location/i)
        fireEvent.change(input, { target: { value: 'Chicago, IL', name: 'current_location' } })
        expect(input.value).toBe('Chicago, IL')
    })

    it('updates pickup location on input', async () => {
        render(<App />)
        const input = screen.getByLabelText(/pickup location/i)
        fireEvent.change(input, { target: { value: 'Dallas, TX', name: 'pickup_location' } })
        expect(input.value).toBe('Dallas, TX')
    })

    it('updates dropoff location on input', async () => {
        render(<App />)
        const input = screen.getByLabelText(/drop-off location/i)
        fireEvent.change(input, { target: { value: 'Los Angeles, CA', name: 'dropoff_location' } })
        expect(input.value).toBe('Los Angeles, CA')
    })

    it('updates cycle hours on input', async () => {
        render(<App />)
        const input = screen.getByLabelText(/current cycle hours/i)
        fireEvent.change(input, { target: { value: '25', name: 'current_cycle_hours' } })
        expect(input.value).toBe('25')
    })
})

describe('App Component - Trip Planning Flow', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { planTrip } = await import('../repository_after/frontend/src/api/tripApi.js')
        planTrip.mockReset()
    })

    it('shows loading overlay during trip planning', async () => {
        const { planTrip } = await import('../repository_after/frontend/src/api/tripApi.js')
        planTrip.mockImplementation(() => new Promise(() => { }))

        render(<App />)

        fireEvent.change(screen.getByLabelText(/current location/i),
            { target: { value: 'Chicago, IL', name: 'current_location' } })
        fireEvent.change(screen.getByLabelText(/pickup location/i),
            { target: { value: 'Dallas, TX', name: 'pickup_location' } })
        fireEvent.change(screen.getByLabelText(/drop-off location/i),
            { target: { value: 'Los Angeles, CA', name: 'dropoff_location' } })
        fireEvent.change(screen.getByLabelText(/current cycle hours/i),
            { target: { value: '20', name: 'current_cycle_hours' } })

        fireEvent.click(screen.getByRole('button', { name: /plan route/i }))

        await waitFor(() => {
            expect(screen.getByText(/planning your route/i)).toBeInTheDocument()
        })
    })

    it('displays results panel after successful trip planning', async () => {
        const { planTrip } = await import('../repository_after/frontend/src/api/tripApi.js')
        planTrip.mockResolvedValue({
            route: { distance_miles: 2100, geometry: { coordinates: [] }, waypoints: [] },
            stops: [],
            daily_logs: [],
            summary: { total_distance_miles: 2100, total_driving_hours: 38, total_trip_days: 2, fuel_stops: 2 }
        })

        render(<App />)

        fireEvent.change(screen.getByLabelText(/current location/i),
            { target: { value: 'Chicago, IL', name: 'current_location' } })
        fireEvent.change(screen.getByLabelText(/pickup location/i),
            { target: { value: 'Dallas, TX', name: 'pickup_location' } })
        fireEvent.change(screen.getByLabelText(/drop-off location/i),
            { target: { value: 'Los Angeles, CA', name: 'dropoff_location' } })
        fireEvent.change(screen.getByLabelText(/current cycle hours/i),
            { target: { value: '20', name: 'current_cycle_hours' } })

        fireEvent.click(screen.getByRole('button', { name: /plan route/i }))

        await waitFor(() => {
            expect(screen.getByText('Trip Plan')).toBeInTheDocument()
        })
    })

    it('shows Plan New Trip button after trip is planned', async () => {
        const { planTrip } = await import('../repository_after/frontend/src/api/tripApi.js')
        planTrip.mockResolvedValue({
            route: { distance_miles: 2100, geometry: { coordinates: [] }, waypoints: [] },
            stops: [],
            daily_logs: [],
            summary: { total_distance_miles: 2100, total_driving_hours: 38, total_trip_days: 2, fuel_stops: 2 }
        })

        render(<App />)

        fireEvent.change(screen.getByLabelText(/current location/i),
            { target: { value: 'Chicago, IL', name: 'current_location' } })
        fireEvent.change(screen.getByLabelText(/pickup location/i),
            { target: { value: 'Dallas, TX', name: 'pickup_location' } })
        fireEvent.change(screen.getByLabelText(/drop-off location/i),
            { target: { value: 'Los Angeles, CA', name: 'dropoff_location' } })
        fireEvent.change(screen.getByLabelText(/current cycle hours/i),
            { target: { value: '20', name: 'current_cycle_hours' } })

        fireEvent.click(screen.getByRole('button', { name: /plan route/i }))

        await waitFor(() => {
            expect(screen.getByText('Plan New Trip')).toBeInTheDocument()
        })
    })

    it('displays error banner on API error', async () => {
        const { planTrip } = await import('../repository_after/frontend/src/api/tripApi.js')
        const error = new Error('Could not find location: Invalid City')
        error.title = 'Invalid location'
        planTrip.mockRejectedValue(error)

        render(<App />)

        fireEvent.change(screen.getByLabelText(/current location/i),
            { target: { value: 'Invalid City', name: 'current_location' } })
        fireEvent.change(screen.getByLabelText(/pickup location/i),
            { target: { value: 'Dallas, TX', name: 'pickup_location' } })
        fireEvent.change(screen.getByLabelText(/drop-off location/i),
            { target: { value: 'Los Angeles, CA', name: 'dropoff_location' } })
        fireEvent.change(screen.getByLabelText(/current cycle hours/i),
            { target: { value: '20', name: 'current_cycle_hours' } })

        fireEvent.click(screen.getByRole('button', { name: /plan route/i }))

        await waitFor(() => {
            expect(screen.getByText(/Invalid location/i)).toBeInTheDocument()
        })
    })
})

describe('App Component - Responsive Design', () => {
    it('renders with proper layout structure', () => {
        const { container } = render(<App />)
        expect(container.querySelector('.app')).toBeInTheDocument()
        expect(container.querySelector('.header')).toBeInTheDocument()
        expect(container.querySelector('.sidebar')).toBeInTheDocument()
        expect(container.querySelector('.map-container')).toBeInTheDocument()
    })

    it('sidebar contains form sections', () => {
        const { container } = render(<App />)
        const formSections = container.querySelectorAll('.form-section')
        expect(formSections.length).toBeGreaterThanOrEqual(1)
    })
})
