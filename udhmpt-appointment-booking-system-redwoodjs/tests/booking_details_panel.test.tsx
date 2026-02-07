/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BookingPanel } from '../repository_after/web/src/components/ProviderCalendar/BookingPanel';

describe('Booking details panel', () => {
  test('renders booking details and allows notes update', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const booking = {
      id: 101,
      startUtc: '2026-02-10T14:00:00Z',
      endUtc: '2026-02-10T15:00:00Z',
      status: 'confirmed' as const,
      notes: 'Initial note',
      customerName: 'Alex Doe',
      customerEmail: 'alex@example.com',
      customerPhone: '123-456',
      reference: 'REF-BOOK-101',
      service: { id: 5, name: 'Consultation', durationMinutes: 60 },
      provider: { name: 'Provider A', timezone: 'UTC' },
      createdAt: '2026-02-01T10:00:00Z',
      updatedAt: '2026-02-01T10:00:00Z',
      rescheduleCount: 1,
      paymentStatus: 'paid' as const,
      amount: 100,
    };

    render(
      <BookingPanel
        booking={booking}
        onSave={onSave}
        customerTz="UTC"
        variant="inline"
      />
    );

    expect(screen.getByText('Booking #101')).toBeInTheDocument();
    expect(screen.getByText('Reference: REF-BOOK-101')).toBeInTheDocument();
    expect(screen.getByText('Customer Information')).toBeInTheDocument();
    expect(screen.getByText('alex@example.com')).toBeInTheDocument();
    expect(screen.getByText('Service Details')).toBeInTheDocument();
    expect(screen.getByText('Consultation')).toBeInTheDocument();

    const notes = screen.getByTestId('notes-textarea');
    fireEvent.change(notes, { target: { value: 'Updated note' } });

    fireEvent.click(screen.getByTestId('save-button'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ notes: 'Updated note' }));
    });
  });
});
