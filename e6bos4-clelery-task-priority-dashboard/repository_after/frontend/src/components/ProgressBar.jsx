import './ProgressBar.css'

function ProgressBar({ progress, priority = 'default' }) {
    const clampedProgress = Math.min(100, Math.max(0, progress))

    return (
        <div className="progress-container">
            <div
                className={`progress-bar ${priority}`}
                style={{ width: `${clampedProgress}%` }}
                role="progressbar"
                aria-valuenow={clampedProgress}
                aria-valuemin={0}
                aria-valuemax={100}
            />
        </div>
    )
}

export default ProgressBar
