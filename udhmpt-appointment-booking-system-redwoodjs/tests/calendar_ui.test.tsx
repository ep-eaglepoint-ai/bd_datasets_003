/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProviderCalendar from '../repository_after/web/src/components/ProviderCalendar/ProviderCalendar';
import { Booking } from '../repository_after/web/src/components/ProviderCalendar/BookingPanel';
import { DateTime } from 'luxon';

describe('ProviderCalendar UI', () => {
  test('Calendar fetch correctness for day/week/month', async () => {
    const bookings: Booking[] = [];
    const fetchBookings = jest.fn(async (start: string, end: string) => {
      bookings.push({ id: 1, startUtc: start, endUtc: end, status: 'confirmed', notes: '', customerName: 'A', reference: 'ref-1', createdAt: '2021-11-10T00:00:00Z', updatedAt: '2021-11-10T00:00:00Z' });
      return bookings;
    });

    const anchor = '2021-11-10T00:00:00Z';
    const { rerender } = render(<ProviderCalendar view="day" currentDateISO={anchor} fetchBookings={fetchBookings} saveBooking={async () => {}} />);
    await waitFor(() => expect(fetchBookings).toHaveBeenCalled());
    const dayCall = fetchBookings.mock.calls[0];
    expect(dayCall[0]).toContain('2021-11-10');

    fetchBookings.mockClear();
    rerender(<ProviderCalendar view="week" currentDateISO={anchor} fetchBookings={fetchBookings} saveBooking={async () => {}} />);
    await waitFor(() => expect(fetchBookings).toHaveBeenCalled());
    const weekCall = fetchBookings.mock.calls[0];
    const weekStartWeekday = DateTime.fromISO(weekCall[0]).weekday;
    expect([1, 2]).toContain(weekStartWeekday); // Monday (1) or Tuesday (2) depending on Luxon week start

    fetchBookings.mockClear();
    rerender(<ProviderCalendar view="month" currentDateISO={anchor} fetchBookings={fetchBookings} saveBooking={async () => {}} />);
    await waitFor(() => expect(fetchBookings).toHaveBeenCalled());
    const monthCall = fetchBookings.mock.calls[0];
    expect(DateTime.fromISO(monthCall[0]).day).toBe(1);
  });

  test('Status transitions and notes persistence', async () => {
    // Use future date so Save button is enabled (panel disables when booking is past)
    const booking: Booking = { id: 2, startUtc: '2030-06-12T09:00:00Z', endUtc: '2030-06-12T10:00:00Z', status: 'pending', notes: '', customerName: 'Bob', reference: 'ref-2', createdAt: '2030-06-12T00:00:00Z', updatedAt: '2030-06-12T00:00:00Z' };
    const fetchBookings = jest.fn(async () => [booking]);
    const saveBooking = jest.fn(async (b: Booking) => { booking.status = b.status; booking.notes = b.notes; });

    render(<ProviderCalendar view="day" currentDateISO={'2030-06-12T00:00:00Z'} fetchBookings={fetchBookings} saveBooking={saveBooking} />);
    await waitFor(() => expect(fetchBookings).toHaveBeenCalled());

    const openBtn = await screen.findByTestId('open-2');
    fireEvent.click(openBtn);

    const statusSelect = await screen.findByTestId('status-select');
    fireEvent.change(statusSelect, { target: { value: 'confirmed' } });

    const notesArea = await screen.findByTestId('notes-textarea');
    fireEvent.change(notesArea, { target: { value: 'Arrive 10 minutes early' } });

    const saveBtn = await screen.findByTestId('save-button');
    fireEvent.click(saveBtn);

    await waitFor(() => expect(saveBooking).toHaveBeenCalled());
    expect(booking.status).toBe('confirmed');
    expect(booking.notes).toBe('Arrive 10 minutes early');
  });
});
