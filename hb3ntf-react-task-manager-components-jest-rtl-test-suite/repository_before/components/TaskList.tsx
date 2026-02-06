import React, { useState } from 'react';

interface Task {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_date: string | null;
}

interface TaskListProps {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  onTaskClick: (taskId: number) => void;
  onDeleteTask: (taskId: number) => Promise<void>;
  onStatusChange: (taskId: number, newStatus: string) => Promise<void>;
}

export const TaskList: React.FC<TaskListProps> = ({
  tasks, loading, error, onTaskClick, onDeleteTask, onStatusChange,
}) => {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async (taskId: number) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    setDeletingId(taskId);
    setDeleteError(null);
    try {
      await onDeleteTask(taskId);
    } catch (error: any) {
      setDeleteError(error.message || 'Failed to delete task');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <div role="status">Loading tasks...</div>;
  if (error) return <div role="alert">{error}</div>;
  if (tasks.length === 0) return <div>No tasks found</div>;

  return (
    <div>
      {deleteError && <div role="alert">{deleteError}</div>}
      <ul role="list">
        {tasks.map((task) => (
          <li key={task.id} data-testid={`task-${task.id}`}>
            <div onClick={() => onTaskClick(task.id)}>
              <h3>{task.title}</h3>
              <span className={`status-${task.status}`}>{task.status.replace('_', ' ')}</span>
              <span className={`priority-${task.priority}`}>{task.priority}</span>
              {task.due_date && <span>{new Date(task.due_date).toLocaleDateString()}</span>}
            </div>
            <div>
              {task.status === 'todo' && (
                <button onClick={() => onStatusChange(task.id, 'in_progress')}>Start</button>
              )}
              {task.status === 'in_progress' && (
                <button onClick={() => onStatusChange(task.id, 'done')}>Complete</button>
              )}
              <button onClick={() => handleDelete(task.id)} disabled={deletingId === task.id}>
                {deletingId === task.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
