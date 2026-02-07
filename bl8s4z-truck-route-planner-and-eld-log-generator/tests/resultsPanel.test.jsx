import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

const ResultsPanelModule = await import('../repository_after/frontend/src/components/ResultsPanel.jsx')
const ResultsPanel = ResultsPanelModule.default

const mockTripData = {
    route: {
        geometry: {
            type: 'LineString',
            coordinates: [[-87.6298, 41.8781], [-96.7970, 32.7767], [-118.2437, 34.0522]]
        },
        distance_miles: 2100.5,
        estimated_driving_hours: 38.2,
        waypoints: [
            { name: 'Current', coordinates: [-87.6298, 41.8781] },
            { name: 'Pickup', coordinates: [-96.7970, 32.7767] },
            { name: 'Drop-off', coordinates: [-118.2437, 34.0522] }
        ]
    },
    stops: [
        {
            type: 'pickup',
            location: 'Dallas, TX',
            latitude: 32.7767,
            longitude: -96.7970,
            arrival_time: '2024-01-15T10:00:00',
            departure_time: '2024-01-15T11:00:00',
            duration_hours: 1.0,
            notes: 'Loading cargo',
            miles_from_start: 920
        },
        {
            type: 'fuel',
            location: 'Fuel Station',
            latitude: 35.0,
            longitude: -106.0,
            arrival_time: '2024-01-15T18:00:00',
            departure_time: '2024-01-15T18:30:00',
            duration_hours: 0.5,
            notes: 'Fueling',
            miles_from_start: 1000
        },
        {
            type: 'rest',
            location: 'Rest Area',
            latitude: 34.5,
            longitude: -110.0,
            arrival_time: '2024-01-15T22:00:00',
            departure_time: '2024-01-16T08:00:00',
            duration_hours: 10.0,
            notes: '10-hour rest period',
            miles_from_start: 1400
        },
        {
            type: 'dropoff',
            location: 'Los Angeles, CA',
            latitude: 34.0522,
            longitude: -118.2437,
            arrival_time: '2024-01-16T16:00:00',
            departure_time: '2024-01-16T17:00:00',
            duration_hours: 1.0,
            notes: 'Unloading cargo',
            miles_from_start: 2100
        }
    ],
    daily_logs: [
        {
            date: '2024-01-15',
            day_number: 1,
            entries: [
                {
                    status: 'driving',
                    start_time: '2024-01-15T06:00:00',
                    end_time: '2024-01-15T17:00:00',
                    duration_hours: 11.0,
                    location: 'En Route',
                    notes: 'Driving'
                },
                {
                    status: 'sleeper_berth',
                    start_time: '2024-01-15T22:00:00',
                    end_time: '2024-01-16T08:00:00',
                    duration_hours: 10.0,
                    location: 'Rest Area',
                    notes: '10-hour rest period'
                }
            ],
            total_driving_hours: 11.0,
            total_on_duty_hours: 12.5,
            total_off_duty_hours: 1.5,
            total_sleeper_hours: 10.0,
            miles_driven: 605,
            starting_location: 'Chicago, IL',
            ending_location: 'Rest Area',
            cycle_hours_used: 32.5,
            cycle_hours_remaining: 37.5
        },
        {
            date: '2024-01-16',
            day_number: 2,
            entries: [
                {
                    status: 'driving',
                    start_time: '2024-01-16T08:00:00',
                    end_time: '2024-01-16T16:00:00',
                    duration_hours: 8.0,
                    location: 'En Route',
                    notes: 'Driving'
                },
                {
                    status: 'on_duty_not_driving',
                    start_time: '2024-01-16T16:00:00',
                    end_time: '2024-01-16T17:00:00',
                    duration_hours: 1.0,
                    location: 'Drop-off Location',
                    notes: 'Unloading at destination'
                }
            ],
            total_driving_hours: 8.0,
            total_on_duty_hours: 9.0,
            total_off_duty_hours: 15.0,
            total_sleeper_hours: 0,
            miles_driven: 495,
            starting_location: 'Rest Area',
            ending_location: 'Los Angeles, CA',
            cycle_hours_used: 41.5,
            cycle_hours_remaining: 28.5
        }
    ],
    summary: {
        total_distance_miles: 2100.5,
        total_driving_hours: 19.0,
        total_trip_days: 2,
        rest_stops: 1,
        fuel_stops: 1,
        estimated_arrival: '2024-01-16T17:00:00',
        cycle_hours_at_start: 20,
        cycle_hours_at_end: 41.5,
        pickup_duration_hours: 1.0,
        dropoff_duration_hours: 1.0
    }
}

