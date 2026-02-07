import React, { useState, useCallback } from 'react';
import { DataGrid } from './components/DataGrid';
import type { Transaction } from './types';
import { generateTransactions } from './utils/dataGenerator';
import './App.css';

const INITIAL_PAGE_SIZE = 2000;
const LOAD_MORE_PAGE_SIZE = 2000;
const MAX_TRANSACTIONS = 100000;

const App: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>(() =>
    generateTransactions(INITIAL_PAGE_SIZE, 0)
  );

  const handleLoadMore = useCallback(() => {
    setTransactions((prev) => {
      if (prev.length >= MAX_TRANSACTIONS) return prev;
      const nextChunk = generateTransactions(
        Math.min(LOAD_MORE_PAGE_SIZE, MAX_TRANSACTIONS - prev.length),
        prev.length
      );
      return [...prev, ...nextChunk];
    });
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Trading Dashboard</h1>
      </header>
      <main className="app-main">
        <DataGrid data={transactions} onLoadMore={handleLoadMore} />
      </main>
    </div>
  );
};

export default App;
