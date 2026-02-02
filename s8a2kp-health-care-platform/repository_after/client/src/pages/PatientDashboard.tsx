import { useAuthStore } from '../store/authStore';
import { Link } from 'react-router-dom';

const PatientDashboard = () => {
  const { logout } = useAuthStore();

  return (
    <div className="container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0' }}>
        <h1>Patient Portal</h1>
        <button className="btn" onClick={logout}>Logout</button>
      </header>
      <nav style={{ marginBottom: '2rem', display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--slate-200)', paddingBottom: '1rem' }}>
        <Link to="/patient" className="nav-link">Overview</Link>
        <Link to="/patient/appointments" className="nav-link">Appointments</Link>
        <Link to="/patient/records" className="nav-link">Records</Link>
        <Link to="/patient/prescriptions" className="nav-link">Prescriptions</Link>
        <Link to="/patient/messages" className="nav-link">Messages</Link>
        <Link to="/patient/billing" className="nav-link">Billing</Link>
        <Link to="/admin" className="nav-link" style={{ marginLeft: 'auto', color: 'var(--danger)' }}>Admin</Link>
      </nav>
      
      <div className="card">
        <h3>Welcome</h3>
        <p>Select an option from the menu to manage your health.</p>
        <Link to="/video/telehealth-room-1" className="btn btn-primary" style={{ display: 'inline-block', marginTop: '1rem', textDecoration: 'none' }}>
            Join Telehealth Room
        </Link>
      </div>
    </div>
  );
};

export default PatientDashboard;
