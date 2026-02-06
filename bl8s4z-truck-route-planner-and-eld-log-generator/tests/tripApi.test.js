import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
global.fetch = mockFetch

beforeEach(() => {
    mockFetch.mockReset()
})

const { planTrip, validateTrip, checkHealth } = await import('../repository_after/frontend/src/api/tripApi.js')

describe('Trip API - planTrip', () => {
    const validTripData = {
        current_location: 'Chicago, IL',
        pickup_location: 'Dallas, TX',
        dropoff_location: 'Los Angeles, CA',
        current_cycle_hours: 20
    }

    it('sends POST request to correct endpoint', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ route: {}, stops: [], daily_logs: [], summary: {} })
        })

        await planTrip(validTripData)

        expect(mockFetch).toHaveBeenCalledWith(
            '/api/trip/plan/',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            })
        )
    })

    it('sends trip data in request body', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ route: {}, stops: [], daily_logs: [], summary: {} })
        })

        await planTrip(validTripData)

        const call = mockFetch.mock.calls[0]
        const body = JSON.parse(call[1].body)

        expect(body.current_location).toBe('Chicago, IL')
        expect(body.pickup_location).toBe('Dallas, TX')
        expect(body.dropoff_location).toBe('Los Angeles, CA')
        expect(body.current_cycle_hours).toBe(20)
    })

    it('returns trip data on success', async () => {
        const mockResponse = {
            route: { distance_miles: 2100 },
            stops: [{ type: 'pickup' }],
            daily_logs: [{ day_number: 1 }],
            summary: { total_distance_miles: 2100 }
        }

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockResponse)
        })

        const result = await planTrip(validTripData)

        expect(result).toEqual(mockResponse)
    })

    it('throws error with message on validation failure', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            json: () => Promise.resolve({
                error: 'Validation failed',
                message: 'Current location is required'
            })
        })

        await expect(planTrip({})).rejects.toThrow('Current location is required')
    })

    it('throws error with field on location error', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            json: () => Promise.resolve({
                error: 'Invalid location',
                field: 'current_location',
                message: 'Could not find current location'
            })
        })

        try {
            await planTrip(validTripData)
        } catch (error) {
            expect(error.field).toBe('current_location')
        }
    })

    it('throws error when cycle limit exceeded', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            json: () => Promise.resolve({
                error: 'Cycle limit exceeded',
                message: 'You have reached the 70-hour/8-day limit'
            })
        })

        await expect(planTrip({ ...validTripData, current_cycle_hours: 70 }))
            .rejects.toThrow(/70-hour/)
    })

    it('handles network error gracefully', async () => {
        mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'))

        try {
            await planTrip(validTripData)
        } catch (error) {
            expect(error.message).toContain('Unable to connect')
        }
    })
})

describe('Trip API - validateTrip', () => {
    const validTripData = {
        current_location: 'Chicago, IL',
        pickup_location: 'Dallas, TX',
        dropoff_location: 'Los Angeles, CA',
        current_cycle_hours: 20
    }

    it('sends POST request to validate endpoint', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ valid: true, warnings: {} })
        })

        await validateTrip(validTripData)

        expect(mockFetch).toHaveBeenCalledWith(
            '/api/trip/validate/',
            expect.objectContaining({ method: 'POST' })
        )
    })

    it('returns valid: true on success', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ valid: true, warnings: {} })
        })

        const result = await validateTrip(validTripData)

        expect(result.valid).toBe(true)
    })

    it('returns warnings for high cycle hours', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                valid: true,
                warnings: { cycle_hours: 'Consider planning for a reset' }
            })
        })

        const result = await validateTrip({ ...validTripData, current_cycle_hours: 65 })

        expect(result.warnings.cycle_hours).toBeDefined()
    })

    it('returns valid: false with errors on failure', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            json: () => Promise.resolve({
                valid: false,
                errors: { current_location: 'Could not find location' }
            })
        })

        const result = await validateTrip(validTripData)

        expect(result.valid).toBe(false)
        expect(result.errors.current_location).toBeDefined()
    })
})

describe('Trip API - checkHealth', () => {
    it('returns true when backend is healthy', async () => {
        mockFetch.mockResolvedValueOnce({ ok: true })

        const result = await checkHealth()

        expect(result).toBe(true)
    })

    it('returns false when backend is unhealthy', async () => {
        mockFetch.mockResolvedValueOnce({ ok: false })

        const result = await checkHealth()

        expect(result).toBe(false)
    })

    it('returns false on network error', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'))

        const result = await checkHealth()

        expect(result).toBe(false)
    })

    it('calls correct health endpoint', async () => {
        mockFetch.mockResolvedValueOnce({ ok: true })

        await checkHealth()

        expect(mockFetch).toHaveBeenCalledWith('/api/health/')
    })
})
