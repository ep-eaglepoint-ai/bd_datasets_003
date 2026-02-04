import { render, screen } from '@testing-library/react'
import TaskList from '../components/TaskList'

describe('TaskList Failure Display', () => {
    const mockTasks = [
        {
            task_id: '123',
            name: 'Failed Task',
            task_type: 'data_export',
            priority: 'high',
            status: 'FAILURE',
            progress: 0,
            progress_message: 'Failed',
            error: 'Connection timeout error',
            created_at: '2023-01-01T12:00:00Z'
        }
    ]

    test('renders error message when task status is FAILURE', () => {
        render(<TaskList tasks={mockTasks} onDelete={() => {}} />)
        
        // Assert the error message is visible
        const errorMessage = screen.getByText('Connection timeout error')
        expect(errorMessage).toBeInTheDocument()
        
        // Assert the failure badge is visible
        const badge = screen.getByText('FAILURE')
        expect(badge).toBeInTheDocument()
        expect(badge).toHaveClass('badge-failure')
    })

    test('renders tasks with different priorities', () => {
         const priorityTasks = [
            {
                task_id: '1',
                name: 'High Priority',
                task_type: 'data_export',
                priority: 'high',
                status: 'PENDING',
                created_at: '2023-01-01T12:00:00Z'
            }
        ]
        render(<TaskList tasks={priorityTasks} onDelete={() => {}} />)
        const badge = screen.getByText('high')
        expect(badge).toHaveClass('badge-high')
    })
})
