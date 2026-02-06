import React, { useState, useEffect } from 'react';
import './App.css';
import CreatePoll from './components/CreatePoll';
import Poll from './components/Poll';

function App() {
  const [currentView, setCurrentView] = useState('create');
  const [pollId, setPollId] = useState(null);

  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/\/poll\/([A-Z0-9]+)/);
    if (match) {
      setPollId(match[1]);
      setCurrentView('poll');
    }
  }, []);

  const handlePollCreated = (id) => {
    setPollId(id);
    setCurrentView('poll');
    window.history.pushState({}, '', `/poll/${id}`);
  };

  const handleBackToCreate = () => {
    setCurrentView('create');
    setPollId(null);
    window.history.pushState({}, '', '/');
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Quick Poll</h1>
      </header>
      <main className="App-main">
        {currentView === 'create' ? (
          <CreatePoll onPollCreated={handlePollCreated} />
        ) : (
          <Poll pollId={pollId} onBack={handleBackToCreate} />
        )}
      </main>
    </div>
  );
}

export default App;
