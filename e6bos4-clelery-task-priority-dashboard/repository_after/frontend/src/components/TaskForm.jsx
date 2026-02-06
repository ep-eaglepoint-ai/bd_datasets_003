import { useState } from 'react'
import './TaskForm.css'

function TaskForm({ onSubmit, onCancel }) {
    const [formData, setFormData] = useState({
        name: '',
        task_type: 'data_export',
        priority: 'medium',
        total_steps: 100,
    })
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [submitFailing, setSubmitFailing] = useState(false)

    const handleChange = (e) => {
        const { name, value } = e.target
        setFormData(prev => ({
            ...prev,
            [name]: name === 'total_steps' ? parseInt(value) || 100 : value
        }))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!formData.name.trim()) return

        setIsSubmitting(true)
        try {
            await onSubmit(formData, submitFailing)
        } catch (err) {
            console.error('Form submit error:', err)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <form className="task-form" onSubmit={handleSubmit}>
            <div className="form-body">
                {/* Task Name */}
                <div className="form-group">
                    <label className="form-label" htmlFor="name">Task Name</label>
                    <input
                        type="text"
                        id="name"
                        name="name"
                        className="form-input"
                        placeholder="e.g., Export Q4 Sales Report"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        autoFocus
                    />
                </div>

                {/* Task Type */}
                <div className="form-group">
                    <label className="form-label" htmlFor="task_type">Task Type</label>
                    <select
                        id="task_type"
                        name="task_type"
                        className="form-select"
                        value={formData.task_type}
                        onChange={handleChange}
                    >
                        <option value="data_export">Data Export</option>
                        <option value="pdf_generation">PDF Generation</option>
                        <option value="report_generation">Report Generation</option>
                        <option value="generic">Generic Task</option>
                    </select>
                </div>

                {/* Priority */}
                <div className="form-group">
                    <label className="form-label">Priority</label>
                    <div className="priority-options">
                        {['high', 'medium', 'low'].map(priority => (
                            <label
                                key={priority}
                                className={`priority-option ${priority} ${formData.priority === priority ? 'selected' : ''}`}
                            >
                                <input
                                    type="radio"
                                    name="priority"
                                    value={priority}
                                    checked={formData.priority === priority}
                                    onChange={handleChange}
                                />
                                <span className="priority-dot"></span>
                                <span className="priority-label">{priority}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Total Steps */}
                <div className="form-group">
                    <label className="form-label" htmlFor="total_steps">
                        Processing Steps
                        <span className="form-hint"> (affects task duration)</span>
                    </label>
                    <input
                        type="number"
                        id="total_steps"
                        name="total_steps"
                        className="form-input"
                        min="10"
                        max="1000"
                        value={formData.total_steps}
                        onChange={handleChange}
                    />
                </div>

                {/* Fail Checkbox - for testing */}
                <div className="form-group">
                    <label className="checkbox-label">
                        <input
                            type="checkbox"
                            checked={submitFailing}
                            onChange={(e) => setSubmitFailing(e.target.checked)}
                        />
                        <span className="checkbox-custom"></span>
                        <span className="checkbox-text">
                            Create a failing task
                            <span className="form-hint"> (for testing error handling)</span>
                        </span>
                    </label>
                </div>
            </div>

            <div className="form-footer">
                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={onCancel}
                    disabled={isSubmitting}
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isSubmitting || !formData.name.trim()}
                >
                    {isSubmitting ? (
                        <>
                            <span className="btn-spinner"></span>
                            Submitting...
                        </>
                    ) : (
                        <>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 5v14M5 12h14" />
                            </svg>
                            Create Task
                        </>
                    )}
                </button>
            </div>
        </form>
    )
}

export default TaskForm
