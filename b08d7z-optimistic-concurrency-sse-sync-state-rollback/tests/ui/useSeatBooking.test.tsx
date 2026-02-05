import fs from 'node:fs';
import path from 'node:path';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSeatBooking } from '../../repository_after/frontend/src/hooks/useSeatBooking';

type MockMessageEvent = { data: string };

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onmessage: ((event: MockMessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  emitOpen() {
    this.onopen?.();
  }

  emitMessage(data: string) {
    this.onmessage?.({ data });
  }

  emitError() {
    this.onerror?.();
  }
}

describe('useSeatBooking Hook - Requirements Validation', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    MockEventSource.instances = [];
    (global as any).EventSource = MockEventSource;
    (global as any).fetch = mockFetch;
  });

  // REQ-1 mapping: frontend hook implementation must use native APIs only (no axios/react-query/socket libs).
  test('TestMustNotUseExternalLibraries', async () => {
    const implPath = path.join(__dirname, '../../repository_after/frontend/src/hooks/useSeatBooking.ts');
    const source = fs.readFileSync(implPath, 'utf8');
    expect(source).not.toMatch(/axios|socket\.io|tanstack-query|react-query/);

    const { result } = renderHook(() => useSeatBooking('http://localhost:8080'));

    await waitFor(() => {
      expect(MockEventSource.instances.length).toBe(1);
    });

    expect(result.current).toHaveProperty('availableSeats');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('error');
    expect(result.current).toHaveProperty('connectionStatus');
    expect(result.current).toHaveProperty('bookSeat');
  });

  // REQ-5 mapping: verifies previous state is tracked and used for rollback.
  test('TestMustUseUseRefOrUseStateToTrackPreviousStateForRollbackPurposes', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ success: false }),
    });

    const implPath = path.join(__dirname, '../../repository_after/frontend/src/hooks/useSeatBooking.ts');
    const source = fs.readFileSync(implPath, 'utf8');
    expect(source).not.toMatch(/axios|socket\.io|tanstack-query|react-query/);

    const { result } = renderHook(() => useSeatBooking('http://localhost:8080'));

    act(() => {
      MockEventSource.instances[0].emitMessage('5');
    });

    await waitFor(() => expect(result.current.availableSeats).toBe(5));

    let promise: Promise<void>;
    act(() => {
      promise = result.current.bookSeat();
    });

    await waitFor(() => expect(result.current.availableSeats).toBe(4));

    await act(async () => {
      await promise;
    });

    await waitFor(() => expect(result.current.availableSeats).toBe(5));
  });

  // REQ-6 mapping: verifies optimistic decrement happens before fetch resolves.
  test('TestStateDecrementMustHappenBeforeFetchPromiseResolvesOptimistic', async () => {
    let resolveFetch: (value: any) => void = () => {};
    mockFetch.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    const implPath = path.join(__dirname, '../../repository_after/frontend/src/hooks/useSeatBooking.ts');
    const source = fs.readFileSync(implPath, 'utf8');
    expect(source).not.toMatch(/axios|socket\.io|tanstack-query|react-query/);

    const { result } = renderHook(() => useSeatBooking('http://localhost:8080'));

    act(() => {
      MockEventSource.instances[0].emitMessage('5');
    });
    await waitFor(() => expect(result.current.availableSeats).toBe(5));

    let promise: Promise<void>;
    act(() => {
      promise = result.current.bookSeat();
    });

    await waitFor(() => {
      expect(result.current.availableSeats).toBe(4);
      expect(result.current.isLoading).toBe(true);
    });

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ success: true }) });
      await promise;
    });

    expect(result.current.isLoading).toBe(false);
  });

  // REQ-7 mapping: verifies non-200 responses revert state to previous value.
  test('TestIfFetchFailsCatchBlockOrNon200StatusStateMustRevertToPreviousValue', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ success: false }),
    });

    const implPath = path.join(__dirname, '../../repository_after/frontend/src/hooks/useSeatBooking.ts');
    const source = fs.readFileSync(implPath, 'utf8');
    expect(source).not.toMatch(/axios|socket\.io|tanstack-query|react-query/);

    const { result } = renderHook(() => useSeatBooking('http://localhost:8080'));

    act(() => MockEventSource.instances[0].emitMessage('1'));
    await waitFor(() => expect(result.current.availableSeats).toBe(1));

    await act(async () => {
      await result.current.bookSeat();
    });

    await waitFor(() => {
      expect(result.current.availableSeats).toBe(1);
      expect(result.current.error).toContain('No seats available');
    });
  });

  // REQ-8 mapping: verifies EventSource lifecycle managed in effect and closed on unmount.
  test('TestMustUseUseEffectToManageEventSourceConnectionAndCloseItOnUnmount', async () => {
    const { unmount } = renderHook(() => useSeatBooking('http://localhost:8080'));

    await waitFor(() => expect(MockEventSource.instances.length).toBe(1));
    const es = MockEventSource.instances[0];

    act(() => es.emitOpen());

    unmount();
    expect(es.closed).toBe(true);
  });

  // REQ-10 mapping: verifies 500/network error causes immediate decrement then automatic rollback.
  test('TestRollbackTestFrontendMockFetchToReturn500ErrorCallBookSeatVerifyStateDecrementsImmediatelyVisualFeedbackWaitsForDelayThenRevertsToOriginalValueAutomatically', async () => {
    mockFetch.mockRejectedValueOnce(new Error('500 Internal Server Error'));

    const implPath = path.join(__dirname, '../../repository_after/frontend/src/hooks/useSeatBooking.ts');
    const source = fs.readFileSync(implPath, 'utf8');
    expect(source).not.toMatch(/axios|socket\.io|tanstack-query|react-query/);

    const { result } = renderHook(() => useSeatBooking('http://localhost:8080'));

    act(() => MockEventSource.instances[0].emitMessage('5'));
    await waitFor(() => expect(result.current.availableSeats).toBe(5));

    let bookingPromise: Promise<void>;
    act(() => {
      bookingPromise = result.current.bookSeat();
    });

    await waitFor(() => expect(result.current.availableSeats).toBe(4));

    await act(async () => {
      await bookingPromise;
    });

    await waitFor(() => {
      expect(result.current.availableSeats).toBe(5);
      expect(result.current.error).toContain('Network error');
    });
  });

  // REQ-11 mapping: verifies SSE message updates client state without extra interaction.
  test('TestResyncTestFullStackConnectClientAAndClientBClientABooksSeatVerifyClientBReceivesSSEUpdateAndUpdatesDisplayedCountWithoutAnyInteraction', async () => {
    const implPath = path.join(__dirname, '../../repository_after/frontend/src/hooks/useSeatBooking.ts');
    const source = fs.readFileSync(implPath, 'utf8');
    expect(source).not.toMatch(/axios|socket\.io|tanstack-query|react-query/);

    const { result } = renderHook(() => useSeatBooking('http://localhost:8080'));

    const es = MockEventSource.instances[0];
    act(() => {
      es.emitOpen();
      es.emitMessage('10');
    });

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connected');
      expect(result.current.availableSeats).toBe(10);
    });

    act(() => es.emitMessage('9'));
    await waitFor(() => expect(result.current.availableSeats).toBe(9));
  });

  test('TestSuccessfulBookingFlow', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    const implPath = path.join(__dirname, '../../repository_after/frontend/src/hooks/useSeatBooking.ts');
    const source = fs.readFileSync(implPath, 'utf8');
    expect(source).not.toMatch(/axios|socket\.io|tanstack-query|react-query/);

    const { result } = renderHook(() => useSeatBooking('http://localhost:8080'));

    act(() => MockEventSource.instances[0].emitMessage('3'));
    await waitFor(() => expect(result.current.availableSeats).toBe(3));

    await act(async () => {
      await result.current.bookSeat();
    });

    await waitFor(() => {
      expect(result.current.availableSeats).toBe(2);
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });
  });

  test('TestConnectionStatusManagement', async () => {
    const implPath = path.join(__dirname, '../../repository_after/frontend/src/hooks/useSeatBooking.ts');
    const source = fs.readFileSync(implPath, 'utf8');
    expect(source).not.toMatch(/axios|socket\.io|tanstack-query|react-query/);

    const { result } = renderHook(() => useSeatBooking('http://localhost:8080'));

    const es = MockEventSource.instances[0];
    act(() => es.emitOpen());
    await waitFor(() => expect(result.current.connectionStatus).toBe('connected'));

    act(() => es.emitError());
    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('disconnected');
      expect(result.current.error).toContain('Real-time connection lost');
    });
  });
});
