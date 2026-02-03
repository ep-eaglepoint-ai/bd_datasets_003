import { useState, useEffect, useCallback } from 'react'
import Dashboard from './components/Dashboard'
import './styles/index.css'

// API base URL - use relative paths for Docker setup
const API_BASE = '/api'

function App() {
    const [tasks, setTasks] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [wsConnected, setWsConnected] = useState(false)

    // Fetch all tasks
    const fetchTasks = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE}/tasks?per_page=50`)
            if (!response.ok) throw new Error('Failed to fetch tasks')
            const data = await response.json()
            setTasks(data.tasks)
            setError(null)
        } catch (err) {
            console.error('Error fetching tasks:', err)
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }, [])

    // Submit new task
    const submitTask = async (taskData) => {
        try {
            const response = await fetch(`${API_BASE}/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskData),
            })
            if (!response.ok) throw new Error('Failed to submit task')
            const result = await response.json()
            await fetchTasks() // Refresh list
            return result
        } catch (err) {
            console.error('Error submitting task:', err)
            throw err
        }
    }

    // Submit failing task for testing
    const submitFailingTask = async (taskData) => {
        try {
            const response = await fetch(`${API_BASE}/tasks/submit-failing`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskData),
            })
            if (!response.ok) throw new Error('Failed to submit failing task')
            const result = await response.json()
            await fetchTasks()
            return result
        } catch (err) {
            console.error('Error submitting failing task:', err)
            throw err
        }
    }

    // Delete task
    const deleteTask = async (taskId) => {
        try {
            const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
                method: 'DELETE',
            })
            if (!response.ok) throw new Error('Failed to delete task')
            await fetchTasks()
        } catch (err) {
            console.error('Error deleting task:', err)
            throw err
        }
    }

    // WebSocket connection for real-time updates
    useEffect(() => {
        let ws = null
        let reconnectTimeout = null

        const connectWebSocket = () => {
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
            const wsUrl = `${wsProtocol}//${window.location.host}/ws`

            ws = new WebSocket(wsUrl)

            ws.onopen = () => {
                console.log('WebSocket connected')
                setWsConnected(true)
            }

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    if (data.type === 'task_created' || data.type === 'task_updated') {
                        fetchTasks()
                    }
                } catch (err) {
                    console.error('WebSocket message error:', err)
                }
            }

            ws.onclose = () => {
                console.log('WebSocket disconnected')
                setWsConnected(false)
                // Attempt reconnect after 3 seconds
                reconnectTimeout = setTimeout(connectWebSocket, 3000)
            }

            ws.onerror = (error) => {
                console.error('WebSocket error:', error)
            }
        }

        // Initial connection attempt
        connectWebSocket()

        // Cleanup
        return () => {
            if (ws) ws.close()
            if (reconnectTimeout) clearTimeout(reconnectTimeout)
        }
    }, [fetchTasks])

    // Polling fallback for updates
    useEffect(() => {
        fetchTasks()

        // Poll every 2 seconds for updates
        const pollInterval = setInterval(fetchTasks, 2000)

        return () => clearInterval(pollInterval)
    }, [fetchTasks])

    return (
        <Dashboard
            tasks={tasks}
            loading={loading}
            error={error}
            wsConnected={wsConnected}
            onSubmitTask={submitTask}
            onSubmitFailingTask={submitFailingTask}
            onDeleteTask={deleteTask}
            onRefresh={fetchTasks}
        />
    )
}

export default App
