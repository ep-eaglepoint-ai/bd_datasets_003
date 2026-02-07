function LoadingOverlay() {
    return (
        <div className="loading-overlay">
            <div className="spinner"></div>
            <div className="loading-text">Planning your route...</div>
            <div style={{
                color: 'var(--color-text-muted)',
                fontSize: '0.75rem',
                marginTop: '0.5rem'
            }}>
                Calculating optimal stops and ELD logs
            </div>
        </div>
    )
}

export default LoadingOverlay
