/** @jest-environment jsdom */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
const mockUseQuery = jest.fn()
const mockUseSubscription = jest.fn()
jest.mock('@redwoodjs/web', () => ({
  useQuery: (...args: any[]) => mockUseQuery(...args),
  useSubscription: (...args: any[]) => mockUseSubscription(...args),
  gql: (s: any) => s,
}), { virtual: true })

import { RealTimeSlotListing } from '../repository_after/web/src/components/Availability/RealTimeSlotListing';

describe('Real-time slot listing', () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockUseSubscription.mockReset();

    // Default return values to prevent TypeErrors
    mockUseQuery.mockReturnValue({
      data: { searchAvailability: [] },
      loading: false,
      refetch: jest.fn(),
    });
    mockUseSubscription.mockReturnValue({});
  });

  test('configures subscription when autoRefresh is true', () => {
    mockUseQuery.mockReturnValue({
      data: { searchAvailability: [] },
      loading: false,
      refetch: jest.fn(),
    })
    mockUseSubscription.mockReturnValue({});

    render(
      <RealTimeSlotListing
        providerId={123}
        service={{
          id: 99,
          name: 'Consultation',
          durationMinutes: 30,
          capacity: 1,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
        }}
        startISO="2026-02-10T00:00:00Z"
        endISO="2026-02-10T23:59:59Z"
        customerTz="UTC"
        autoRefresh={true}
      />
    );

    expect(mockUseSubscription).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        variables: {
          input: {
            providerId: 123,
            serviceId: 99,
            startISO: "2026-02-10T00:00:00Z",
            endISO: "2026-02-10T23:59:59Z",
            customerTz: "UTC",
          }
        },
        skip: false
      })
    );
  });

  test('after initial load shows either slots list or empty state', async () => {
    render(
      <RealTimeSlotListing
        providerId={1}
        service={{
          id: 1,
          name: 'Consultation',
          durationMinutes: 30,
          capacity: 1,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
        }}
        startISO="2026-02-10T00:00:00Z"
        endISO="2026-02-10T23:59:59Z"
        customerTz="UTC"
        autoRefresh={false}
      />
    );

    await act(async () => {
      // Small delay for Apollo mock behavior
      await new Promise(r => setTimeout(r, 100));
    });

    await waitFor(() => {
      const hasSlots = screen.queryByText('Total Showing');
      const hasEmpty = screen.queryByText('No available time slots found');
      expect(hasSlots || hasEmpty).toBeTruthy();
    });
  });

  test('displays Live badge when autoRefresh is enabled', () => {
    render(
      <RealTimeSlotListing
        providerId={1}
        service={{
          id: 1,
          name: 'Consultation',
          durationMinutes: 30,
          capacity: 1,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
        }}
        startISO="2026-02-10T00:00:00Z"
        endISO="2026-02-10T23:59:59Z"
        customerTz="UTC"
        autoRefresh={true}
      />
    );

    expect(screen.getByText('Live')).toBeInTheDocument();
  });
});
