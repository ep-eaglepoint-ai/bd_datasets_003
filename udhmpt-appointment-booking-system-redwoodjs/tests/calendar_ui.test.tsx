/** @jest-environment jsdom */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProviderCalendar from '../repository_after/web/src/components/ProviderCalendar/ProviderCalendar';
import { DateTime } from 'luxon';

// Mock BookingsCell since it is used by ProviderCalendar
jest.mock('../repository_after/web/src/components/BookingsCell/BookingsCell', () => {
  return {
    __esModule: true,
    BookingsCell: jest.fn(() => <div data-testid="bookings-cell">Bookings</div>),
  };
});

jest.mock('@redwoodjs/web', () => ({
  useMutation: jest.fn(() => [jest.fn(), { loading: false, error: null }]),
  useQuery: jest.fn(() => ({ data: null, loading: true })),
  gql: (s: any) => s,
}), { virtual: true });

// @ts-ignore
import { BookingsCell } from '../repository_after/web/src/components/BookingsCell/BookingsCell';

jest.mock('../repository_after/web/src/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, role: 'PROVIDER', providerProfileId: 1 },
    loading: false,
  }),
}));

describe('ProviderCalendar UI', () => {
  test('Calendar fetch correctness for day/week/month', async () => {
    const anchor = '2021-11-10T00:00:00Z';
    const { rerender } = render(<ProviderCalendar view="day" currentDateISO={anchor} providerId={1} />);

    await waitFor(() => expect(BookingsCell).toHaveBeenCalled());
    const dayCall = (BookingsCell as jest.Mock).mock.calls[(BookingsCell as jest.Mock).mock.calls.length - 1][0];

    // Day view: start and end should be within the same day
    expect(dayCall.startISO).toContain('2021-11-10');
    expect(dayCall.endISO).toContain('2021-11-10');

    (BookingsCell as jest.Mock).mockClear();
    rerender(<ProviderCalendar view="week" currentDateISO={anchor} providerId={1} />);

    await waitFor(() => expect(BookingsCell).toHaveBeenCalled());
    const weekCall = (BookingsCell as jest.Mock).mock.calls[0][0];
    // Week view logic: ISO week starts on Monday.
    const weekStartWeekday = DateTime.fromISO(weekCall.startISO).weekday;
    expect(weekStartWeekday).toBe(1);

    (BookingsCell as jest.Mock).mockClear();
    rerender(<ProviderCalendar view="month" currentDateISO={anchor} providerId={1} />);

    await waitFor(() => expect(BookingsCell).toHaveBeenCalled());
    const monthCall = (BookingsCell as jest.Mock).mock.calls[0][0];
    expect(DateTime.fromISO(monthCall.startISO).day).toBe(1);
  });
});
