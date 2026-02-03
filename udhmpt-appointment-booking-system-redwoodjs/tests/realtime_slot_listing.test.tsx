/** @jest-environment jsdom */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RealTimeSlotListing } from '../repository_after/web/src/components/Availability/RealTimeSlotListing';

describe('Real-time slot listing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('configures auto-refresh interval when autoRefresh is true', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval');

    render(
      <RealTimeSlotListing
        providerId={1}
        startISO="2026-02-10T00:00:00Z"
        endISO="2026-02-10T23:59:59Z"
        customerTz="UTC"
        autoRefresh={true}
        refreshInterval={30}
      />
    );

    // Real-time listing should set an interval for periodic refresh (30s = 30000ms)
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30000);
    setIntervalSpy.mockRestore();
  });

  test('after initial load shows either slots list or empty state', async () => {
    render(
      <RealTimeSlotListing
        providerId={1}
        startISO="2026-02-10T00:00:00Z"
        endISO="2026-02-10T23:59:59Z"
        customerTz="UTC"
        autoRefresh={false}
      />
    );

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
    await waitFor(() => {
      const hasSlots = screen.queryByText('Total Slots');
      const hasEmpty = screen.queryByText('No available time slots found');
      expect(hasSlots || hasEmpty).toBeTruthy();
    });
  });

  test('displays Live badge when autoRefresh is enabled', () => {
    render(
      <RealTimeSlotListing
        providerId={1}
        startISO="2026-02-10T00:00:00Z"
        endISO="2026-02-10T23:59:59Z"
        customerTz="UTC"
        autoRefresh={true}
      />
    );

    expect(screen.getByText('Live')).toBeInTheDocument();
  });
});
