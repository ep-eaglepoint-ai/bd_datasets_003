
import { useState, useEffect } from 'react';
import { gqlRequest } from '../api/client';

interface Invoice {
  id: string;
  amount: number;
  description: string;
  status: string;
  date: string;
  claimId?: string;
  insurancePortion?: number;
  patientPortion?: number;
}

interface PaymentPlan {
  id: string;
  totalAmount: number;
  remainingBalance: number;
  numberOfInstallments: number;
  installmentAmount: number;
  installmentsPaid: number;
  status: string;
  nextPaymentDue?: string;
  autoPayEnabled: boolean;
}

const Billing = () => {
  const [activeTab, setActiveTab] = useState<'invoices' | 'plans'>('invoices');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentPlans, setPaymentPlans] = useState<PaymentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [planMonths, setPlanMonths] = useState(3);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const query = `
          query {
            invoices {
              id
              amount
              description
              status
              date
              claimId
            }
          }
        `;
        const data = await gqlRequest(query);
        setInvoices(data.invoices || []);
      } catch (err) {
        console.error(err);
        // Mock data for demo
        setInvoices([
          { id: '1', amount: 250.00, description: 'Annual Physical Exam', status: 'PAID', date: '2026-01-15', claimId: 'CLM-2026-001', insurancePortion: 200, patientPortion: 50 },
          { id: '2', amount: 150.00, description: 'Lab Work - Blood Panel', status: 'PENDING', date: '2026-01-28', claimId: 'CLM-2026-002', insurancePortion: 120, patientPortion: 30 },
          { id: '3', amount: 800.00, description: 'Specialist Consultation', status: 'PENDING', date: '2026-02-01', claimId: 'CLM-2026-003', insurancePortion: 600, patientPortion: 200 },
        ]);
        setPaymentPlans([
          { id: 'pp-1', totalAmount: 500, remainingBalance: 300, numberOfInstallments: 5, installmentAmount: 100, installmentsPaid: 2, status: 'ACTIVE', nextPaymentDue: '2026-02-15', autoPayEnabled: true },
        ]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const totalOwed = invoices.filter(i => i.status !== 'PAID').reduce((sum, i) => sum + (i.patientPortion || i.amount), 0);
  const totalPaid = invoices.filter(i => i.status === 'PAID').reduce((sum, i) => sum + (i.patientPortion || i.amount), 0);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID': return '#4CAF50';
      case 'PENDING': return '#FF9800';
      case 'OVERDUE': return '#F44336';
      case 'ACTIVE': return '#2196F3';
      case 'COMPLETED': return '#4CAF50';
      default: return '#757575';
    }
  };

  const createPaymentPlan = async () => {
    if (!selectedInvoice) return;
    
    const plan: PaymentPlan = {
      id: `pp-${Date.now()}`,
      totalAmount: selectedInvoice.patientPortion || selectedInvoice.amount,
      remainingBalance: selectedInvoice.patientPortion || selectedInvoice.amount,
      numberOfInstallments: planMonths,
      installmentAmount: Math.ceil((selectedInvoice.patientPortion || selectedInvoice.amount) / planMonths),
      installmentsPaid: 0,
      status: 'ACTIVE',
      nextPaymentDue: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      autoPayEnabled: false,
    };
    
    setPaymentPlans([...paymentPlans, plan]);
    setShowPlanModal(false);
    setSelectedInvoice(null);
    alert(`Payment plan created: $${plan.installmentAmount}/month for ${planMonths} months`);
  };

  const makePayment = (planId: string) => {
    setPaymentPlans(plans => plans.map(p => {
      if (p.id === planId) {
        const newPaid = p.installmentsPaid + 1;
        const newBalance = p.remainingBalance - p.installmentAmount;
        return {
          ...p,
          installmentsPaid: newPaid,
          remainingBalance: Math.max(0, newBalance),
          status: newPaid >= p.numberOfInstallments ? 'COMPLETED' : 'ACTIVE',
          nextPaymentDue: newPaid < p.numberOfInstallments 
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            : undefined,
        };
      }
      return p;
    }));
    alert('Payment processed successfully!');
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '24px', color: '#1a73e8' }}>💳 Billing & Payments</h2>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#ffebee', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '28px', color: '#d32f2f' }}>${totalOwed.toFixed(2)}</h2>
          <p style={{ margin: '8px 0 0', color: '#666' }}>Total Balance Due</p>
        </div>
        <div style={{ background: '#e8f5e9', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '28px', color: '#388e3c' }}>${totalPaid.toFixed(2)}</h2>
          <p style={{ margin: '8px 0 0', color: '#666' }}>Paid This Year</p>
        </div>
        <div style={{ background: '#e3f2fd', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '28px', color: '#1976d2' }}>{paymentPlans.filter(p => p.status === 'ACTIVE').length}</h2>
          <p style={{ margin: '8px 0 0', color: '#666' }}>Active Payment Plans</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          onClick={() => setActiveTab('invoices')}
          style={{
            padding: '12px 24px',
            border: 'none',
            background: activeTab === 'invoices' ? '#1a73e8' : '#f5f5f5',
            color: activeTab === 'invoices' ? 'white' : '#333',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          📄 Invoices ({invoices.length})
        </button>
        <button
          onClick={() => setActiveTab('plans')}
          style={{
            padding: '12px 24px',
            border: 'none',
            background: activeTab === 'plans' ? '#1a73e8' : '#f5f5f5',
            color: activeTab === 'plans' ? 'white' : '#333',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          📅 Payment Plans ({paymentPlans.length})
        </button>
      </div>

      {/* Invoices Tab */}
      {activeTab === 'invoices' && (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          {loading ? (
            <p style={{ padding: '20px' }}>Loading...</p>
          ) : invoices.length === 0 ? (
            <p style={{ padding: '20px', color: '#666' }}>No invoices found.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #e0e0e0' }}>
                  <th style={{ padding: '16px', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '16px', textAlign: 'left' }}>Description</th>
                  <th style={{ padding: '16px', textAlign: 'left' }}>Claim ID</th>
                  <th style={{ padding: '16px', textAlign: 'right' }}>Insurance</th>
                  <th style={{ padding: '16px', textAlign: 'right' }}>You Owe</th>
                  <th style={{ padding: '16px', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '16px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #e0e0e0' }}>
                    <td style={{ padding: '16px' }}>{new Date(inv.date).toLocaleDateString()}</td>
                    <td style={{ padding: '16px' }}>{inv.description}</td>
                    <td style={{ padding: '16px', fontFamily: 'monospace', fontSize: '12px', color: '#666' }}>{inv.claimId || 'N/A'}</td>
                    <td style={{ padding: '16px', textAlign: 'right', color: '#4CAF50' }}>
                      ${(inv.insurancePortion || 0).toFixed(2)}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right', fontWeight: 'bold' }}>
                      ${(inv.patientPortion || inv.amount).toFixed(2)}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        color: 'white',
                        background: getStatusColor(inv.status),
                      }}>
                        {inv.status}
                      </span>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      {inv.status !== 'PAID' && (
                        <>
                          <button
                            onClick={() => { setSelectedInvoice(inv); setShowPlanModal(true); }}
                            style={{ padding: '6px 12px', background: '#1a73e8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '8px' }}
                          >
                            Payment Plan
                          </button>
                          <button
                            onClick={() => alert('Redirecting to payment...')}
                            style={{ padding: '6px 12px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            Pay Now
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Payment Plans Tab */}
      {activeTab === 'plans' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {paymentPlans.length === 0 ? (
            <p style={{ color: '#666', padding: '20px', background: 'white', borderRadius: '12px' }}>No payment plans. Create one from an unpaid invoice.</p>
          ) : (
            paymentPlans.map(plan => (
              <div key={plan.id} style={{ 
                background: 'white', 
                borderRadius: '12px', 
                padding: '24px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                borderLeft: `4px solid ${getStatusColor(plan.status)}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px' }}>Payment Plan</h3>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: 'white',
                      background: getStatusColor(plan.status),
                    }}>
                      {plan.status}
                    </span>
                    {plan.autoPayEnabled && (
                      <span style={{ marginLeft: '8px', color: '#4CAF50', fontSize: '12px' }}>✓ Auto-Pay</span>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold' }}>${plan.remainingBalance.toFixed(2)}</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>remaining of ${plan.totalAmount.toFixed(2)}</div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div style={{ background: '#e0e0e0', borderRadius: '4px', height: '8px', marginBottom: '16px' }}>
                  <div style={{ 
                    background: '#4CAF50', 
                    height: '100%', 
                    borderRadius: '4px',
                    width: `${(plan.installmentsPaid / plan.numberOfInstallments) * 100}%`,
                    transition: 'width 0.3s',
                  }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ color: '#666' }}>
                    <strong>{plan.installmentsPaid}</strong> of <strong>{plan.numberOfInstallments}</strong> payments made
                    <span style={{ marginLeft: '16px' }}>
                      ${plan.installmentAmount.toFixed(2)}/month
                    </span>
                  </div>
                  {plan.status === 'ACTIVE' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      {plan.nextPaymentDue && (
                        <span style={{ color: '#666', fontSize: '14px' }}>
                          Next due: {new Date(plan.nextPaymentDue).toLocaleDateString()}
                        </span>
                      )}
                      <button
                        onClick={() => makePayment(plan.id)}
                        style={{ padding: '10px 20px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        Make Payment (${plan.installmentAmount.toFixed(2)})
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Payment Plan Modal */}
      {showPlanModal && selectedInvoice && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '32px', borderRadius: '16px', maxWidth: '400px', width: '100%' }}>
            <h3 style={{ marginTop: 0 }}>Create Payment Plan</h3>
            <p style={{ color: '#666' }}>
              For: {selectedInvoice.description}<br />
              Amount: <strong>${(selectedInvoice.patientPortion || selectedInvoice.amount).toFixed(2)}</strong>
            </p>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Number of Months</label>
              <select 
                value={planMonths} 
                onChange={e => setPlanMonths(Number(e.target.value))}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
              >
                {[2, 3, 4, 6, 12, 24].map(m => (
                  <option key={m} value={m}>{m} months (${Math.ceil((selectedInvoice.patientPortion || selectedInvoice.amount) / m)}/mo)</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => { setShowPlanModal(false); setSelectedInvoice(null); }}
                style={{ flex: 1, padding: '12px', background: '#f5f5f5', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={createPaymentPlan}
                style={{ flex: 1, padding: '12px', background: '#1a73e8', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Create Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Billing;
