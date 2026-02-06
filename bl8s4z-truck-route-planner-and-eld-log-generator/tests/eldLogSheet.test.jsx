import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

const ELDLogSheetModule = await import('../repository_after/frontend/src/components/ELDLogSheet.jsx')
const ELDLogSheet = ELDLogSheetModule.default

const mockLog = {
    date: '2024-01-15',
    day_number: 1,
    entries: [
        {
            status: 'off_duty',
            start_time: '2024-01-15T00:00:00',
            end_time: '2024-01-15T06:00:00',
            duration_hours: 6.0,
            location: 'Starting Location',
            notes: 'Pre-trip'
        },
        {
            status: 'on_duty_not_driving',
            start_time: '2024-01-15T06:00:00',
            end_time: '2024-01-15T06:15:00',
            duration_hours: 0.25,
            location: 'Starting Location',
            notes: 'Pre-trip inspection'
        },
        {
            status: 'driving',
            start_time: '2024-01-15T06:15:00',
            end_time: '2024-01-15T10:00:00',
            duration_hours: 3.75,
            location: 'En Route',
            notes: 'Driving to pickup'
        },
        {
            status: 'on_duty_not_driving',
            start_time: '2024-01-15T10:00:00',
            end_time: '2024-01-15T11:00:00',
            duration_hours: 1.0,
            location: 'Pickup Location',
            notes: 'Loading at pickup'
        },
        {
            status: 'driving',
            start_time: '2024-01-15T11:00:00',
            end_time: '2024-01-15T19:00:00',
            duration_hours: 8.0,
            location: 'En Route',
            notes: 'Driving'
        },
        {
            status: 'sleeper_berth',
            start_time: '2024-01-15T19:00:00',
            end_time: '2024-01-15T23:59:59',
            duration_hours: 5.0,
            location: 'Rest Area',
            notes: '10-hour rest period'
        }
    ],
    total_driving_hours: 11.75,
    total_on_duty_hours: 13.0,
    total_off_duty_hours: 6.0,
    total_sleeper_hours: 5.0,
    miles_driven: 646,
    starting_location: 'Chicago, IL',
    ending_location: 'Rest Area',
    cycle_hours_used: 33.0,
    cycle_hours_remaining: 37.0
}

describe('ELDLogSheet Component', () => {
    it('displays the log date', () => {
        render(<ELDLogSheet log={mockLog} />)

        expect(screen.getByText(/Jan 15, 2024/i)).toBeInTheDocument()
    })

    it('displays the day number', () => {
        render(<ELDLogSheet log={mockLog} />)

        expect(screen.getByText('Day 1')).toBeInTheDocument()
    })

    it('displays total driving hours', () => {
        render(<ELDLogSheet log={mockLog} />)

        expect(screen.getByText('11.8h')).toBeInTheDocument()
    })

    it('displays total on-duty hours', () => {
        render(<ELDLogSheet log={mockLog} />)

        expect(screen.getByText('13.0h')).toBeInTheDocument()
    })

    it('displays total off-duty hours', () => {
        render(<ELDLogSheet log={mockLog} />)

        expect(screen.getByText('6.0h')).toBeInTheDocument()
    })

    it('displays total sleeper hours', () => {
        render(<ELDLogSheet log={mockLog} />)

        expect(screen.getByText('5.0h')).toBeInTheDocument()
    })

    it('displays miles driven', () => {
        render(<ELDLogSheet log={mockLog} />)

        expect(screen.getByText('646')).toBeInTheDocument()
    })

    it('displays cycle hours used', () => {
        render(<ELDLogSheet log={mockLog} />)

        expect(screen.getByText('33.0h')).toBeInTheDocument()
    })

    it('displays starting location', () => {
        render(<ELDLogSheet log={mockLog} />)

        expect(screen.getByText(/Chicago, IL/)).toBeInTheDocument()
    })

    it('displays ending location', () => {
        render(<ELDLogSheet log={mockLog} />)

        expect(screen.getByText(/Rest Area/)).toBeInTheDocument()
    })

    it('renders graph with status labels', () => {
        render(<ELDLogSheet log={mockLog} />)

        expect(screen.getByText('OFF')).toBeInTheDocument()
        expect(screen.getByText('SB')).toBeInTheDocument()
        expect(screen.getByText('D')).toBeInTheDocument()
        expect(screen.getByText('ON')).toBeInTheDocument()
    })

    it('renders driving status bars', () => {
        const { container } = render(<ELDLogSheet log={mockLog} />)

        const drivingBars = container.querySelectorAll('.eld-graph-bar.driving')
        expect(drivingBars.length).toBeGreaterThan(0)
    })

    it('renders sleeper berth status bars', () => {
        const { container } = render(<ELDLogSheet log={mockLog} />)

        const sleeperBars = container.querySelectorAll('.eld-graph-bar.sleeper_berth')
        expect(sleeperBars.length).toBeGreaterThan(0)
    })

    it('renders on-duty not driving status bars', () => {
        const { container } = render(<ELDLogSheet log={mockLog} />)

        const onDutyBars = container.querySelectorAll('.eld-graph-bar.on_duty_not_driving')
        expect(onDutyBars.length).toBeGreaterThan(0)
    })

    it('renders off-duty status bars', () => {
        const { container } = render(<ELDLogSheet log={mockLog} />)

        const offDutyBars = container.querySelectorAll('.eld-graph-bar.off_duty')
        expect(offDutyBars.length).toBeGreaterThan(0)
    })

    it('displays hour markers on graph', () => {
        render(<ELDLogSheet log={mockLog} />)

        expect(screen.getByText('00')).toBeInTheDocument()
        expect(screen.getByText('06')).toBeInTheDocument()
        expect(screen.getByText('12')).toBeInTheDocument()
        expect(screen.getByText('18')).toBeInTheDocument()
        expect(screen.getByText('24')).toBeInTheDocument()
    })
})

