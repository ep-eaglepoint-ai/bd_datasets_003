import React, { useState, useEffect } from 'react';

interface Task {
  id?: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_date: string;
}

interface TaskFormProps {
  task?: Task;
  onSubmit: (task: Omit<Task, 'id'>) => Promise<void>;
  onCancel: () => void;
}

const STATUSES = ['todo', 'in_progress', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];

export const TaskForm: React.FC<TaskFormProps> = ({ task, onSubmit, onCancel }) => {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [status, setStatus] = useState(task?.status || 'todo');
  const [priority, setPriority] = useState(task?.priority || 'medium');
  const [dueDate, setDueDate] = useState(task?.due_date || '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const isEditing = !!task?.id;

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description);
      setStatus(task.status);
      setPriority(task.priority);
      setDueDate(task.due_date);
    }
  }, [task]);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!title.trim()) newErrors.title = 'Title is required';
    if (title.trim().length > 200) newErrors.title = 'Title must be 200 characters or less';
    if (dueDate) {
      const date = new Date(dueDate);
      if (date < new Date()) newErrors.due_date = 'Due date cannot be in the past';
    }
    if (!STATUSES.includes(status)) newErrors.status = 'Invalid status';
    if (!PRIORITIES.includes(priority)) newErrors.priority = 'Invalid priority';
    return newErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      await onSubmit({ title: title.trim(), description: description.trim(), status, priority, due_date: dueDate });
    } catch (error: any) {
      setServerError(error.message || 'Failed to save task');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-label={isEditing ? 'Edit task' : 'Create task'}>
      <div>
        <label htmlFor="title">Title</label>
        <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)}
          aria-invalid={!!errors.title} aria-describedby={errors.title ? 'title-error' : undefined} />
        {errors.title && <span id="title-error" role="alert">{errors.title}</span>}
      </div>
      <div>
        <label htmlFor="description">Description</label>
        <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <label htmlFor="status">Status</label>
        <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        {errors.status && <span role="alert">{errors.status}</span>}
      </div>
      <div>
        <label htmlFor="priority">Priority</label>
        <select id="priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {errors.priority && <span role="alert">{errors.priority}</span>}
      </div>
      <div>
        <label htmlFor="due_date">Due Date</label>
        <input id="due_date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
          aria-invalid={!!errors.due_date} aria-describedby={errors.due_date ? 'due-date-error' : undefined} />
        {errors.due_date && <span id="due-date-error" role="alert">{errors.due_date}</span>}
      </div>
      {serverError && <div role="alert" className="server-error">{serverError}</div>}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : isEditing ? 'Update Task' : 'Create Task'}
      </button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </form>
  );
};
