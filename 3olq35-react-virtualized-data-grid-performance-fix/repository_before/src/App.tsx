import React from 'react';
import { DataGrid } from './components/DataGrid';
import { generateTransactions } from './utils/dataGenerator';
import './App.css';

const App: React.FC = () => {
  const transactions = generateTransactions(100000);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Trading Dashboard</h1>
      </header>
      <main className="app-main">
        <DataGrid data={transactions} />
      </main>
    </div>
  );
};

export default App;
