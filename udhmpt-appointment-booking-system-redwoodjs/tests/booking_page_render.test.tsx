/** @jest-environment jsdom */
import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

jest.mock('@redwoodjs/web', () => ({
  useMutation: jest.fn(() => [jest.fn(), { loading: false, error: null }]),
  useQuery: jest.fn(() => ({
    data: {
      providerProfiles: [{ id: 1, name: 'Provider One' }],
      services: [
        {
          id: 1,
          providerId: 1,
          name: 'Consultation',
          durationMinutes: 30,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
          capacity: 1,
        },
      ],
    },
    loading: false,
  })),
  useSubscription: jest.fn(() => ({ data: null })),
  gql: (s: any) => s,
}), { virtual: true })

jest.mock('../repository_after/web/src/components/BookingsCell/BookingsCell', () => ({
  BookingsCell: () => <div data-testid="bookings-cell" />,
}))

jest.mock('../repository_after/web/src/auth/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    loading: false,
    user: { id: 1, email: 'provider@test.com', role: 'PROVIDER' },
    logout: jest.fn(),
  }),
}))

import BookingPage from '../repository_after/web/src/pages/BookingsPage/BookingsPage'

describe('BookingsPage render', () => {
  test('renders without module resolution errors', () => {
    render(<BookingPage providerId={1} customerEmail="customer@example.com" />)
    expect(screen.getByText('Book Appointment')).toBeInTheDocument()
  })
})
