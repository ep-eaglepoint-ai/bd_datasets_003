import React, { useState } from 'react';
import { DateTime } from 'luxon';
import { LoadingState } from '../UI/LoadingState';
import { ErrorMessage } from '../UI/ErrorMessage';
import { ErrorBoundary } from '../UI/ErrorBoundary';
import { toast } from '@redwoodjs/web/toast';

type Booking = {
  id: number;
  startUtc: string;
  endUtc: string;
  customerEmail: string;
  reference: string;
  canceledAt?: string;
  service?: {
    name: string;
    durationMinutes: number;
  };
};

type Policy = {
  cancellationWindowHours: number;
  rescheduleWindowHours: number;
  cancellationFee?: number;
  rescheduleFee?: number;
  penaltiesApply?: boolean;
  maxReschedules?: number;
};

type Props = {
  booking: Booking;
  policy: Policy;
  customerTz: string;
  onCancel?: (bookingId: number, reason?: string) => Promise<void>;
  onReschedule?: (bookingId: number, newStartUtc: string, newEndUtc: string) => Promise<void>;
  showActions?: boolean;
  variant?: 'card' | 'inline';
};

export const BookingActions: React.FC<Props> = ({
  booking,
  policy,
  customerTz,
  onCancel,
  onReschedule,
  showActions = true,
  variant = 'card'
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | Error | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const bookingStart = DateTime.fromISO(booking.startUtc, { zone: 'utc' });
  const bookingEnd = DateTime.fromISO(booking.endUtc, { zone: 'utc' });
  const now = DateTime.utc();
  const localStart = bookingStart.setZone(customerTz);

  // Check if actions are allowed based on policies
  const canCancel = !booking.canceledAt &&
    now.plus({ hours: policy.cancellationWindowHours }) <= bookingStart;

  const canReschedule = !booking.canceledAt &&
    now.plus({ hours: policy.rescheduleWindowHours }) <= bookingStart;

  const handleCancel = async () => {
    if (!onCancel) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      await onCancel(booking.id, cancelReason || 'Customer requested cancellation');
      setShowCancelModal(false);
      setCancelReason('');
      toast.success('Booking cancelled');
    } catch (err) {
      setError(err instanceof Error ? err : 'Failed to cancel booking');
      toast.error('Failed to cancel booking');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReschedule = async (newStartUtc: string, newEndUtc: string) => {
    if (!onReschedule) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      await onReschedule(booking.id, newStartUtc, newEndUtc);
      setShowRescheduleModal(false);
      toast.success('Booking rescheduled');
    } catch (err) {
      setError(err instanceof Error ? err : 'Failed to reschedule booking');
      toast.error('Failed to reschedule booking');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = () => {
    if (booking.canceledAt) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          Canceled
        </span>
      );
    }
    
    if (bookingStart < now) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Completed
        </span>
      );
    }
    
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        Upcoming
      </span>
    );
  };

  const getPolicyWarning = () => {
    const warnings = [];
    
    if (!canCancel && !booking.canceledAt) {
      const hoursUntil = bookingStart.diff(now).as('hours');
      if (hoursUntil <= policy.cancellationWindowHours) {
        warnings.push(`Cancellation window closed (${policy.cancellationWindowHours}h required)`);
      }
    }
    
    if (!canReschedule && !booking.canceledAt) {
      const hoursUntil = bookingStart.diff(now).as('hours');
      if (hoursUntil <= policy.rescheduleWindowHours) {
        warnings.push(`Reschedule window closed (${policy.rescheduleWindowHours}h required)`);
      }
    }
    
    return warnings;
  };

  const policyWarnings = getPolicyWarning();

  if (variant === 'inline') {
    return (
      <ErrorBoundary>
        <div className="flex items-center space-x-2">
          {getStatusBadge()}
          {showActions && !booking.canceledAt && (
            <>
              {canReschedule && onReschedule && (
                <button
                  onClick={() => setShowRescheduleModal(true)}
                  className="btn btn-secondary btn-sm"
                >
                  Reschedule
                </button>
              )}
              {canCancel && onCancel && (
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="btn btn-error btn-sm"
                >
                  Cancel
                </button>
              )}
            </>
          )}
        </div>
        
        {/* Modals would go here */}
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="card">
        <div className="card-header">
          <div className="flex items-center justify-between">
            <h3 className="card-title">Booking Actions</h3>
            {getStatusBadge()}
          </div>
        </div>
        
        <div className="card-body">
          <LoadingState isLoading={isLoading} error={error} variant="inline">
            <div className="space-y-4">
              {/* Booking details */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-500">Date & Time</div>
                    <div className="font-medium">
                      {localStart.toLocaleString(DateTime.DATETIME_FULL)}
                    </div>
                    <div className="text-sm text-gray-500">
                      Duration: {booking.service?.durationMinutes || 60} minutes
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Reference</div>
                    <div className="font-medium font-mono">{booking.reference}</div>
                    <div className="text-sm text-gray-500">{booking.customerEmail}</div>
                  </div>
                </div>
              </div>

              {/* Policy warnings */}
              {policyWarnings.length > 0 && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <div className="flex items-start">
                    <svg className="h-5 w-5 text-yellow-600 mt-0.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <div className="text-sm font-medium text-yellow-800">Policy Restrictions</div>
                      <ul className="mt-1 text-sm text-yellow-700 list-disc list-inside">
                        {policyWarnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Policy information */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                <div className="text-sm font-medium text-blue-800 mb-2">Booking Policies</div>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Cancel up to {policy.cancellationWindowHours} hours before appointment</li>
                  <li>• Reschedule up to {policy.rescheduleWindowHours} hours before appointment</li>
                  {policy.cancellationFee && policy.penaltiesApply && (
                    <li>• Cancellation fee: {policy.cancellationFee} cents</li>
                  )}
                  {policy.rescheduleFee && policy.penaltiesApply && (
                    <li>• Reschedule fee: {policy.rescheduleFee} cents</li>
                  )}
                  {policy.maxReschedules && (
                    <li>• Maximum reschedules: {policy.maxReschedules}</li>
                  )}
                </ul>
              </div>

              {/* Action buttons */}
              {showActions && !booking.canceledAt && (
                <div className="flex flex-col sm:flex-row gap-3">
                  {canReschedule && onReschedule && (
                    <button
                      onClick={() => setShowRescheduleModal(true)}
                      className="btn btn-secondary flex-1"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                      Reschedule Booking
                    </button>
                  )}
                  {canCancel && onCancel && (
                    <button
                      onClick={() => setShowCancelModal(true)}
                      className="btn btn-error flex-1"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Cancel Booking
                    </button>
                  )}
                </div>
              )}

              {!canCancel && !canReschedule && !booking.canceledAt && (
                <div className="text-center py-4 text-gray-500">
                  <svg className="mx-auto h-8 w-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-sm">Booking cannot be modified due to policy restrictions</p>
                </div>
              )}
            </div>
          </LoadingState>
        </div>
      </div>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" onClick={() => setShowCancelModal(false)}>
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      Cancel Booking
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        Are you sure you want to cancel this booking? This action cannot be undone.
                      </p>
                      {policy.cancellationFee && policy.penaltiesApply && (
                        <p className="text-sm text-red-600 mt-2">
                          Note: A {policy.cancellationFee} cent cancellation fee may apply.
                        </p>
                      )}
                    </div>
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700">
                        Reason for cancellation (optional)
                      </label>
                      <textarea
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        rows={3}
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        placeholder="Please provide a reason for cancellation..."
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isLoading}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                >
                  {isLoading ? 'Canceling...' : 'Cancel Booking'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  disabled={isLoading}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Keep Booking
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {showRescheduleModal && (
        <RescheduleModal
          booking={booking}
          customerTz={customerTz}
          onReschedule={handleReschedule}
          onClose={() => setShowRescheduleModal(false)}
          isLoading={isLoading}
          policy={policy}
        />
      )}
    </ErrorBoundary>
  );
};

// Reschedule Modal Component
type RescheduleModalProps = {
  booking: Booking;
  customerTz: string;
  onReschedule: (newStartUtc: string, newEndUtc: string) => void;
  onClose: () => void;
  isLoading: boolean;
  policy: Policy;
};

const RescheduleModal: React.FC<RescheduleModalProps> = ({
  booking,
  customerTz,
  onReschedule,
  onClose,
  isLoading,
  policy
}) => {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');

  const handleSubmit = () => {
    if (!selectedDate || !selectedTime) return;
    
    const newStart = DateTime.fromISO(`${selectedDate}T${selectedTime}`, { zone: customerTz });
    const duration = DateTime.fromISO(booking.endUtc).diff(DateTime.fromISO(booking.startUtc)).as('minutes');
    const newEnd = newStart.plus({ minutes: duration });
    
    onReschedule(newStart.toUTC().toISO()!, newEnd.toUTC().toISO()!);
  };

  const currentLocalStart = DateTime.fromISO(booking.startUtc, { zone: 'utc' }).setZone(customerTz);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" onClick={onClose}>
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>
        
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
                <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  Reschedule Booking
                </h3>
                <div className="mt-2">
                  <p className="text-sm text-gray-500">
                    Current booking: {currentLocalStart.toLocaleString(DateTime.DATETIME_FULL)}
                  </p>
                  {policy.rescheduleFee && policy.penaltiesApply && (
                    <p className="text-sm text-blue-600 mt-2">
                      Note: A {policy.rescheduleFee} cent reschedule fee may apply.
                    </p>
                  )}
                </div>
                
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      New Date
                    </label>
                    <input
                      type="date"
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      value={selectedDate || ''}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      min={DateTime.now().setZone(customerTz).toISODate() || ''}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      New Time
                    </label>
                    <input
                      type="time"
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      value={selectedTime || ''}
                      onChange={(e) => setSelectedTime(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading || !selectedDate || !selectedTime}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
            >
              {isLoading ? 'Rescheduling...' : 'Reschedule Booking'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingActions;
