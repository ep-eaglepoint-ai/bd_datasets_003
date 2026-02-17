import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Home from './pages/Home';
import CreateCountdown from './pages/CreateCountdown';
import ViewCountdown from './pages/ViewCountdown';
import Browse from './pages/Browse';
import Login from './pages/Login';
import Register from './pages/Register';
import Navbar from './components/Navbar';


function App() {
  return (
    <Router>
      <AuthProvider>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/create" element={<CreateCountdown />} />
            <Route path="/browse" element={<Browse />} />
            <Route path="/countdown/:slug" element={<ViewCountdown />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;