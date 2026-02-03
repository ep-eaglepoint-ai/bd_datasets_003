import ProgressBar from './ProgressBar'
import './TaskList.css'

function TaskList({ tasks, onDelete }) {
    if (!tasks || tasks.length === 0) {
        return (
            <div className="empty-state glass-card">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M9 9h6M9 13h6M9 17h4" />
                </svg>
                <h3>No Tasks Yet</h3>
                <p>Create a new task to get started with the priority queue</p>
            </div>
        )
    }

    const getStatusBadgeClass = (status) => {
        const statusMap = {
            'PENDING': 'badge-pending',
            'STARTED': 'badge-started',
            'PROGRESS': 'badge-progress',
            'SUCCESS': 'badge-success',
            'FAILURE': 'badge-failure',
            'RETRY': 'badge-retry',
        }
        return statusMap[status] || 'badge-pending'
    }

    const getPriorityBadgeClass = (priority) => {
        const priorityMap = {
            'high': 'badge-high',
            'medium': 'badge-medium',
            'low': 'badge-low',
        }
        return priorityMap[priority] || 'badge-medium'
    }

    const formatDate = (dateString) => {
        if (!dateString) return '-'
        const date = new Date(dateString)
        return date.toLocaleString()
    }

    const getTaskTypeIcon = (taskType) => {
        switch (taskType) {
            case 'data_export':
                return (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="7,10 12,15 17,10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                )
            case 'pdf_generation':
                return (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <polyline points="14,2 14,8 20,8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                )
            case 'report_generation':
                return (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="20" x2="18" y2="10" />
                        <line x1="12" y1="20" x2="12" y2="4" />
                        <line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                )
            default:
                return (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <path d="M9 9h6M9 13h6M9 17h4" />
                    </svg>
                )
        }
    }

    return (
        <div className="task-list">
            {tasks.map((task, index) => (
                <div
                    key={task.task_id}
                    className={`task-card glass-card priority-${task.priority} animate-fade-in`}
                    style={{ animationDelay: `${index * 50}ms` }}
                >
                    <div className="task-header">
                        <div className="task-icon">
                            {getTaskTypeIcon(task.task_type)}
                        </div>
                        <div className="task-info">
                            <h4 className="task-name">{task.name}</h4>
                            <div className="task-meta">
                                <span className="task-id" title={task.task_id}>
                                    ID: {task.task_id.substring(0, 8)}...
                                </span>
                                <span className="task-type">{task.task_type.replace('_', ' ')}</span>
                            </div>
                        </div>
                        <div className="task-badges">
                            <span className={`badge ${getPriorityBadgeClass(task.priority)}`}>
                                {task.priority}
                            </span>
                            <span className={`badge ${getStatusBadgeClass(task.status)}`}>
                                {task.status}
                            </span>
                        </div>
                    </div>

                    <div className="task-body">
                        {/* Progress section */}
                        {['STARTED', 'PROGRESS', 'SUCCESS'].includes(task.status) && (
                            <div className="task-progress">
                                <div className="progress-header">
                                    <span className="progress-label">
                                        {task.progress_message || `Progress: ${task.progress}%`}
                                    </span>
                                    <span className="progress-value">{task.progress}%</span>
                                </div>
                                <ProgressBar
                                    progress={task.progress}
                                    priority={task.priority}
                                />
                            </div>
                        )}

                        {/* Error display for failed tasks */}
                        {task.status === 'FAILURE' && task.error && (
                            <div className="task-error">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M12 8v4M12 16h.01" />
                                </svg>
                                <span className="error-message">{task.error}</span>
                            </div>
                        )}

                        {/* Result display for successful tasks */}
                        {task.status === 'SUCCESS' && task.result && (
                            <div className="task-result">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                                    <path d="M22 4L12 14.01l-3-3" />
                                </svg>
                                <span className="result-message">
                                    {typeof task.result === 'object'
                                        ? JSON.stringify(task.result)
                                        : task.result.substring(0, 100)}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="task-footer">
                        <div className="task-timestamps">
                            <span className="timestamp">
                                <span className="timestamp-label">Created:</span>
                                {formatDate(task.created_at)}
                            </span>
                            {task.completed_at && (
                                <span className="timestamp">
                                    <span className="timestamp-label">Completed:</span>
                                    {formatDate(task.completed_at)}
                                </span>
                            )}
                        </div>
                        <div className="task-actions">
                            <button
                                className="btn-icon"
                                onClick={() => onDelete(task.task_id)}
                                title="Delete task"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}

export default TaskList
