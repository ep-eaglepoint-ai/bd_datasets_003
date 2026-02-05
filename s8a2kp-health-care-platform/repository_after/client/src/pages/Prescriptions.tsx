
import { useState, useEffect } from 'react';
import { gqlRequest } from '../api/client';

const Prescriptions = () => {
    const [prescriptions, setPrescriptions] = useState<any[]>([]);

    useEffect(() => {
        const fetchPrescriptions = async () => {
            try {
                const query = `
                    query {
                        prescriptions {
                            id
                            medicationName
                            dosage
                            status
                        }
                    }
                `;
                const data = await gqlRequest(query);
                setPrescriptions(data.prescriptions);
            } catch (err) {
                console.error(err);
            }
        };
        fetchPrescriptions();
    }, []);

    const handleRefill = (id: string) => {
        alert(`Refill requested for prescription ${id}`);
    }

  return (
    <div className="container">
      <h2>Prescriptions</h2>
      <div className="card">
        {prescriptions.length === 0 ? <p>No prescriptions found.</p> : (
            prescriptions.map(rx => (
                <div key={rx.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', padding: '1rem 0' }}>
                    <div>
                        <strong>{rx.medicationName}</strong>
                        <div style={{ fontSize: '0.9rem', color: '#666' }}>{rx.dosage} • {rx.status}</div>
                    </div>
                    <button className="btn btn-primary" onClick={() => handleRefill(rx.id)}>Request Refill</button>
                </div>
            ))
        )}
      </div>
    </div>
  );
};

export default Prescriptions;
