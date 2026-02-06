import { useMemo } from 'react'
import ELDLogSheet from './ELDLogSheet'

const stopIcons = {
    pickup: '📦',
    dropoff: '🏁',
    rest: '🛏️',
    fuel: '⛽',
    break: '☕'
}

function ResultsPanel({ tripData, activeTab, onTabChange, onClose }) {
    const { route, stops, daily_logs, summary } = tripData

    const formattedArrival = useMemo(() => {
        if (summary?.estimated_arrival) {
            const date = new Date(summary.estimated_arrival)
            return date.toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            })
        }
        return 'N/A'
    }, [summary?.estimated_arrival])

    return (
        <div className="results-panel fade-in">
            <div className="results-header">
                <h3 className="results-title">Trip Plan</h3>
                <button className="results-close" onClick={onClose}>✕</button>
            </div>

            <div className="results-body">
                <div className="summary-grid">
                    <div className="summary-item">
                        <span className="summary-value">{summary?.total_distance_miles?.toFixed(0) || 0}</span>
                        <span className="summary-label">Miles</span>
                    </div>
                    <div className="summary-item">
                        <span className="summary-value">{summary?.total_driving_hours?.toFixed(1) || 0}h</span>
                        <span className="summary-label">Driving</span>
                    </div>
                    <div className="summary-item">
                        <span className="summary-value">{summary?.total_trip_days || 1}</span>
                        <span className="summary-label">Days</span>
                    </div>
                    <div className="summary-item">
                        <span className="summary-value">{summary?.fuel_stops || 0}</span>
                        <span className="summary-label">Fuel Stops</span>
                    </div>
                </div>

                <div style={{
                    padding: '0.75rem',
                    background: 'var(--color-bg-input)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '1rem',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
                        Estimated Arrival
                    </div>
                    <div style={{ fontWeight: 600, color: 'var(--color-success)' }}>
                        {formattedArrival}
                    </div>
                </div>

                <div className="tabs">
                    <button
                        className={`tab ${activeTab === 'stops' ? 'active' : ''}`}
                        onClick={() => onTabChange('stops')}
                    >
                        Stops ({stops?.length || 0})
                    </button>
                    <button
                        className={`tab ${activeTab === 'logs' ? 'active' : ''}`}
                        onClick={() => onTabChange('logs')}
                    >
                        ELD Logs ({daily_logs?.length || 0})
                    </button>
                </div>

                {activeTab === 'stops' && (
                    <div className="stops-list">
                        {stops?.map((stop, index) => (
                            <div key={index} className={`stop-item ${stop.type}`}>
                                <div className={`stop-icon ${stop.type}`}>
                                    {stopIcons[stop.type] || '📍'}
                                </div>
                                <div className="stop-details">
                                    <div className="stop-type">{stop.type.replace('_', ' ')}</div>
                                    <div className="stop-location">{stop.location}</div>
                                    <div className="stop-time">
                                        {stop.duration_hours}h • {stop.miles_from_start?.toFixed(0) || 0} mi from start
                                    </div>
                                    {stop.notes && (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                                            {stop.notes}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'logs' && (
                    <div className="eld-logs">
                        {daily_logs?.map((log, index) => (
                            <ELDLogSheet key={index} log={log} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

export default ResultsPanel
