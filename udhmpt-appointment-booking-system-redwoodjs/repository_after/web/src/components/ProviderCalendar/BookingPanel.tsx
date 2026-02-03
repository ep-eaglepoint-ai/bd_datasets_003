import React, { useState } from 'react';
import { DateTime } from 'luxon';
import { LoadingState } from '../UI/LoadingState';
import { ErrorMessage } from '../UI/ErrorMessage';
import { ErrorBoundary } from '../UI/ErrorBoundary';

export type Booking = {
  id: number;
  startUtc: string;
  endUtc: string;
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed';
  notes?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  reference: string;
  service?: {
    id: number;
    name: string;
    durationMinutes: number;
    price?: number;
  };
  provider?: {
    name: string;
    timezone: string;
  };
  createdAt: string;
  updatedAt: string;
  canceledAt?: string;
  rescheduleCount?: number;
  paymentStatus?: 'paid' | 'pending' | 'refunded';
  amount?: number;
};

type Props = {
  booking: Booking;
  onSave: (updated: Booking) => Promise<void> | void;
  onClose?: () => void;
  customerTz?: string;
  showActions?: boolean;
  variant?: 'modal' | 'sidebar' | 'inline';
};

export const BookingPanel: React.FC<Props> = ({ 
  booking, 
  onSave, 
  onClose, 
  customerTz = 'UTC',
  showActions = true,
  variant = 'modal'
}) => {
  const [status, setStatus] = useState(booking.status);
  const [notes, setNotes] = useState(booking.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | Error | null>(null);

  const bookingStart = DateTime.fromISO(booking.startUtc, { zone: 'utc' });
  const bookingEnd = DateTime.fromISO(booking.endUtc, { zone: 'utc' });
  const localStart = bookingStart.setZone(customerTz);
  const localEnd = bookingEnd.setZone(customerTz);
  const now = DateTime.utc();

  const isPast = bookingEnd < now;
  const isUpcoming = bookingStart > now;
  const isOngoing = bookingStart <= now && bookingEnd >= now;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    
    try {
      await onSave({ ...booking, status, notes });
      if (onClose) onClose();
    } catch (err) {
      setError(err instanceof Error ? err : 'Failed to save booking');
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = () => {
    const statusConfig = {
      confirmed: { color: 'green', label: 'Confirmed' },
      pending: { color: 'yellow', label: 'Pending' },
      cancelled: { color: 'red', label: 'Cancelled' },
      completed: { color: 'blue', label: 'Completed' }
    };

    const config = statusConfig[booking.status];
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${config.color}-100 text-${config.color}-800`}>
        {config.label}
      </span>
    );
  };

  const getPaymentBadge = () => {
    if (!booking.paymentStatus) return null;
    
    const paymentConfig = {
      paid: { color: 'green', label: 'Paid' },
      pending: { color: 'yellow', label: 'Payment Pending' },
      refunded: { color: 'gray', label: 'Refunded' }
    };

    const config = paymentConfig[booking.paymentStatus];
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${config.color}-100 text-${config.color}-800`}>
        {config.label}
      </span>
    );
  };

  const getTimingBadge = () => {
    if (booking.canceledAt) return null;
    if (isPast) return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        Completed
      </span>
    );
    if (isOngoing) return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
        In Progress
      </span>
    );
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        Upcoming
      </span>
    );
  };

  const panelClasses = {
    modal: 'fixed inset-0 z-50 overflow-y-auto',
    sidebar: 'fixed right-0 top-0 h-full w-96 bg-white shadow-lg z-40',
    inline: 'relative'
  };

  return (
    <ErrorBoundary>
      <div className={panelClasses[variant]}>
        {variant === 'modal' && (
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" onClick={onClose}>
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <BookingContent />
              </div>
            </div>
          </div>
        )}
        
        {variant === 'sidebar' && (
          <div className="h-full overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900">Booking Details</h2>
                <button
                  onClick={onClose}
                  className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <BookingContent />
            </div>
          </div>
        )}
        
        {variant === 'inline' && (
          <BookingContent />
        )}
      </div>
    </ErrorBoundary>
  );

  function BookingContent() {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Booking #{booking.id}</h3>
            <p className="text-sm text-gray-500">Reference: {booking.reference}</p>
          </div>
          <div className="flex items-center space-x-2">
            {getStatusBadge()}
            {getTimingBadge()}
            {getPaymentBadge()}
          </div>
        </div>

        <LoadingState isLoading={saving} error={error} variant="inline">
          {/* Customer Information */}
          <div className="card">
            <div className="card-header">
              <h4 className="card-title">Customer Information</h4>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <div className="mt-1 text-sm text-gray-900">{booking.customerName || 'N/A'}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <div className="mt-1 text-sm text-gray-900">{booking.customerEmail || 'N/A'}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone</label>
                  <div className="mt-1 text-sm text-gray-900">{booking.customerPhone || 'N/A'}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Created</label>
                  <div className="mt-1 text-sm text-gray-900">
                    {DateTime.fromISO(booking.createdAt).toLocaleString(DateTime.DATETIME_SHORT)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Service Information */}
          <div className="card">
            <div className="card-header">
              <h4 className="card-title">Service Details</h4>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Service</label>
                  <div className="mt-1 text-sm text-gray-900">{booking.service?.name || 'N/A'}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Duration</label>
                  <div className="mt-1 text-sm text-gray-900">{booking.service?.durationMinutes || 60} minutes</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Provider</label>
                  <div className="mt-1 text-sm text-gray-900">{booking.provider?.name || 'N/A'}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Price</label>
                  <div className="mt-1 text-sm text-gray-900">
                    {booking.amount ? `$${booking.amount.toFixed(2)}` : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Timing Information */}
          <div className="card">
            <div className="card-header">
              <h4 className="card-title">Schedule</h4>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Start Time</label>
                  <div className="mt-1 text-sm text-gray-900">
                    {localStart.toLocaleString(DateTime.DATETIME_FULL)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {bookingStart.toUTC().toLocaleString(DateTime.DATETIME_SHORT)} UTC
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">End Time</label>
                  <div className="mt-1 text-sm text-gray-900">
                    {localEnd.toLocaleString(DateTime.DATETIME_FULL)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {bookingEnd.toUTC().toLocaleString(DateTime.DATETIME_SHORT)} UTC
                  </div>
                </div>
              </div>
              
              {booking.rescheduleCount && booking.rescheduleCount > 0 && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="text-sm text-blue-800">
                    This booking has been rescheduled {booking.rescheduleCount} time(s)
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Status and Notes */}
          {showActions && (
            <div className="card">
              <div className="card-header">
                <h4 className="card-title">Management</h4>
              </div>
              <div className="card-body">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Status</label>
                    <select
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      value={status}
                      onChange={(e) => setStatus(e.target.value as Booking['status'])}
                      disabled={!!(booking.canceledAt || isPast)}
                    >
                      <option value="confirmed">Confirmed</option>
                      <option value="pending">Pending</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Notes</label>
                    <textarea
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add notes about this booking..."
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          {showActions && (
            <div className="flex justify-end space-x-3">
              <button
                onClick={onClose}
                disabled={saving}
                className="btn btn-secondary"
              >
                Close
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !!(booking.canceledAt || isPast)}
                className="btn btn-primary"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </LoadingState>
      </div>
    );
  }
};

export default BookingPanel;