describe('ELDLogSheet Multi-day Trip', () => {
    const mockMultiDayLog = {
        date: '2024-01-16',
        day_number: 2,
        entries: [
            {
                status: 'sleeper_berth',
                start_time: '2024-01-16T00:00:00',
                end_time: '2024-01-16T05:00:00',
                duration_hours: 5.0,
                location: 'Rest Area',
                notes: 'Continuing rest period'
            },
            {
                status: 'on_duty_not_driving',
                start_time: '2024-01-16T05:00:00',
                end_time: '2024-01-16T05:15:00',
                duration_hours: 0.25,
                location: 'Rest Area',
                notes: 'Pre-trip inspection'
            },
            {
                status: 'driving',
                start_time: '2024-01-16T05:15:00',
                end_time: '2024-01-16T14:00:00',
                duration_hours: 8.75,
                location: 'En Route',
                notes: 'Driving'
            },
            {
                status: 'on_duty_not_driving',
                start_time: '2024-01-16T14:00:00',
                end_time: '2024-01-16T15:00:00',
                duration_hours: 1.0,
                location: 'Drop-off Location',
                notes: 'Unloading at destination'
            },
            {
                status: 'off_duty',
                start_time: '2024-01-16T15:00:00',
                end_time: '2024-01-16T23:59:59',
                duration_hours: 9.0,
                location: 'Drop-off Location',
                notes: 'Off duty'
            }
        ],
        total_driving_hours: 8.75,
        total_on_duty_hours: 10.0,
        total_off_duty_hours: 9.0,
        total_sleeper_hours: 5.0,
        miles_driven: 481,
        starting_location: 'Rest Area',
        ending_location: 'Los Angeles, CA',
        cycle_hours_used: 43.0,
        cycle_hours_remaining: 27.0
    }

    it('displays day 2 correctly', () => {
        render(<ELDLogSheet log={mockMultiDayLog} />)

        expect(screen.getByText('Day 2')).toBeInTheDocument()
    })

    it('displays Jan 16 date', () => {
        render(<ELDLogSheet log={mockMultiDayLog} />)

        expect(screen.getByText(/Jan 16, 2024/i)).toBeInTheDocument()
    })

    it('displays correct driving hours for day 2', () => {
        render(<ELDLogSheet log={mockMultiDayLog} />)

        expect(screen.getByText('8.8h')).toBeInTheDocument()
    })

    it('displays correct ending location for day 2', () => {
        render(<ELDLogSheet log={mockMultiDayLog} />)

        expect(screen.getByText(/Los Angeles, CA/)).toBeInTheDocument()
    })
})
