
import { useState, useEffect } from 'react';
import { gqlRequest } from '../api/client';

const Billing = () => {
  const [invoices, setInvoices] = useState<any[]>([]);

  useEffect(() => {
    const fetchInvoices = async () => {
        try {
            const query = `
                query {
                    invoices {
                        id
                        amount
                        description
                        status
                        date
                    }
                }
            `;
            const data = await gqlRequest(query);
            setInvoices(data.invoices);
        } catch (err) {
            console.error(err);
        }
    };
    fetchInvoices();
  }, []);

  return (
    <div className="container">
      <h2>Billing & Invoices</h2>
      <div className="card">
        <h3>Your Invoices</h3>
        {invoices.length === 0 ? <p>No invoices found.</p> : (
            <table style={{width: '100%'}}>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Amount</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {invoices.map((inv: any) => (
                        <tr key={inv.id}>
                            <td>{new Date(inv.date).toLocaleDateString()}</td>
                            <td>{inv.description}</td>
                            <td>${inv.amount}</td>
                            <td><span className={`badge ${inv.status === 'PAID' ? 'badge-success' : 'badge-warning'}`}>{inv.status}</span></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        )}
      </div>
    </div>
  );
};

export default Billing;
