
import { useState, useEffect } from 'react';
import { gqlRequest } from '../api/client';

const Appointments = () => {
  const [date, setDate] = useState('');
  const [providerId] = useState('1'); // Mock provider mock
  const [appointments, setAppointments] = useState<any[]>([]);

  useEffect(() => {
    const fetchAppointments = async () => {
        try {
            const query = `
                query {
                    appointments {
                        id
                        startTime
                        status
                        # providerId - currently not exposed in entity relation efficiently here, or check schema
                    }
                }
            `;
            const data = await gqlRequest(query);
            setAppointments(data.appointments.map((a: any) => ({
                id: a.id,
                date: new Date(a.startTime).toLocaleDateString(),
                providerId: '1' // Backend might not resolve provider relation yet, keeping mock
            })));
        } catch (err) {
            console.error(err);
        }
    };
    fetchAppointments();
  }, []);

  const handleBook = async () => {
    try {
        // Simplified booking for demo
        const mutation = `
            mutation {
                createAppointment(createAppointmentInput: {
                    patientId: "1",
                    providerId: "${providerId}",
                    startTime: "${date}T10:00:00Z",
                    endTime: "${date}T10:30:00Z",
                    type: TELEHEALTH
                }) {
                    id
                }
            }
        `;
        await gqlRequest(mutation);
        alert('Appointment booked!');
        setAppointments([...appointments, { id: Date.now(), date, providerId }]);
    } catch (err: any) {
        alert('Booking failed: ' + err.message);
    }
  };

  return (
    <div className="container">
      <h2>Appointments</h2>
      <div className="card">
        <h3>Book New Appointment</h3>
        <input 
            type="date" 
            className="input" 
            value={date} 
            onChange={e => setDate(e.target.value)} 
        />
        <button className="btn btn-primary" onClick={handleBook}>Book Slot</button>
      </div>

      <div className="card">
        <h3>Upcoming Appointments</h3>
        {appointments.length === 0 ? <p>No appointments booked.</p> : (
            <ul>
                {appointments.map(apt => (
                    <li key={apt.id}>
                        {apt.date} with Provider {apt.providerId}
                    </li>
                ))}
            </ul>
        )}
      </div>
    </div>
  );
};

export default Appointments;
