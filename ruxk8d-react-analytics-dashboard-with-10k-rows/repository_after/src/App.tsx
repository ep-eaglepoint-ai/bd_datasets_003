import React, { useEffect } from 'react';
import { DataTable } from './components/DataTable';
import { Filters } from './components/Filters';
import { Charts } from './components/Charts';
import { useWebSocket } from './hooks/useWebSocket';
import { useDashboardStore } from './store/dashboardStore';
import './styles.css';

function App() {
  const { setTransactions, isLoading } = useDashboardStore();
  
  useWebSocket('ws://localhost:8080/ws');
  
  useEffect(() => {
    fetch('/api/transactions')
      .then(res => res.json())
      .then(data => setTransactions(data))
      .catch(console.error);
  }, [setTransactions]);
  
  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }
  
  return (
    <div className="dashboard">
      <header>
        <h1>Transaction Dashboard</h1>
      </header>
      <main>
        <Filters />
        <Charts />
        <DataTable />
      </main>
    </div>
  );
}

export default App;
