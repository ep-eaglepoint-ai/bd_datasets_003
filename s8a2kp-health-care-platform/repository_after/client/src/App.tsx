import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Registration from './pages/Registration';
import PatientDashboard from './pages/PatientDashboard';
import ProviderDashboard from './pages/ProviderDashboard';
import VideoRoom from './pages/VideoRoom';
import Appointments from './pages/Appointments';
import MedicalRecords from './pages/MedicalRecords';
import Prescriptions from './pages/Prescriptions';
import Messaging from './pages/Messaging';
import Billing from './pages/Billing';
import AdminDashboard from './pages/AdminDashboard';
import { useAuthStore } from './store/authStore';

const ProtectedRoute = ({ children }: { children: JSX.Element, allowedRoles?: string[] }) => {
    const { token } = useAuthStore();
    if (!token) return <Navigate to="/login" />;
    // In a real app, verify role here using 'allowedRoles' and 'user' from store
    return children;
};

function App() {
  return (
    <Router>
      <div className="app-container">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Registration />} />
          <Route path="/patient" element={
              <ProtectedRoute>
                  <PatientDashboard />
              </ProtectedRoute>
          } />
          <Route path="/patient/appointments" element={
              <ProtectedRoute>
                  <Appointments />
              </ProtectedRoute>
          } />
          <Route path="/patient/records" element={
              <ProtectedRoute>
                  <MedicalRecords />
              </ProtectedRoute>
          } />
          <Route path="/patient/prescriptions" element={
              <ProtectedRoute>
                  <Prescriptions />
              </ProtectedRoute>
          } />
          <Route path="/patient/messages" element={
              <ProtectedRoute>
                  <Messaging />
              </ProtectedRoute>
          } />
          <Route path="/patient/billing" element={
              <ProtectedRoute>
                  <Billing />
              </ProtectedRoute>
          } />
          <Route path="/admin" element={
              <ProtectedRoute>
                  <AdminDashboard />
              </ProtectedRoute>
          } />
          <Route path="/provider/*" element={
              <ProtectedRoute>
                  <ProviderDashboard />
              </ProtectedRoute>
          } />
          <Route path="/video/:roomName" element={
              <ProtectedRoute>
                  <VideoRoom />
              </ProtectedRoute>
          } />
          <Route path="/" element={<Navigate to="/login" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
