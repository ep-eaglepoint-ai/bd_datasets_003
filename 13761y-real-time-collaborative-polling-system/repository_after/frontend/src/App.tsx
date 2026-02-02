import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import PollList from './components/PollList';
import PollDetail from './components/PollDetail';
import './index.css';
import './App.css';

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<PollList />} />
        <Route path="/poll/:id" element={<PollDetail />} />
      </Routes>
    </Router>
  );
};

export default App;
