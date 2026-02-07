import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

const ErrorBannerModule = await import('../repository_after/frontend/src/components/ErrorBanner.jsx')
const ErrorBanner = ErrorBannerModule.default

const LoadingOverlayModule = await import('../repository_after/frontend/src/components/LoadingOverlay.jsx')
const LoadingOverlay = LoadingOverlayModule.default

describe('ErrorBanner Component', () => {
    it('displays error title', () => {
        render(
            <ErrorBanner
                title="Validation Error"
                message="Please check your inputs"
            />
        )

        expect(screen.getByText(/Validation Error/i)).toBeInTheDocument()
    })

    it('displays error message', () => {
        render(
            <ErrorBanner
                title="Error"
                message="Current location is required"
            />
        )

        expect(screen.getByText(/Current location is required/i)).toBeInTheDocument()
    })

    it('calls onDismiss when close button clicked', () => {
        const onDismiss = vi.fn()

        render(
            <ErrorBanner
                title="Error"
                message="Something went wrong"
                onDismiss={onDismiss}
            />
        )

        screen.getByText('✕').click()

        expect(onDismiss).toHaveBeenCalled()
    })

    it('does not show close button when onDismiss not provided', () => {
        render(
            <ErrorBanner
                title="Error"
                message="Something went wrong"
            />
        )

        expect(screen.queryByText('✕')).not.toBeInTheDocument()
    })

    it('displays invalid location error', () => {
        render(
            <ErrorBanner
                title="Invalid location"
                message="Could not find location: XYZ123"
            />
        )

        expect(screen.getByText(/Invalid location/i)).toBeInTheDocument()
        expect(screen.getByText(/Could not find location/i)).toBeInTheDocument()
    })

    it('displays cycle exceeded error', () => {
        render(
            <ErrorBanner
                title="Cycle limit exceeded"
                message="You have reached the 70-hour/8-day limit"
            />
        )

        expect(screen.getByText(/Cycle limit exceeded/i)).toBeInTheDocument()
        expect(screen.getByText(/70-hour/i)).toBeInTheDocument()
    })

    it('has proper error styling class', () => {
        const { container } = render(
            <ErrorBanner
                title="Error"
                message="Test error"
            />
        )

        expect(container.querySelector('.error-banner')).toBeInTheDocument()
    })
})

describe('LoadingOverlay Component', () => {
    it('displays loading message', () => {
        render(<LoadingOverlay />)

        expect(screen.getByText(/planning your route/i)).toBeInTheDocument()
    })

    it('displays spinner element', () => {
        const { container } = render(<LoadingOverlay />)

        expect(container.querySelector('.spinner')).toBeInTheDocument()
    })

    it('has overlay styling class', () => {
        const { container } = render(<LoadingOverlay />)

        expect(container.querySelector('.loading-overlay')).toBeInTheDocument()
    })

    it('displays calculating message', () => {
        render(<LoadingOverlay />)

        expect(screen.getByText(/calculating optimal stops/i)).toBeInTheDocument()
    })
})
