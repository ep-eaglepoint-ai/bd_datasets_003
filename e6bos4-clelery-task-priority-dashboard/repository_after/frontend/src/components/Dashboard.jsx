import { useState } from 'react'
import TaskList from './TaskList'
import TaskForm from './TaskForm'
import './Dashboard.css'

function Dashboard({
    tasks,
    loading,
    error,
    wsConnected,
    onSubmitTask,
    onSubmitFailingTask,
    onDeleteTask,
    onRefresh,
}) {
    const [showForm, setShowForm] = useState(false)

    // Calculate stats
    const stats = {
        total: tasks.length,
        pending: tasks.filter(t => t.status === 'PENDING').length,
        inProgress: tasks.filter(t => ['STARTED', 'PROGRESS'].includes(t.status)).length,
        success: tasks.filter(t => t.status === 'SUCCESS').length,
        failed: tasks.filter(t => t.status === 'FAILURE').length,
    }

    const handleSubmit = async (taskData, shouldFail) => {
        try {
            if (shouldFail) {
                await onSubmitFailingTask(taskData)
            } else {
                await onSubmitTask(taskData)
            }
            setShowForm(false)
        } catch (err) {
            console.error('Submit error:', err)
        }
    }

    return (
        <div className="dashboard">
            {/* Header */}
            <header className="dashboard-header">
                <div className="header-content">
                    <div className="header-title">
                        <h1>Task Priority Dashboard</h1>
                        <p>Distributed background task management with Celery</p>
                    </div>
                    <div className="header-actions">
                        <div className={`connection-status ${wsConnected ? 'connected' : 'disconnected'}`}>
                            <span className="status-dot"></span>
                            {wsConnected ? 'Live' : 'Polling'}
                        </div>
                        <button className="btn btn-secondary" onClick={onRefresh}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                            </svg>
                            Refresh
                        </button>
                        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 5v14M5 12h14" />
                            </svg>
                            New Task
                        </button>
                    </div>
                </div>
            </header>

            {/* Stats Cards */}
            <div className="stats-grid">
                <div className="stat-card glass-card">
                    <div className="stat-icon total">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="7" height="7" />
                            <rect x="14" y="3" width="7" height="7" />
                            <rect x="14" y="14" width="7" height="7" />
                            <rect x="3" y="14" width="7" height="7" />
                        </svg>
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.total}</span>
                        <span className="stat-label">Total Tasks</span>
                    </div>
                </div>

                <div className="stat-card glass-card">
                    <div className="stat-icon pending">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 6v6l4 2" />
                        </svg>
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.pending}</span>
                        <span className="stat-label">Pending</span>
                    </div>
                </div>

                <div className="stat-card glass-card">
                    <div className="stat-icon progress">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                        </svg>
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.inProgress}</span>
                        <span className="stat-label">In Progress</span>
                    </div>
                </div>

                <div className="stat-card glass-card">
                    <div className="stat-icon success">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                            <path d="M22 4L12 14.01l-3-3" />
                        </svg>
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.success}</span>
                        <span className="stat-label">Completed</span>
                    </div>
                </div>

                <div className="stat-card glass-card">
                    <div className="stat-icon failed">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M15 9l-6 6M9 9l6 6" />
                        </svg>
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.failed}</span>
                        <span className="stat-label">Failed</span>
                    </div>
                </div>
            </div>

            {/* Task Form Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal-content glass-card" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Create New Task</h3>
                            <button className="modal-close" onClick={() => setShowForm(false)}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <TaskForm onSubmit={handleSubmit} onCancel={() => setShowForm(false)} />
                    </div>
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className="error-banner glass-card">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v4M12 16h.01" />
                    </svg>
                    <span>{error}</span>
                </div>
            )}

            {/* Main Content */}
            <main className="dashboard-main">
                <div className="section-header">
                    <h2>Task Queue</h2>
                    <div className="queue-legend">
                        <span className="legend-item high">
                            <span className="legend-dot"></span>High Priority
                        </span>
                        <span className="legend-item medium">
                            <span className="legend-dot"></span>Medium Priority
                        </span>
                        <span className="legend-item low">
                            <span className="legend-dot"></span>Low Priority
                        </span>
                    </div>
                </div>

                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Loading tasks...</p>
                    </div>
                ) : (
                    <TaskList tasks={tasks} onDelete={onDeleteTask} />
                )}
            </main>
        </div>
    )
}

export default Dashboard
