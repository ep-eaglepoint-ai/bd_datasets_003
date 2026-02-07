import { useMemo } from 'react'

const statusLabels = {
    off_duty: 'OFF',
    sleeper_berth: 'SB',
    driving: 'D',
    on_duty_not_driving: 'ON'
}

const statusColors = {
    off_duty: 'var(--color-text-muted)',
    sleeper_berth: 'var(--color-info)',
    driving: 'var(--color-success)',
    on_duty_not_driving: 'var(--color-warning)'
}

function ELDLogSheet({ log }) {
    const formattedDate = useMemo(() => {
        const date = new Date(log.date)
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        })
    }, [log.date])

    const graphBars = useMemo(() => {
        const bars = []
        const statusRows = {
            off_duty: 0,
            sleeper_berth: 1,
            driving: 2,
            on_duty_not_driving: 3
        }

        log.entries?.forEach((entry, index) => {
            const startTime = new Date(entry.start_time)
            const endTime = new Date(entry.end_time)

            const startHour = startTime.getHours() + startTime.getMinutes() / 60
            const endHour = endTime.getHours() + endTime.getMinutes() / 60 || 24

            const leftPercent = (startHour / 24) * 100
            const widthPercent = ((endHour - startHour) / 24) * 100

            const row = statusRows[entry.status] ?? 0

            bars.push({
                key: `${entry.status}-${index}`,
                status: entry.status,
                left: `calc(24px + ${leftPercent}% * (100% - 24px) / 100)`,
                width: `calc(${widthPercent}% * (100% - 24px) / 100)`,
                top: `${row * 25}%`
            })
        })

        return bars
    }, [log.entries])

    return (
        <div className="eld-log">
            <div className="eld-log-header">
                <span className="eld-log-date">{formattedDate}</span>
                <span className="eld-log-day">Day {log.day_number}</span>
            </div>

            <div className="eld-log-body">
                <div className="eld-graph">
                    <div className="eld-graph-row" style={{ top: '0' }}>
                        <span className="eld-graph-label">OFF</span>
                    </div>
                    <div className="eld-graph-row" style={{ top: '25%' }}>
                        <span className="eld-graph-label">SB</span>
                    </div>
                    <div className="eld-graph-row" style={{ top: '50%' }}>
                        <span className="eld-graph-label">D</span>
                    </div>
                    <div className="eld-graph-row" style={{ top: '75%', borderBottom: 'none' }}>
                        <span className="eld-graph-label">ON</span>
                    </div>

                    {graphBars.map(bar => (
                        <div
                            key={bar.key}
                            className={`eld-graph-bar ${bar.status}`}
                            style={{
                                left: bar.left,
                                width: bar.width,
                                top: bar.top,
                                background: statusColors[bar.status]
                            }}
                            title={`${statusLabels[bar.status]}: ${bar.status.replace('_', ' ')}`}
                        />
                    ))}

                    <div style={{
                        position: 'absolute',
                        bottom: '-18px',
                        left: '24px',
                        right: '0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.5rem',
                        color: 'var(--color-text-muted)'
                    }}>
                        {[0, 6, 12, 18, 24].map(hour => (
                            <span key={hour}>{hour.toString().padStart(2, '0')}</span>
                        ))}
                    </div>
                </div>

                <div style={{ height: '16px' }} />

                <div className="eld-stats">
                    <div className="eld-stat">
                        <span className="eld-stat-label">Driving</span>
                        <span className="eld-stat-value" style={{ color: 'var(--color-success)' }}>
                            {log.total_driving_hours?.toFixed(1) || 0}h
                        </span>
                    </div>
                    <div className="eld-stat">
                        <span className="eld-stat-label">On Duty</span>
                        <span className="eld-stat-value" style={{ color: 'var(--color-warning)' }}>
                            {log.total_on_duty_hours?.toFixed(1) || 0}h
                        </span>
                    </div>
                    <div className="eld-stat">
                        <span className="eld-stat-label">Sleeper</span>
                        <span className="eld-stat-value" style={{ color: 'var(--color-info)' }}>
                            {log.total_sleeper_hours?.toFixed(1) || 0}h
                        </span>
                    </div>
                    <div className="eld-stat">
                        <span className="eld-stat-label">Off Duty</span>
                        <span className="eld-stat-value" style={{ color: 'var(--color-text-muted)' }}>
                            {log.total_off_duty_hours?.toFixed(1) || 0}h
                        </span>
                    </div>
                    <div className="eld-stat">
                        <span className="eld-stat-label">Miles</span>
                        <span className="eld-stat-value">{log.miles_driven?.toFixed(0) || 0}</span>
                    </div>
                    <div className="eld-stat">
                        <span className="eld-stat-label">Cycle Used</span>
                        <span className="eld-stat-value" style={{
                            color: log.cycle_hours_remaining < 11 ? 'var(--color-danger)' :
                                log.cycle_hours_remaining < 20 ? 'var(--color-warning)' :
                                    'var(--color-primary-light)'
                        }}>
                            {log.cycle_hours_used?.toFixed(1) || 0}h
                        </span>
                    </div>
                </div>

                <div style={{
                    marginTop: '0.75rem',
                    padding: '0.5rem 0.75rem',
                    background: 'var(--color-bg-input)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: 'var(--color-text-secondary)'
                }}>
                    <span>From: {log.starting_location}</span>
                    <span>→</span>
                    <span>To: {log.ending_location}</span>
                </div>
            </div>
        </div>
    )
}

export default ELDLogSheet
