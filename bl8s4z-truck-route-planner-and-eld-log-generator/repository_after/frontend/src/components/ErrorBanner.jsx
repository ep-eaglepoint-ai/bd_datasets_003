function ErrorBanner({ title, message, onDismiss }) {
    return (
        <div className="error-banner">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div className="error-banner-title">⚠️ {title}</div>
                    <div className="error-banner-message">{message}</div>
                </div>
                {onDismiss && (
                    <button
                        onClick={onDismiss}
                        style={{
                            background: 'transparent',
                            color: 'var(--color-danger)',
                            border: 'none',
                            fontSize: '1.25rem',
                            cursor: 'pointer',
                            padding: '0',
                            lineHeight: 1
                        }}
                    >
                        ✕
                    </button>
                )}
            </div>
        </div>
    )
}

export default ErrorBanner
