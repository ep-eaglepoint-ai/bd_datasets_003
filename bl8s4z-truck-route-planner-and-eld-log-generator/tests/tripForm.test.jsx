import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

const TripFormModule = await import('../repository_after/frontend/src/components/TripForm.jsx')
const TripForm = TripFormModule.default

describe('TripForm Component', () => {
    const mockFormData = {
        current_location: '',
        pickup_location: '',
        dropoff_location: '',
        current_cycle_hours: 0
    }

    const mockOnChange = vi.fn()
    const mockOnSubmit = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('renders all required input fields', () => {
        render(
            <TripForm
                formData={mockFormData}
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
                loading={false}
            />
        )

        expect(screen.getByLabelText(/current location/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/pickup location/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/drop-off location/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/current cycle hours/i)).toBeInTheDocument()
    })

    it('accepts current location input', () => {
        render(
            <TripForm
                formData={mockFormData}
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
                loading={false}
            />
        )

        const input = screen.getByLabelText(/current location/i)
        fireEvent.change(input, { target: { value: 'Chicago, IL', name: 'current_location' } })

        expect(mockOnChange).toHaveBeenCalledWith('current_location', 'Chicago, IL')
    })

    it('accepts pickup location input', () => {
        render(
            <TripForm
                formData={mockFormData}
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
                loading={false}
            />
        )

        const input = screen.getByLabelText(/pickup location/i)
        fireEvent.change(input, { target: { value: 'Dallas, TX', name: 'pickup_location' } })

        expect(mockOnChange).toHaveBeenCalledWith('pickup_location', 'Dallas, TX')
    })

    it('accepts dropoff location input', () => {
        render(
            <TripForm
                formData={mockFormData}
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
                loading={false}
            />
        )

        const input = screen.getByLabelText(/drop-off location/i)
        fireEvent.change(input, { target: { value: 'Los Angeles, CA', name: 'dropoff_location' } })

        expect(mockOnChange).toHaveBeenCalledWith('dropoff_location', 'Los Angeles, CA')
    })

    it('accepts current cycle hours input', () => {
        render(
            <TripForm
                formData={mockFormData}
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
                loading={false}
            />
        )

        const input = screen.getByLabelText(/current cycle hours/i)
        fireEvent.change(input, { target: { value: '25', name: 'current_cycle_hours' } })

        expect(mockOnChange).toHaveBeenCalledWith('current_cycle_hours', '25')
    })

    it('displays remaining cycle hours', () => {
        const formDataWithHours = { ...mockFormData, current_cycle_hours: 30 }

        render(
            <TripForm
                formData={formDataWithHours}
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
                loading={false}
            />
        )

        expect(screen.getByText(/40\.0h/)).toBeInTheDocument()
    })

    it('validates empty current location', async () => {
        render(
            <TripForm
                formData={mockFormData}
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
                loading={false}
            />
        )

        const submitButton = screen.getByRole('button', { name: /plan route/i })
        fireEvent.click(submitButton)

        await waitFor(() => {
            expect(screen.getByText(/current location is required/i)).toBeInTheDocument()
        })
        expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it('validates empty pickup location', async () => {
        const formData = { ...mockFormData, current_location: 'Chicago, IL' }

        render(
            <TripForm
                formData={formData}
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
                loading={false}
            />
        )

        const submitButton = screen.getByRole('button', { name: /plan route/i })
        fireEvent.click(submitButton)

        await waitFor(() => {
            expect(screen.getByText(/pickup location is required/i)).toBeInTheDocument()
        })
        expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it('validates empty dropoff location', async () => {
        const formData = {
            ...mockFormData,
            current_location: 'Chicago, IL',
            pickup_location: 'Dallas, TX'
        }

        render(
            <TripForm
                formData={formData}
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
                loading={false}
            />
        )

        const submitButton = screen.getByRole('button', { name: /plan route/i })
        fireEvent.click(submitButton)

        await waitFor(() => {
            expect(screen.getByText(/drop-off location is required/i)).toBeInTheDocument()
        })
        expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it('does not submit form when cycle hours exceed 70', async () => {
        const formData = {
            current_location: 'Chicago, IL',
            pickup_location: 'Dallas, TX',
            dropoff_location: 'Los Angeles, CA',
            current_cycle_hours: 75
        }

        render(
            <TripForm
                formData={formData}
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
                loading={false}
            />
        )

        const submitButton = screen.getByRole('button', { name: /plan route/i })
        fireEvent.click(submitButton)

        await waitFor(() => {
            expect(mockOnSubmit).not.toHaveBeenCalled()
        })
    })

    it('submits form with valid data', async () => {
        const validFormData = {
            current_location: 'Chicago, IL',
            pickup_location: 'Dallas, TX',
            dropoff_location: 'Los Angeles, CA',
            current_cycle_hours: 20
        }

        render(
            <TripForm
                formData={validFormData}
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
                loading={false}
            />
        )

        const submitButton = screen.getByRole('button', { name: /plan route/i })
        fireEvent.click(submitButton)

        await waitFor(() => {
            expect(mockOnSubmit).toHaveBeenCalledWith({
                ...validFormData,
                current_cycle_hours: 20
            })
        })
    })

    it('disables form inputs when loading', () => {
        render(
            <TripForm
                formData={mockFormData}
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
                loading={true}
            />
        )

        expect(screen.getByLabelText(/current location/i)).toBeDisabled()
        expect(screen.getByLabelText(/pickup location/i)).toBeDisabled()
        expect(screen.getByLabelText(/drop-off location/i)).toBeDisabled()
        expect(screen.getByLabelText(/current cycle hours/i)).toBeDisabled()
    })

    it('disables submit button when loading', () => {
        render(
            <TripForm
                formData={mockFormData}
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
                loading={true}
            />
        )

        const submitButton = screen.getByRole('button')
        expect(submitButton).toBeDisabled()
    })

    it('shows warning color when cycle hours are low', () => {
        const formData = { ...mockFormData, current_cycle_hours: 55 }

        render(
            <TripForm
                formData={formData}
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
                loading={false}
            />
        )

        const cycleValue = screen.getByText(/15\.0h/)
        expect(cycleValue).toHaveClass('warning')
    })

    it('shows danger color when cycle hours are critical', () => {
        const formData = { ...mockFormData, current_cycle_hours: 65 }

        render(
            <TripForm
                formData={formData}
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
                loading={false}
            />
        )

        const cycleValue = screen.getByText(/5\.0h/)
        expect(cycleValue).toHaveClass('danger')
    })
})
