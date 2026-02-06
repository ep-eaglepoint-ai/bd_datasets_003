import { useState, useCallback } from 'react'

function TripForm({ formData, onChange, onSubmit, loading, error }) {
    const [errors, setErrors] = useState({})

    const validateForm = useCallback(() => {
        const newErrors = {}

        if (!formData.current_location || formData.current_location.trim().length < 2) {
            newErrors.current_location = 'Current location is required (min 2 characters)'
        }

        if (!formData.pickup_location || formData.pickup_location.trim().length < 2) {
            newErrors.pickup_location = 'Pickup location is required (min 2 characters)'
        }

        if (!formData.dropoff_location || formData.dropoff_location.trim().length < 2) {
            newErrors.dropoff_location = 'Drop-off location is required (min 2 characters)'
        }

        const cycleHours = parseFloat(formData.current_cycle_hours)
        if (isNaN(cycleHours) || cycleHours < 0) {
            newErrors.current_cycle_hours = 'Cycle hours must be 0 or greater'
        } else if (cycleHours > 70) {
            newErrors.current_cycle_hours = 'Cycle hours cannot exceed 70 (8-day limit reached)'
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }, [formData])

    const handleSubmit = useCallback((e) => {
        e.preventDefault()

        if (validateForm()) {
            onSubmit({
                ...formData,
                current_cycle_hours: parseFloat(formData.current_cycle_hours) || 0
            })
        }
    }, [formData, validateForm, onSubmit])

    const handleInputChange = useCallback((e) => {
        const { name, value } = e.target
        onChange(name, value)

        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: null }))
        }
    }, [onChange, errors])

    const cycleHoursRemaining = 70 - (parseFloat(formData.current_cycle_hours) || 0)
    const cycleStatus = cycleHoursRemaining < 11 ? 'danger' :
        cycleHoursRemaining < 20 ? 'warning' : ''

    return (
        <form onSubmit={handleSubmit}>
            <div className="form-section">
                <h3 className="form-section-title">
                    📍 Locations
                </h3>

                <div className="form-group">
                    <label className="form-label" htmlFor="current_location">
                        Current Location
                    </label>
                    <input
                        type="text"
                        id="current_location"
                        name="current_location"
                        className={`form-input ${errors.current_location || (error?.field === 'current_location') ? 'error' : ''}`}
                        placeholder="Enter your current location"
                        value={formData.current_location}
                        onChange={handleInputChange}
                        disabled={loading}
                    />
                    {errors.current_location && (
                        <div className="form-error">⚠️ {errors.current_location}</div>
                    )}
                </div>

                <div className="form-group">
                    <label className="form-label" htmlFor="pickup_location">
                        Pickup Location
                    </label>
                    <input
                        type="text"
                        id="pickup_location"
                        name="pickup_location"
                        className={`form-input ${errors.pickup_location || (error?.field === 'pickup_location') ? 'error' : ''}`}
                        placeholder="Enter pickup address"
                        value={formData.pickup_location}
                        onChange={handleInputChange}
                        disabled={loading}
                    />
                    {errors.pickup_location && (
                        <div className="form-error">⚠️ {errors.pickup_location}</div>
                    )}
                </div>

                <div className="form-group">
                    <label className="form-label" htmlFor="dropoff_location">
                        Drop-off Location
                    </label>
                    <input
                        type="text"
                        id="dropoff_location"
                        name="dropoff_location"
                        className={`form-input ${errors.dropoff_location || (error?.field === 'dropoff_location') ? 'error' : ''}`}
                        placeholder="Enter destination address"
                        value={formData.dropoff_location}
                        onChange={handleInputChange}
                        disabled={loading}
                    />
                    {errors.dropoff_location && (
                        <div className="form-error">⚠️ {errors.dropoff_location}</div>
                    )}
                </div>
            </div>

            <div className="form-section">
                <h3 className="form-section-title">
                    ⏱️ Driving Hours
                </h3>

                <div className="form-group">
                    <label className="form-label" htmlFor="current_cycle_hours">
                        Current Cycle Hours Used
                    </label>
                    <input
                        type="number"
                        id="current_cycle_hours"
                        name="current_cycle_hours"
                        className={`form-input ${errors.current_cycle_hours ? 'error' : ''}`}
                        placeholder="0"
                        min="0"
                        max="70"
                        step="0.5"
                        value={formData.current_cycle_hours}
                        onChange={handleInputChange}
                        disabled={loading}
                    />
                    {errors.current_cycle_hours && (
                        <div className="form-error">⚠️ {errors.current_cycle_hours}</div>
                    )}

                    <div className="cycle-info">
                        <span className="cycle-label">Hours Remaining (70hr/8day)</span>
                        <span className={`cycle-value ${cycleStatus}`}>
                            {cycleHoursRemaining.toFixed(1)}h
                        </span>
                    </div>
                </div>
            </div>

            <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={loading}
            >
                {loading ? (
                    <>
                        <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }}></span>
                        Planning Route...
                    </>
                ) : (
                    <>
                        🗺️ Plan Route
                    </>
                )}
            </button>
        </form>
    )
}

export default TripForm
