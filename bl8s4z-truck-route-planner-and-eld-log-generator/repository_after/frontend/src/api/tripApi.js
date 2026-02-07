const API_BASE_URL = '/api'

export async function planTrip(tripData) {
    try {
        const response = await fetch(`${API_BASE_URL}/trip/plan/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(tripData),
        })

        const data = await response.json()

        if (!response.ok) {
            const error = new Error(data.message || 'Failed to plan trip')
            error.title = data.error || 'Error'
            error.field = data.field || null
            error.details = data.details || null
            throw error
        }

        return data
    } catch (err) {
        if (err.name === 'TypeError' && err.message.includes('fetch')) {
            const error = new Error('Unable to connect to the server. Please check your connection.')
            error.title = 'Connection Error'
            throw error
        }
        throw err
    }
}

export async function validateTrip(tripData) {
    try {
        const response = await fetch(`${API_BASE_URL}/trip/validate/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(tripData),
        })

        const data = await response.json()

        if (!response.ok) {
            return { valid: false, errors: data.errors }
        }

        return { valid: true, warnings: data.warnings }
    } catch (err) {
        return { valid: false, errors: { general: 'Unable to validate trip' } }
    }
}

export async function checkHealth() {
    try {
        const response = await fetch(`${API_BASE_URL}/health/`)
        return response.ok
    } catch {
        return false
    }
}
