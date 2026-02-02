
import { useState, useEffect } from 'react';
import { gqlRequest } from '../api/client';

const AdminDashboard = () => {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    const fetchStats = async () => {
        try {
            const query = `
                query {
                    adminStats {
                        activePatients
                        upcomingAppointments
                        revenue
                    }
                }
            `;
            const data = await gqlRequest(query);
            setStats(data.adminStats);
        } catch (err) {
            console.error(err);
        }
    };
    fetchStats();
  }, []);

  return (
    <div className="container">
      <h1>Admin Dashboard</h1>
      
      {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
                <h3 style={{ fontSize: '2.5rem', color: 'var(--primary)', marginBottom: '0.5rem' }}>{stats.activePatients}</h3>
                <p className="label">Active Patients</p>
            </div>
            <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
                <h3 style={{ fontSize: '2.5rem', color: 'var(--success)', marginBottom: '0.5rem' }}>{stats.upcomingAppointments}</h3>
                <p className="label">Upcoming Appointments</p>
            </div>
            <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
                <h3 style={{ fontSize: '2.5rem', color: 'var(--warning)', marginBottom: '0.5rem' }}>${stats.revenue}</h3>
                <p className="label">Total Revenue</p>
            </div>
          </div>
      )}
      
      <div className="card">
        <h3>System Audit Logs</h3>
        <p>No logs available yet (Mock).</p>
      </div>
    </div>
  );
};

export default AdminDashboard;
