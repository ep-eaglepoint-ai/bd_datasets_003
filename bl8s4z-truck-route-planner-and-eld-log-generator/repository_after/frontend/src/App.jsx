import { useState, useCallback, useReducer } from 'react'
import TripForm from './components/TripForm'
import RouteMap from './components/RouteMap'
import ResultsPanel from './components/ResultsPanel'
import LoadingOverlay from './components/LoadingOverlay'
import ErrorBanner from './components/ErrorBanner'
import { planTrip } from './api/tripApi'

const initialState = {
    tripData: null,
    loading: false,
    error: null,
    activeTab: 'stops',
    formData: {
        current_location: '',
        pickup_location: '',
        dropoff_location: '',
        current_cycle_hours: 0
    }
}

function tripReducer(state, action) {
    switch (action.type) {
        case 'SET_LOADING':
            return { ...state, loading: action.payload, error: null }
        case 'SET_TRIP_DATA':
            return { ...state, tripData: action.payload, loading: false, error: null }
        case 'SET_ERROR':
            return { ...state, error: action.payload, loading: false }
        case 'CLEAR_ERROR':
            return { ...state, error: null }
        case 'SET_ACTIVE_TAB':
            return { ...state, activeTab: action.payload }
        case 'UPDATE_FORM':
            return { ...state, formData: { ...state.formData, ...action.payload } }
        case 'RESET':
            return { ...initialState, formData: state.formData }
        default:
            return state
    }
}

function App() {
    const [state, dispatch] = useReducer(tripReducer, initialState)
    const { tripData, loading, error, activeTab, formData } = state

    const handleFormChange = useCallback((field, value) => {
        dispatch({ type: 'UPDATE_FORM', payload: { [field]: value } })
    }, [])

    const handleSubmit = useCallback(async (formValues) => {
        dispatch({ type: 'SET_LOADING', payload: true })

        try {
            const result = await planTrip(formValues)
            dispatch({ type: 'SET_TRIP_DATA', payload: result })
        } catch (err) {
            dispatch({
                type: 'SET_ERROR',
                payload: {
                    title: err.title || 'Trip Planning Failed',
                    message: err.message || 'An unexpected error occurred while planning your trip.',
                    field: err.field
                }
            })
        }
    }, [])

    const handleClearError = useCallback(() => {
        dispatch({ type: 'CLEAR_ERROR' })
    }, [])

    const handleTabChange = useCallback((tab) => {
        dispatch({ type: 'SET_ACTIVE_TAB', payload: tab })
    }, [])

    const handleReset = useCallback(() => {
        dispatch({ type: 'RESET' })
    }, [])

    const cycleHoursRemaining = 70 - (formData.current_cycle_hours || 0)

    return (
        <div className="app">
            <header className="header">
                <div className="header-content">
                    <div className="logo">
                        <div className="logo-icon">🚛</div>
                        <span className="logo-text">TruckRoute Pro</span>
                    </div>
                    <div className="cycle-display" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        color: 'var(--color-text-secondary)',
                        fontSize: '0.875rem'
                    }}>
                        <span>Cycle: <strong style={{
                            color: cycleHoursRemaining < 11 ? 'var(--color-danger)' :
                                cycleHoursRemaining < 20 ? 'var(--color-warning)' :
                                    'var(--color-success)'
                        }}>{cycleHoursRemaining.toFixed(1)}h remaining</strong></span>
                    </div>
                </div>
            </header>

            <main className="main-content">
                <aside className="sidebar">
                    {error && (
                        <ErrorBanner
                            title={error.title}
                            message={error.message}
                            onDismiss={handleClearError}
                        />
                    )}

                    <TripForm
                        formData={formData}
                        onChange={handleFormChange}
                        onSubmit={handleSubmit}
                        loading={loading}
                        error={error}
                    />

                    {tripData && (
                        <button
                            className="btn btn-secondary btn-block"
                            onClick={handleReset}
                        >
                            Plan New Trip
                        </button>
                    )}
                </aside>

                <div className="map-container">
                    <RouteMap
                        route={tripData?.route}
                        stops={tripData?.stops}
                    />

                    {tripData && (
                        <ResultsPanel
                            tripData={tripData}
                            activeTab={activeTab}
                            onTabChange={handleTabChange}
                            onClose={handleReset}
                        />
                    )}

                    {loading && <LoadingOverlay />}
                </div>
            </main>
        </div>
    )
}

export default App
