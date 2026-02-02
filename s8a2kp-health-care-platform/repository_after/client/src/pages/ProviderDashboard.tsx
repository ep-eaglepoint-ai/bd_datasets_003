import { useAuthStore } from '../store/authStore';

const ProviderDashboard = () => {
  const { logout } = useAuthStore();

  return (
    <div className="container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0' }}>
        <h1>Provider Portal</h1>
        <button className="btn" onClick={logout}>Logout</button>
      </header>
      <div className="card">
        <h3>Schedule</h3>
        <p>No appointments for today.</p>
      </div>
    </div>
  );
};

export default ProviderDashboard;
