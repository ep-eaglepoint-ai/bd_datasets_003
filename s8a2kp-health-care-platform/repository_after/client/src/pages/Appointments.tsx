
import { useState, useEffect } from 'react';
import { gqlRequest } from '../api/client';

interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

interface Appointment {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  type: string;
  copayAmount?: number;
  copayCollected?: boolean;
}

const COPAY_RATES: Record<string, number> = {
  IN_PERSON: 25.00,
  TELEHEALTH: 15.00,
  FOLLOW_UP: 20.00,
  URGENT: 50.00,
};

const Appointments = () => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [providerId, setProviderId] = useState('provider-1');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [appointmentType, setAppointmentType] = useState('TELEHEALTH');
  const [loading, setLoading] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Fetch existing appointments
  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        const query = `
          query {
            appointments {
              id
              startTime
              endTime
              status
              type
              copayAmount
              copayCollected
            }
          }
        `;
        const data = await gqlRequest(query);
        setAppointments(data.appointments || []);
      } catch (err) {
        console.error(err);
      }
    };
    fetchAppointments();
  }, []);

  // Fetch available slots when date or provider changes
  useEffect(() => {
    const fetchSlots = async () => {
      if (!date) return;
      setLoadingSlots(true);
      try {
        const query = `
          query {
            getAvailableSlots(providerId: "${providerId}", date: "${date}") {
              providerId
              date
              slots {
                startTime
                endTime
                available
              }
            }
          }
        `;
        const data = await gqlRequest(query);
        setAvailableSlots(data.getAvailableSlots?.slots || []);
      } catch (err) {
        console.error('Error fetching slots:', err);
        // Generate mock slots for demo
        const mockSlots: TimeSlot[] = [];
        for (let hour = 9; hour < 17; hour++) {
          if (hour !== 12) { // Skip lunch
            mockSlots.push({
              startTime: `${date}T${hour.toString().padStart(2, '0')}:00:00`,
              endTime: `${date}T${hour.toString().padStart(2, '0')}:30:00`,
              available: Math.random() > 0.3,
            });
          }
        }
        setAvailableSlots(mockSlots);
      } finally {
        setLoadingSlots(false);
      }
    };
    fetchSlots();
  }, [date, providerId]);

  const handleBook = async () => {
    if (!selectedSlot) {
      alert('Please select a time slot');
      return;
    }
    
    setLoading(true);
    try {
      const mutation = `
        mutation {
          createAppointment(createAppointmentInput: {
            patientId: "patient-1",
            providerId: "${providerId}",
            startTime: "${selectedSlot.startTime}",
            endTime: "${selectedSlot.endTime}",
            type: ${appointmentType}
          }) {
            id
            copayAmount
            copayCollected
          }
        }
      `;
      const data = await gqlRequest(mutation);
      const copay = data.createAppointment?.copayAmount || COPAY_RATES[appointmentType];
      alert(`Appointment booked! Co-pay of $${copay.toFixed(2)} collected.`);
      
      // Refresh appointments
      setAppointments([...appointments, {
        id: data.createAppointment?.id || Date.now().toString(),
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        status: 'BOOKED',
        type: appointmentType,
        copayAmount: copay,
        copayCollected: true,
      }]);
      setSelectedSlot(null);
    } catch (err: any) {
      alert('Booking failed: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'BOOKED': return '#4CAF50';
      case 'COMPLETED': return '#2196F3';
      case 'CANCELLED': return '#f44336';
      case 'WAITLIST': return '#FF9800';
      default: return '#757575';
    }
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '24px', color: '#1a73e8' }}>📅 Appointments</h2>

      {/* Booking Section */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 16px' }}>Book New Appointment</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Date</label>
            <input 
              type="date" 
              value={date} 
              onChange={e => setDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Provider</label>
            <select 
              value={providerId} 
              onChange={e => setProviderId(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
            >
              <option value="provider-1">Dr. Smith (Family Medicine)</option>
              <option value="provider-2">Dr. Johnson (Cardiology)</option>
              <option value="provider-3">Dr. Williams (Pediatrics)</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Type</label>
            <select 
              value={appointmentType} 
              onChange={e => setAppointmentType(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
            >
              <option value="TELEHEALTH">📹 Telehealth ($15 co-pay)</option>
              <option value="IN_PERSON">🏥 In-Person ($25 co-pay)</option>
              <option value="FOLLOW_UP">🔄 Follow-up ($20 co-pay)</option>
              <option value="URGENT">⚡ Urgent ($50 co-pay)</option>
            </select>
          </div>
        </div>

        {/* Available Slots */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Available Time Slots {loadingSlots && '(Loading...)'}
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {availableSlots.length === 0 && !loadingSlots && (
              <p style={{ color: '#666' }}>No slots available for this date</p>
            )}
            {availableSlots.map((slot, idx) => (
              <button
                key={idx}
                onClick={() => slot.available && setSelectedSlot(slot)}
                disabled={!slot.available}
                style={{
                  padding: '8px 16px',
                  border: selectedSlot === slot ? '2px solid #1a73e8' : '1px solid #ddd',
                  borderRadius: '6px',
                  background: !slot.available ? '#f5f5f5' : selectedSlot === slot ? '#e3f2fd' : 'white',
                  color: !slot.available ? '#999' : '#333',
                  cursor: slot.available ? 'pointer' : 'not-allowed',
                  textDecoration: !slot.available ? 'line-through' : 'none',
                }}
              >
                {formatTime(slot.startTime)}
              </button>
            ))}
          </div>
        </div>

        {/* Co-pay Info */}
        {selectedSlot && (
          <div style={{ background: '#e8f5e9', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
            <strong>Selected:</strong> {formatTime(selectedSlot.startTime)} - {formatTime(selectedSlot.endTime)}
            <br />
            <strong>Co-pay:</strong> ${COPAY_RATES[appointmentType]?.toFixed(2)} (collected at booking)
          </div>
        )}

        <button 
          onClick={handleBook}
          disabled={!selectedSlot || loading}
          style={{
            padding: '12px 24px',
            background: selectedSlot ? '#1a73e8' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: selectedSlot ? 'pointer' : 'not-allowed',
            fontWeight: 'bold',
          }}
        >
          {loading ? 'Booking...' : `Book Appointment ($${COPAY_RATES[appointmentType]?.toFixed(2)} co-pay)`}
        </button>
      </div>

      {/* Existing Appointments */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        <h3 style={{ margin: '0 0 16px' }}>Your Appointments</h3>
        {appointments.length === 0 ? (
          <p style={{ color: '#666' }}>No appointments scheduled.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {appointments.map(apt => (
              <div 
                key={apt.id} 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '16px', 
                  background: '#f8f9fa', 
                  borderRadius: '8px',
                  borderLeft: `4px solid ${getStatusColor(apt.status)}`,
                }}
              >
                <div>
                  <strong>{new Date(apt.startTime).toLocaleDateString()}</strong>
                  <span style={{ marginLeft: '8px', color: '#666' }}>
                    {formatTime(apt.startTime)} - {formatTime(apt.endTime)}
                  </span>
                  <span style={{ marginLeft: '8px', background: '#e0e0e0', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>
                    {apt.type}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ color: getStatusColor(apt.status), fontWeight: 'bold' }}>{apt.status}</span>
                  {apt.copayAmount && (
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      Co-pay: ${apt.copayAmount} {apt.copayCollected ? '✓' : '(pending)'}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Appointments;
