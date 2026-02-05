'use client';

import { useEffect, useState, FormEvent } from 'react';
import { usePayments } from '@/hooks/usePayments';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

export default function PaymentsPage() {
    const { user } = useAuth();
    const {
        payments,
        isLoading,
        error,
        pagination,
        fetchPayments,
        createPayment,
        refundPayment,
        deletePayment,
    } = usePayments();

    const [showModal, setShowModal] = useState(false);
    const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
    const [twoFactorToken, setTwoFactorToken] = useState('');
    const [showRefundModal, setShowRefundModal] = useState(false);

    const [formData, setFormData] = useState({
        amount: '',
        currency: 'USD',
        description: '',
        cardLastFour: '',
    });
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        fetchPayments();
    }, [fetchPayments]);

    const validateForm = () => {
        const errors: Record<string, string> = {};

        if (!formData.amount || parseFloat(formData.amount) <= 0) {
            errors.amount = 'Valid amount is required';
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleCreatePayment = async (e: FormEvent) => {
        e.preventDefault();

        if (!validateForm()) return;

        const result = await createPayment(
            {
                amount: parseFloat(formData.amount),
                currency: formData.currency,
                description: formData.description || undefined,
                cardLastFour: formData.cardLastFour || undefined,
            },
            user?.twoFactorEnabled ? twoFactorToken : undefined
        );

        if (result.success) {
            toast.success('Payment created successfully!');
            setShowModal(false);
            setFormData({ amount: '', currency: 'USD', description: '', cardLastFour: '' });
            setTwoFactorToken('');
        } else {
            toast.error(result.error || 'Failed to create payment');
        }
    };

    const handleRefund = async () => {
        if (!selectedPayment) return;

        const result = await refundPayment(
            selectedPayment,
            user?.twoFactorEnabled ? twoFactorToken : undefined
        );

        if (result.success) {
            toast.success('Payment refunded successfully!');
            setShowRefundModal(false);
            setSelectedPayment(null);
            setTwoFactorToken('');
        } else {
            toast.error(result.error || 'Failed to refund payment');
        }
    };

    const handleDelete = async (paymentId: string) => {
        if (!confirm('Are you sure you want to delete this payment record?')) return;

        const result = await deletePayment(paymentId);

        if (result.success) {
            toast.success('Payment record deleted');
        } else {
            toast.error(result.error || 'Failed to delete payment');
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'completed':
                return 'badge-success';
            case 'pending':
                return 'badge-warning';
            case 'failed':
                return 'badge-danger';
            case 'refunded':
                return 'badge-info';
            default:
                return 'badge-primary';
        }
    };

    return (
        <div className="container py-8">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="page-title" style={{ fontSize: '1.75rem' }}>Payments</h1>
                    <p className="text-secondary">Manage your secure transactions</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="btn btn-primary"
                >
                    + New Payment
                </button>
            </div>

            {error && (
                <div className="alert alert-error mb-4">
                    {error}
                </div>
            )}

            <div className="card">
                <div className="card-body" style={{ padding: 0 }}>
                    {isLoading && payments.length === 0 ? (
                        <div className="flex justify-center items-center py-8">
                            <div className="spinner" />
                        </div>
                    ) : payments.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-muted mb-4">No payments found</p>
                            <button onClick={() => setShowModal(true)} className="btn btn-secondary">
                                Create your first payment
                            </button>
                        </div>
                    ) : (
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Transaction ID</th>
                                    <th>Amount</th>
                                    <th>Description</th>
                                    <th>Status</th>
                                    <th>Date</th>
                                    <th className="text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payments.map((payment) => (
                                    <tr key={payment.id}>
                                        <td className="font-semibold text-sm">{payment.transactionId}</td>
                                        <td>
                                            <span className="font-semibold">
                                                {payment.currency} {payment.amount.toFixed(2)}
                                            </span>
                                        </td>
                                        <td className="text-muted text-sm">
                                            {payment.description || '-'}
                                        </td>
                                        <td>
                                            <span className={`badge ${getStatusBadge(payment.status)}`}>
                                                {payment.status}
                                            </span>
                                        </td>
                                        <td className="text-muted text-sm">
                                            {new Date(payment.createdAt).toLocaleDateString()}
                                        </td>
                                        <td className="text-right">
                                            <div className="flex justify-end gap-2">
                                                {payment.status === 'completed' && (
                                                    <button
                                                        onClick={() => {
                                                            setSelectedPayment(payment.id);
                                                            setShowRefundModal(true);
                                                        }}
                                                        className="btn btn-secondary btn-sm"
                                                    >
                                                        Refund
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDelete(payment.id)}
                                                    className="btn btn-danger btn-sm"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {pagination && pagination.pages > 1 && (
                    <div className="card-footer flex justify-between items-center">
                        <span className="text-sm text-muted">
                            Showing {payments.length} of {pagination.total} payments
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => fetchPayments(pagination.page - 1)}
                                disabled={pagination.page === 1}
                                className="btn btn-secondary btn-sm"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => fetchPayments(pagination.page + 1)}
                                disabled={pagination.page >= pagination.pages}
                                className="btn btn-secondary btn-sm"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">Create Payment</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>
                                ✕
                            </button>
                        </div>
                        <form onSubmit={handleCreatePayment}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Amount</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        className={`form-input ${formErrors.amount ? 'error' : ''}`}
                                        placeholder="0.00"
                                        value={formData.amount}
                                        onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                                    />
                                    {formErrors.amount && <p className="form-error">{formErrors.amount}</p>}
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Currency</label>
                                    <select
                                        className="form-input"
                                        value={formData.currency}
                                        onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value }))}
                                    >
                                        <option value="USD">USD</option>
                                        <option value="EUR">EUR</option>
                                        <option value="GBP">GBP</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Description (Optional)</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Payment description"
                                        value={formData.description}
                                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Card Last 4 Digits (Optional)</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="1234"
                                        maxLength={4}
                                        value={formData.cardLastFour}
                                        onChange={(e) => setFormData(prev => ({ ...prev, cardLastFour: e.target.value.replace(/\D/g, '') }))}
                                    />
                                </div>

                                {user?.twoFactorEnabled && (
                                    <div className="form-group">
                                        <label className="form-label">2FA Code</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="000000"
                                            maxLength={6}
                                            value={twoFactorToken}
                                            onChange={(e) => setTwoFactorToken(e.target.value.replace(/\D/g, ''))}
                                        />
                                        <p className="form-hint">Required for payment operations</p>
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={isLoading}>
                                    {isLoading ? 'Processing...' : 'Create Payment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showRefundModal && (
                <div className="modal-overlay" onClick={() => setShowRefundModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">Confirm Refund</h2>
                            <button className="modal-close" onClick={() => setShowRefundModal(false)}>
                                ✕
                            </button>
                        </div>
                        <div className="modal-body">
                            <p className="text-secondary mb-4">
                                Are you sure you want to refund this payment? This action cannot be undone.
                            </p>

                            {user?.twoFactorEnabled && (
                                <div className="form-group">
                                    <label className="form-label">2FA Code</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="000000"
                                        maxLength={6}
                                        value={twoFactorToken}
                                        onChange={(e) => setTwoFactorToken(e.target.value.replace(/\D/g, ''))}
                                    />
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowRefundModal(false)}>
                                Cancel
                            </button>
                            <button className="btn btn-danger" onClick={handleRefund} disabled={isLoading}>
                                {isLoading ? 'Processing...' : 'Confirm Refund'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
