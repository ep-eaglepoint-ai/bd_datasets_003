/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BookingConfirmation } from '../repository_after/web/src/components/Booking/BookingConfirmation';

describe('Booking confirmation screen', () => {
  test('displays confirmation message and booking reference after successful book', () => {
    const reference = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    render(<BookingConfirmation reference={reference} />);

    expect(screen.getByTestId('booking-confirmation')).toBeInTheDocument();
    expect(screen.getByText('Booking confirmed!')).toBeInTheDocument();
    expect(screen.getByTestId('booking-reference')).toHaveTextContent(`Reference: ${reference}`);
    expect(screen.getByTestId('booking-confirmation-message')).toHaveTextContent('booked successfully');
  });

  test('displays service name and time when provided', () => {
    const reference = 'REF-ABC-123';
    render(
      <BookingConfirmation
        reference={reference}
        serviceName="Consultation (30 min)"
        startUtc="2026-02-10T14:00:00Z"
        endUtc="2026-02-10T14:30:00Z"
        customerTz="America/New_York"
      />
    );

    expect(screen.getByTestId('booking-reference')).toHaveTextContent('REF-ABC-123');
    expect(screen.getByTestId('booking-service')).toHaveTextContent('Consultation (30 min)');
    expect(screen.getByTestId('booking-time')).toBeInTheDocument();
  });
});
