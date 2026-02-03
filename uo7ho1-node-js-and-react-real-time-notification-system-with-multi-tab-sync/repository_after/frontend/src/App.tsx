// Main App component

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationBell } from './components/NotificationBell';
import { ConnectionStatus } from './components/ConnectionStatus';
import { ToastContainer } from './components/ToastContainer';
import { useSocket } from './hooks/useSocket';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: 30000,
    },
  },
});

// Socket provider component to initialize connection
const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useSocket();
  return <>{children}</>;
};

const AppContent: React.FC = () => {
  return (
    <SocketProvider>
      <div className="app">
        <style>
          {`
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
              line-height: 1.5;
              color: #1f2937;
              background-color: #f9fafb;
            }
            .app {
              min-height: 100vh;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 12px 24px;
              background: white;
              border-bottom: 1px solid #e5e7eb;
              box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            }
            .header-left {
              display: flex;
              align-items: center;
              gap: 16px;
            }
            .logo {
              font-size: 20px;
              font-weight: 700;
              color: #3b82f6;
            }
            .header-right {
              display: flex;
              align-items: center;
              gap: 16px;
            }
            .main {
              padding: 24px;
              max-width: 1200px;
              margin: 0 auto;
            }
            .card {
              background: white;
              border-radius: 8px;
              padding: 24px;
              box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            }
            .card h1 {
              font-size: 24px;
              margin-bottom: 16px;
            }
            .card p {
              color: #6b7280;
            }
          `}
        </style>

        <header className="header">
          <div className="header-left">
            <span className="logo">ProjectHub</span>
          </div>
          <div className="header-right">
            <ConnectionStatus />
            <NotificationBell />
          </div>
        </header>

        <main className="main">
          <div className="card">
            <h1>Welcome to ProjectHub</h1>
            <p>
              This is a demo of the real-time notification system.
              Notifications will appear in the bell icon and as toasts when new events occur.
            </p>
          </div>
        </main>

        <ToastContainer />
      </div>
    </SocketProvider>
  );
};

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
};

export default App;
