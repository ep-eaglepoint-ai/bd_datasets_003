'use client';

import React from 'react';
import { useTodoStore } from '../store/zustand-store';
import { TodoItem } from './TodoItem';

export function TodoList() {
  const todos = useTodoStore((state) => state.todos);

  // Get active (non-deleted) todos sorted by position
  const activeTodos = Array.from(todos.values())
    .filter((todo) => !todo.deletedAt)
    .sort((a, b) => a.position - b.position);

  if (activeTodos.length === 0) {
    return (
      <div style={styles.empty}>
        <p>No todos yet. Add one above!</p>
      </div>
    );
  }

  return (
    <ul style={styles.list}>
      {activeTodos.map((todo, index) => (
        <TodoItem key={todo.id} todo={todo} index={index} />
      ))}
    </ul>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  empty: {
    textAlign: 'center',
    padding: '40px 20px',
    color: '#999',
  },
};