describe('ResultsPanel Component', () => {
    const mockOnTabChange = vi.fn()
    const mockOnClose = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('displays trip summary with total distance', () => {
        render(
            <ResultsPanel
                tripData={mockTripData}
                activeTab="stops"
                onTabChange={mockOnTabChange}
                onClose={mockOnClose}
            />
        )

        expect(screen.getByText('2101')).toBeInTheDocument()
        expect(screen.getByText('Miles')).toBeInTheDocument()
    })

    it('displays total driving hours', () => {
        render(
            <ResultsPanel
                tripData={mockTripData}
                activeTab="stops"
                onTabChange={mockOnTabChange}
                onClose={mockOnClose}
            />
        )

        expect(screen.getByText('19.0h')).toBeInTheDocument()
        expect(screen.getByText('Driving')).toBeInTheDocument()
    })

    it('displays total trip days', () => {
        render(
            <ResultsPanel
                tripData={mockTripData}
                activeTab="stops"
                onTabChange={mockOnTabChange}
                onClose={mockOnClose}
            />
        )

        expect(screen.getByText('2')).toBeInTheDocument()
        expect(screen.getByText('Days')).toBeInTheDocument()
    })

    it('displays fuel stops count', () => {
        render(
            <ResultsPanel
                tripData={mockTripData}
                activeTab="stops"
                onTabChange={mockOnTabChange}
                onClose={mockOnClose}
            />
        )

        expect(screen.getByText('1')).toBeInTheDocument()
        expect(screen.getByText('Fuel Stops')).toBeInTheDocument()
    })

    it('displays stops tab with correct count', () => {
        render(
            <ResultsPanel
                tripData={mockTripData}
                activeTab="stops"
                onTabChange={mockOnTabChange}
                onClose={mockOnClose}
            />
        )

        expect(screen.getByText(/Stops \(4\)/)).toBeInTheDocument()
    })

    it('displays ELD logs tab with correct count', () => {
        render(
            <ResultsPanel
                tripData={mockTripData}
                activeTab="stops"
                onTabChange={mockOnTabChange}
                onClose={mockOnClose}
            />
        )

        expect(screen.getByText(/ELD Logs \(2\)/)).toBeInTheDocument()
    })

    it('shows pickup stop in stops list', () => {
        render(
            <ResultsPanel
                tripData={mockTripData}
                activeTab="stops"
                onTabChange={mockOnTabChange}
                onClose={mockOnClose}
            />
        )

        expect(screen.getByText('Dallas, TX')).toBeInTheDocument()
    })

    it('shows dropoff stop in stops list', () => {
        render(
            <ResultsPanel
                tripData={mockTripData}
                activeTab="stops"
                onTabChange={mockOnTabChange}
                onClose={mockOnClose}
            />
        )

        expect(screen.getByText('Los Angeles, CA')).toBeInTheDocument()
    })

    it('shows rest stop in stops list', () => {
        render(
            <ResultsPanel
                tripData={mockTripData}
                activeTab="stops"
                onTabChange={mockOnTabChange}
                onClose={mockOnClose}
            />
        )

        expect(screen.getByText('Rest Area')).toBeInTheDocument()
    })

    it('shows fuel stop in stops list', () => {
        render(
            <ResultsPanel
                tripData={mockTripData}
                activeTab="stops"
                onTabChange={mockOnTabChange}
                onClose={mockOnClose}
            />
        )

        expect(screen.getByText('Fuel Station')).toBeInTheDocument()
    })

    it('handles tab change to logs', () => {
        render(
            <ResultsPanel
                tripData={mockTripData}
                activeTab="stops"
                onTabChange={mockOnTabChange}
                onClose={mockOnClose}
            />
        )

        const logsTab = screen.getByRole('button', { name: /ELD Logs/i })
        fireEvent.click(logsTab)

        expect(mockOnTabChange).toHaveBeenCalledWith('logs')
    })

    it('handles tab change to stops', () => {
        render(
            <ResultsPanel
                tripData={mockTripData}
                activeTab="logs"
                onTabChange={mockOnTabChange}
                onClose={mockOnClose}
            />
        )

        const stopsTab = screen.getByRole('button', { name: /Stops \(4\)/i })
        fireEvent.click(stopsTab)

        expect(mockOnTabChange).toHaveBeenCalledWith('stops')
    })

    it('handles close button click', () => {
        render(
            <ResultsPanel
                tripData={mockTripData}
                activeTab="stops"
                onTabChange={mockOnTabChange}
                onClose={mockOnClose}
            />
        )

        const closeButton = screen.getByText('✕')
        fireEvent.click(closeButton)

        expect(mockOnClose).toHaveBeenCalled()
    })

    it('displays pickup duration of 1 hour', () => {
        render(
            <ResultsPanel
                tripData={mockTripData}
                activeTab="stops"
                onTabChange={mockOnTabChange}
                onClose={mockOnClose}
            />
        )

        const pickupStop = screen.getByText('Dallas, TX').closest('.stop-item')
        expect(pickupStop).toHaveTextContent('1h')
    })

    it('displays dropoff duration of 1 hour', () => {
        render(
            <ResultsPanel
                tripData={mockTripData}
                activeTab="stops"
                onTabChange={mockOnTabChange}
                onClose={mockOnClose}
            />
        )

        const dropoffStop = screen.getByText('Los Angeles, CA').closest('.stop-item')
        expect(dropoffStop).toHaveTextContent('1h')
    })

    it('displays stop notes', () => {
        render(
            <ResultsPanel
                tripData={mockTripData}
                activeTab="stops"
                onTabChange={mockOnTabChange}
                onClose={mockOnClose}
            />
        )

        expect(screen.getByText('Loading cargo')).toBeInTheDocument()
        expect(screen.getByText('Unloading cargo')).toBeInTheDocument()
    })
})
