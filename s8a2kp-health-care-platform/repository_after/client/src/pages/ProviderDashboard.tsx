import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';

interface Appointment {
  id: string;
  patientId: string;
  patientName?: string;
  startTime: string;
  endTime: string;
  type: string;
  status: string;
  reasonForVisit?: string;
}

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  lastVisit?: string;
}

interface Message {
  id: string;
  senderId: string;
  content: string;
  category: string;
  sentAt: string;
  isRead: boolean;
}

interface ProviderStats {
  todayAppointments: number;
  weekAppointments: number;
  pendingMessages: number;
  patientsSeenToday: number;
}

const ProviderDashboard = () => {
  const { user, logout } = useAuthStore();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [stats, setStats] = useState<ProviderStats>({
    todayAppointments: 0,
    weekAppointments: 0,
    pendingMessages: 0,
    patientsSeenToday: 0,
  });
  const [activeTab, setActiveTab] = useState<'schedule' | 'patients' | 'messages'>('schedule');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    // Mock data - in production would fetch from GraphQL
    setAppointments([
      { id: '1', patientId: 'p1', patientName: 'John Smith', startTime: '09:00', endTime: '09:30', type: 'IN_PERSON', status: 'BOOKED', reasonForVisit: 'Annual checkup' },
      { id: '2', patientId: 'p2', patientName: 'Jane Doe', startTime: '10:00', endTime: '10:30', type: 'TELEHEALTH', status: 'BOOKED', reasonForVisit: 'Follow-up' },
      { id: '3', patientId: 'p3', patientName: 'Bob Johnson', startTime: '11:00', endTime: '11:30', type: 'IN_PERSON', status: 'BOOKED', reasonForVisit: 'Lab review' },
      { id: '4', patientId: 'p4', patientName: 'Alice Brown', startTime: '14:00', endTime: '14:30', type: 'TELEHEALTH', status: 'BOOKED', reasonForVisit: 'Prescription refill' },
    ]);
    setPatients([
      { id: 'p1', firstName: 'John', lastName: 'Smith', email: 'john@example.com', lastVisit: '2026-01-15' },
      { id: 'p2', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', lastVisit: '2026-02-01' },
      { id: 'p3', firstName: 'Bob', lastName: 'Johnson', email: 'bob@example.com', lastVisit: '2026-02-03' },
    ]);
    setMessages([
      { id: 'm1', senderId: 'p1', content: 'Question about my prescription...', category: 'PRESCRIPTION_REFILL', sentAt: '2026-02-05T08:30:00Z', isRead: false },
      { id: 'm2', senderId: 'p2', content: 'Can I reschedule my appointment?', category: 'APPOINTMENT_REQUEST', sentAt: '2026-02-05T09:15:00Z', isRead: false },
    ]);
    setStats({
      todayAppointments: 4,
      weekAppointments: 18,
      pendingMessages: 2,
      patientsSeenToday: 0,
    });
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'BOOKED': return '#4CAF50';
      case 'COMPLETED': return '#2196F3';
      case 'CANCELLED': return '#f44336';
      case 'NO_SHOW': return '#FF9800';
      default: return '#757575';
    }
  };

  const getTypeIcon = (type: string) => {
    return type === 'TELEHEALTH' ? '📹' : '🏥';
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #e0e0e0', paddingBottom: '16px' }}>
        <div>
          <h1 style={{ margin: 0, color: '#1a73e8' }}>Provider Portal</h1>
          <p style={{ margin: '4px 0 0', color: '#666' }}>Welcome back, Dr. {user?.email?.split('@')[0] || 'Provider'}</p>
        </div>
        <button onClick={logout} style={{ padding: '10px 20px', background: '#f44336', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
          Logout
        </button>
      </header>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#e3f2fd', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '32px', color: '#1976D2' }}>{stats.todayAppointments}</h2>
          <p style={{ margin: '8px 0 0', color: '#666' }}>Today's Appointments</p>
        </div>
        <div style={{ background: '#e8f5e9', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '32px', color: '#388E3C' }}>{stats.patientsSeenToday}</h2>
          <p style={{ margin: '8px 0 0', color: '#666' }}>Patients Seen</p>
        </div>
        <div style={{ background: '#fff3e0', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '32px', color: '#F57C00' }}>{stats.pendingMessages}</h2>
          <p style={{ margin: '8px 0 0', color: '#666' }}>Pending Messages</p>
        </div>
        <div style={{ background: '#f3e5f5', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '32px', color: '#7B1FA2' }}>{stats.weekAppointments}</h2>
          <p style={{ margin: '8px 0 0', color: '#666' }}>This Week</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '2px solid #e0e0e0', paddingBottom: '8px' }}>
        {['schedule', 'patients', 'messages'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            style={{
              padding: '10px 24px',
              border: 'none',
              background: activeTab === tab ? '#1a73e8' : 'transparent',
              color: activeTab === tab ? 'white' : '#666',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: activeTab === tab ? 'bold' : 'normal',
              textTransform: 'capitalize',
            }}
          >
            {tab === 'messages' ? `Messages (${stats.pendingMessages})` : tab}
          </button>
        ))}
      </div>

      {/* Schedule Tab */}
      {activeTab === 'schedule' && (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0 }}>📅 Today's Schedule</h2>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {appointments.map(apt => (
              <div key={apt.id} style={{ display: 'flex', alignItems: 'center', padding: '16px', background: '#f8f9fa', borderRadius: '8px', borderLeft: `4px solid ${getStatusColor(apt.status)}` }}>
                <div style={{ marginRight: '16px', fontSize: '24px' }}>{getTypeIcon(apt.type)}</div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0 }}>{apt.patientName}</h3>
                  <p style={{ margin: '4px 0', color: '#666' }}>{apt.reasonForVisit}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontWeight: 'bold' }}>{apt.startTime} - {apt.endTime}</p>
                  <span style={{ color: getStatusColor(apt.status), fontSize: '12px', fontWeight: 'bold' }}>{apt.status}</span>
                </div>
                <div style={{ marginLeft: '16px', display: 'flex', gap: '8px' }}>
                  {apt.type === 'TELEHEALTH' && (
                    <button style={{ padding: '8px 16px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                      Start Video
                    </button>
                  )}
                  <button style={{ padding: '8px 16px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                    View Chart
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Patients Tab */}
      {activeTab === 'patients' && (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', padding: '20px' }}>
          <h2 style={{ margin: '0 0 16px' }}>👥 My Patients</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                <th style={{ padding: '12px', textAlign: 'left' }}>Name</th>
                <th style={{ padding: '12px', textAlign: 'left' }}>Email</th>
                <th style={{ padding: '12px', textAlign: 'left' }}>Last Visit</th>
                <th style={{ padding: '12px', textAlign: 'left' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {patients.map(patient => (
                <tr key={patient.id} style={{ borderBottom: '1px solid #e0e0e0' }}>
                  <td style={{ padding: '12px' }}>{patient.firstName} {patient.lastName}</td>
                  <td style={{ padding: '12px', color: '#666' }}>{patient.email}</td>
                  <td style={{ padding: '12px' }}>{patient.lastVisit || 'Never'}</td>
                  <td style={{ padding: '12px' }}>
                    <button style={{ padding: '6px 12px', background: '#1a73e8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '8px' }}>
                      View Records
                    </button>
                    <button style={{ padding: '6px 12px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                      Message
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Messages Tab */}
      {activeTab === 'messages' && (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', padding: '20px' }}>
          <h2 style={{ margin: '0 0 16px' }}>💬 Patient Messages</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.map(msg => (
              <div
                key={msg.id}
                style={{
                  padding: '16px',
                  background: msg.isRead ? '#f8f9fa' : '#e3f2fd',
                  borderRadius: '8px',
                  borderLeft: `4px solid ${msg.isRead ? '#ccc' : '#1976D2'}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'bold' }}>Patient ID: {msg.senderId}</span>
                  <span style={{ color: '#666', fontSize: '14px' }}>{new Date(msg.sentAt).toLocaleString()}</span>
                </div>
                <span style={{ background: '#e0e0e0', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>
                  {msg.category.replace('_', ' ')}
                </span>
                <p style={{ margin: '8px 0 0' }}>{msg.content}</p>
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                  <button style={{ padding: '6px 12px', background: '#1a73e8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                    Reply
                  </button>
                  <button style={{ padding: '6px 12px', background: 'transparent', color: '#666', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}>
                    Archive
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProviderDashboard;
