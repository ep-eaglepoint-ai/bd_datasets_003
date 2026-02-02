'use client';

import { useEffect, useState } from 'react';
import { useTodoStore } from '../src/store/zustand-store';
import { TodoList } from '../src/components/TodoList';
import { TodoInput } from '../src/components/TodoInput';
import { PresenceIndicator } from '../src/components/PresenceIndicator';
import { SyncStatus } from '../src/components/SyncStatus';

export default function Home() {
  const [isClient, setIsClient] = useState(false);
  const { connect, disconnect, syncStatus } = useTodoStore();

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isClient) {
      connect();
      return () => {
        disconnect();
      };
    }
  }, [isClient, connect, disconnect]);

  if (!isClient) {
    return (
      <main style={styles.main}>
        <div style={styles.container}>
          <h1 style={styles.title}>Collaborative Todo App</h1>
          <p>Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <header style={styles.header}>
          <h1 style={styles.title}>Collaborative Todo App</h1>
          <div style={styles.statusBar}>
            <SyncStatus status={syncStatus} />
            <PresenceIndicator />
          </div>
        </header>

        <TodoInput />
        <TodoList />

        <footer style={styles.footer}>
          <p>Real-time sync with offline support and conflict resolution</p>
        </footer>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    padding: '20px',
  },
  container: {
    maxWidth: '600px',
    margin: '0 auto',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    padding: '20px',
  },
  header: {
    marginBottom: '20px',
  },
  title: {
    margin: '0 0 10px 0',
    fontSize: '24px',
    color: '#333',
  },
  statusBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '14px',
    color: '#666',
  },
  footer: {
    marginTop: '20px',
    paddingTop: '20px',
    borderTop: '1px solid #eee',
    textAlign: 'center',
    fontSize: '12px',
    color: '#999',
  },
};
