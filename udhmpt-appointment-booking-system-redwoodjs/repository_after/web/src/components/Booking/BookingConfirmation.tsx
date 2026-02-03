import React from 'react';
import { DateTime } from 'luxon';

export type BookingConfirmationProps = {
  reference: string;
  startUtc?: string;
  endUtc?: string;
  serviceName?: string;
  customerTz?: string;
};

/** Confirmation screen shown after a successful booking; displays booking reference and details. */
export const BookingConfirmation: React.FC<BookingConfirmationProps> = ({
  reference,
  startUtc,
  endUtc,
  serviceName,
  customerTz = 'UTC',
}) => {
  const startLocal = startUtc ? DateTime.fromISO(startUtc, { zone: 'utc' }).setZone(customerTz).toFormat('ff') : null;
  const endLocal = endUtc ? DateTime.fromISO(endUtc, { zone: 'utc' }).setZone(customerTz).toFormat('t') : null;

  return (
    <div className="card max-w-lg" data-testid="booking-confirmation">
      <div className="card-header">
        <h2 className="card-title text-xl">Booking confirmed!</h2>
      </div>
      <div className="card-body space-y-4">
        <p className="text-gray-700" data-testid="booking-confirmation-message">
          Your appointment has been booked successfully.
        </p>
        <div className="p-4 bg-gray-50 rounded-lg font-mono text-sm break-all" data-testid="booking-reference">
          Reference: {reference}
        </div>
        {serviceName && (
          <p className="text-sm text-gray-600" data-testid="booking-service">
            Service: {serviceName}
          </p>
        )}
        {startLocal && endLocal && (
          <p className="text-sm text-gray-600" data-testid="booking-time">
            {startLocal} – {endLocal}
          </p>
        )}
      </div>
    </div>
  );
};

export default BookingConfirmation;
