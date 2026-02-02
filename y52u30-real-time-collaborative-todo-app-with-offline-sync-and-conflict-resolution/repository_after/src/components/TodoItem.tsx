'use client';

import React, { useState } from 'react';
import { useTodoStore } from '../store/zustand-store';
import { Todo } from '../types';

interface TodoItemProps {
  todo: Todo;
  index: number;
}

export function TodoItem({ todo, index }: TodoItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title);

  const updateTodo = useTodoStore((state) => state.updateTodo);
  const deleteTodo = useTodoStore((state) => state.deleteTodo);
  const updatePresence = useTodoStore((state) => state.updatePresence);
  const presence = useTodoStore((state) => state.presence);

  // Check if someone else is editing this todo
  const editingUsers = presence.filter(
    (p) => p.currentTodoId === todo.id && p.userId !== useTodoStore.getState().userId
  );

  const handleToggleComplete = () => {
    updateTodo(todo.id, { completed: !todo.completed });
  };

  const handleDelete = () => {
    deleteTodo(todo.id);
  };

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditTitle(todo.title);
    updatePresence(todo.id);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditTitle(todo.title);
    updatePresence(null);
  };

  const handleSaveEdit = () => {
    if (editTitle.trim() && editTitle !== todo.title) {
      updateTodo(todo.id, { title: editTitle.trim() });
    }
    setIsEditing(false);
    updatePresence(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  return (
    <li
      style={{
        ...styles.item,
        ...(editingUsers.length > 0 ? styles.beingEdited : {}),
      }}
    >
      <div style={styles.content}>
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={handleToggleComplete}
          style={styles.checkbox}
        />

        {isEditing ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSaveEdit}
            autoFocus
            style={styles.editInput}
          />
        ) : (
          <span
            style={{
              ...styles.title,
              ...(todo.completed ? styles.completed : {}),
            }}
            onDoubleClick={handleStartEdit}
          >
            {todo.title}
          </span>
        )}
      </div>

      <div style={styles.actions}>
        {editingUsers.length > 0 && (
          <span style={styles.editingIndicator}>
            {editingUsers.map((u) => u.userId).join(', ')} editing...
          </span>
        )}

        {!isEditing && (
          <>
            <button onClick={handleStartEdit} style={styles.button}>
              Edit
            </button>
            <button onClick={handleDelete} style={styles.deleteButton}>
              Delete
            </button>
          </>
        )}

        {isEditing && (
          <>
            <button onClick={handleSaveEdit} style={styles.button}>
              Save
            </button>
            <button onClick={handleCancelEdit} style={styles.button}>
              Cancel
            </button>
          </>
        )}
      </div>
    </li>
  );
}

const styles: Record<string, React.CSSProperties> = {
  item: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    borderBottom: '1px solid #eee',
    transition: 'background-color 0.2s',
  },
  beingEdited: {
    backgroundColor: '#fff9e6',
    borderLeft: '3px solid #ffc107',
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    gap: '10px',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  title: {
    flex: 1,
    cursor: 'pointer',
  },
  completed: {
    textDecoration: 'line-through',
    color: '#999',
  },
  editInput: {
    flex: 1,
    padding: '4px 8px',
    fontSize: '16px',
    border: '1px solid #ddd',
    borderRadius: '4px',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  button: {
    padding: '4px 12px',
    fontSize: '14px',
    cursor: 'pointer',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: 'white',
  },
  deleteButton: {
    padding: '4px 12px',
    fontSize: '14px',
    cursor: 'pointer',
    border: '1px solid #ff4444',
    borderRadius: '4px',
    backgroundColor: 'white',
    color: '#ff4444',
  },
  editingIndicator: {
    fontSize: '12px',
    color: '#ffc107',
    fontStyle: 'italic',
  },
};
