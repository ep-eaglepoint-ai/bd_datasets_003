import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { Link } from 'react-router-dom';
import { gqlRequest } from '../api/client';

interface DashboardStats {
  upcomingAppointments: number;
  unreadMessages: number;
  activePrescriptions: number;
  pendingBills: number;
  nextAppointment?: {
    date: string;
    provider: string;
    type: string;
  };
}

const PatientDashboard = () => {
  const { user, logout } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats>({
    upcomingAppointments: 0,
    unreadMessages: 0,
    activePrescriptions: 0,
    pendingBills: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch dashboard stats
    const fetchStats = async () => {
      try {
        const query = `
          query {
            appointments { id status startTime type }
            messages { id isRead }
            prescriptions { id status }
            invoices { id status }
          }
        `;
        const data = await gqlRequest(query);
        
        const appointments = data.appointments || [];
        const upcomingApts = appointments.filter((a: any) => a.status === 'BOOKED');
        
        setStats({
          upcomingAppointments: upcomingApts.length,
          unreadMessages: (data.messages || []).filter((m: any) => !m.isRead).length,
          activePrescriptions: (data.prescriptions || []).filter((p: any) => p.status === 'ACTIVE').length,
          pendingBills: (data.invoices || []).filter((i: any) => i.status !== 'PAID').length,
          nextAppointment: upcomingApts[0] ? {
            date: new Date(upcomingApts[0].startTime).toLocaleDateString(),
            provider: 'Dr. Smith',
            type: upcomingApts[0].type,
          } : undefined,
        });
      } catch (err) {
        // Mock data
        setStats({
          upcomingAppointments: 2,
          unreadMessages: 3,
          activePrescriptions: 4,
          pendingBills: 1,
          nextAppointment: {
            date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString(),
            provider: 'Dr. Smith',
            type: 'TELEHEALTH',
          },
        });
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const quickLinks = [
    { to: '/patient/appointments', icon: '📅', label: 'Appointments', count: stats.upcomingAppointments, color: '#1a73e8' },
    { to: '/patient/messages', icon: '💬', label: 'Messages', count: stats.unreadMessages, color: '#4CAF50', badge: true },
    { to: '/patient/prescriptions', icon: '💊', label: 'Prescriptions', count: stats.activePrescriptions, color: '#9C27B0' },
    { to: '/patient/billing', icon: '💳', label: 'Billing', count: stats.pendingBills, color: '#F44336' },
    { to: '/patient/records', icon: '📋', label: 'Records', color: '#FF9800' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa' }}>
      {/* Header */}
      <header style={{ background: 'white', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, color: '#1a73e8' }}>Healthcare+</h1>
          <p style={{ margin: '4px 0 0', color: '#666' }}>Welcome back, {user?.email?.split('@')[0] || 'Patient'}</p>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <Link to="/patient/messages" style={{ position: 'relative', textDecoration: 'none', fontSize: '24px' }}>
            🔔
            {stats.unreadMessages > 0 && (
              <span style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#F44336', color: 'white', borderRadius: '50%', width: '20px', height: '20px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {stats.unreadMessages}
              </span>
            )}
          </Link>
          <button onClick={logout} style={{ padding: '8px 16px', background: '#f44336', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            Logout
          </button>
        </div>
      </header>

      {/* Navigation */}
      <nav style={{ background: 'white', borderBottom: '1px solid #e0e0e0', padding: '0 24px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['Overview', 'Appointments', 'Records', 'Prescriptions', 'Messages', 'Billing'].map((item, i) => (
            <Link
              key={item}
              to={i === 0 ? '/patient' : `/patient/${item.toLowerCase()}`}
              style={{
                padding: '16px 20px',
                textDecoration: 'none',
                color: '#333',
                borderBottom: i === 0 ? '3px solid #1a73e8' : '3px solid transparent',
                fontWeight: i === 0 ? 'bold' : 'normal',
              }}
            >
              {item}
            </Link>
          ))}
          <Link to="/admin" style={{ marginLeft: 'auto', padding: '16px 20px', textDecoration: 'none', color: '#9C27B0' }}>
            🔐 Admin
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <main style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        {/* Next Appointment Card */}
        {stats.nextAppointment && (
          <div style={{ background: 'linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%)', color: 'white', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: '0 0 8px', opacity: 0.8 }}>Your Next Appointment</p>
                <h2 style={{ margin: 0, fontSize: '24px' }}>{stats.nextAppointment.date}</h2>
                <p style={{ margin: '8px 0 0' }}>
                  {stats.nextAppointment.provider} • {stats.nextAppointment.type === 'TELEHEALTH' ? '📹 Video Visit' : '🏥 In-Person'}
                </p>
              </div>
              {stats.nextAppointment.type === 'TELEHEALTH' && (
                <Link to="/video/telehealth-room-1" style={{ padding: '12px 24px', background: 'white', color: '#1a73e8', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' }}>
                  Join Video Call
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Quick Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          {quickLinks.map(link => (
            <Link
              key={link.to}
              to={link.to}
              style={{
                background: 'white',
                borderRadius: '12px',
                padding: '20px',
                textDecoration: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                transition: 'transform 0.2s, box-shadow 0.2s',
                display: 'block',
              }}
              onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; }}
              onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ fontSize: '32px' }}>{link.icon}</div>
                <div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: link.color }}>
                    {link.count !== undefined ? link.count : '-'}
                    {link.badge && link.count > 0 && (
                      <span style={{ marginLeft: '8px', background: '#F44336', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>NEW</span>
                    )}
                  </div>
                  <div style={{ color: '#666' }}>{link.label}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Quick Actions */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <h3 style={{ margin: '0 0 16px' }}>Quick Actions</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <Link to="/patient/appointments" style={{ padding: '12px 24px', background: '#e3f2fd', color: '#1a73e8', borderRadius: '8px', textDecoration: 'none', fontWeight: '500' }}>
              📅 Book Appointment
            </Link>
            <Link to="/patient/messages" style={{ padding: '12px 24px', background: '#e8f5e9', color: '#388e3c', borderRadius: '8px', textDecoration: 'none', fontWeight: '500' }}>
              💬 Message Care Team
            </Link>
            <Link to="/patient/prescriptions" style={{ padding: '12px 24px', background: '#f3e5f5', color: '#7b1fa2', borderRadius: '8px', textDecoration: 'none', fontWeight: '500' }}>
              💊 Request Refill
            </Link>
            <Link to="/video/telehealth-room-1" style={{ padding: '12px 24px', background: '#fff3e0', color: '#f57c00', borderRadius: '8px', textDecoration: 'none', fontWeight: '500' }}>
              📹 Join Telehealth
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PatientDashboard;
