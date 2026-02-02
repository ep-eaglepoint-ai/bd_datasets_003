
import { useEffect, useState } from 'react';
import { gqlRequest } from '../api/client';

const MedicalRecords = () => {
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    const fetchRecords = async () => {
        try {
            const query = `
                query {
                    medicalRecords {
                        id
                        date
                        type
                        # summary - Field might not exist in backend entity yet, checking schema
                        # Using available fields or updating backend entity later
                        # For now, let's assume specific fields
                    }
                }
            `;
            // Note: The backend entity currently only has minimal fields. 
            // We'll fetch what's available or mock the rest for display safety
            const data = await gqlRequest(query);
            setRecords(data.medicalRecords.map((r: any) => ({
                ...r,
                summary: 'View Details' // Placeholder until backend has summary
            })));
        } catch (err) {
            console.error(err);
        }
    };
    fetchRecords();
  }, []);

  return (
    <div className="container">
      <h2>Medical Records</h2>
      <div className="card">
        {records.length === 0 ? <p>No records found.</p> : (
            <table style={{ width: '100%', textAlign: 'left' }}>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Summary</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {records.map(rec => (
                        <tr key={rec.id}>
                            <td>{rec.date}</td>
                            <td>{rec.type}</td>
                            <td>{rec.summary}</td>
                            <td><button className="btn">View</button></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        )}
      </div>
    </div>
  );
};

export default MedicalRecords;
