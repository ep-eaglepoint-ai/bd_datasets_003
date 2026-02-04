/**
 * High-Concurrency Seat Reservation Frontend Hook
 * Principal Full Stack Engineer Implementation
 * 
 * This custom React hook implements optimistic UI with automatic rollback for seat bookings:
 * - Immediate local state updates for responsiveness (Optimistic UI)
 * - Automatic rollback on booking failures or network errors
 * - Real-time synchronization via Server-Sent Events (Server Authority)
 * - Connection status management and error handling
 *
 * REQ-1: Uses only native fetch and EventSource (no external libraries)
 * REQ-5: useRef tracks previous state for rollback purposes
 * REQ-6: State decrements before fetch promise resolves (Optimistic)
 * REQ-7: Automatic rollback on fetch failures or non-200 responses
 * REQ-8: useEffect manages EventSource connection lifecycle
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// Type definitions for seat booking state management
interface SeatBookingState {
  availableSeats: number;
  isLoading: boolean;
  error: string | null;
}

interface UseSeatBookingReturn {
  availableSeats: number;
  isLoading: boolean;
  error: string | null;
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
  bookSeat: () => Promise<void>;
}

/**
 * Custom React hook for managing seat reservations with optimistic UI
 * 
 * @param serverUrl - Base URL of the seat reservation server
 * @returns Hook interface with seat state and booking function
 */
export const useSeatBooking = (
  serverUrl: string = 'http://localhost:8080'
): UseSeatBookingReturn => {
  
  // REQ-5: useState manages current seat booking state
  const [seatState, setSeatState] = useState<SeatBookingState>({
    availableSeats: 0,
    isLoading: false,
    error: null,
  });

  // Connection status for SSE monitoring
  const [connectionStatus, setConnectionStatus] = useState<
    'connected' | 'disconnected' | 'reconnecting'
  >('disconnected');

  // REQ-5: useRef tracks previous seat count for rollback functionality
  const previousSeatCountRef = useRef<number>(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Update previous seat count whenever current count changes
  useEffect(() => {
    previousSeatCountRef.current = seatState.availableSeats;
  }, [seatState.availableSeats]);

  // REQ-8: useEffect manages EventSource connection lifecycle
  useEffect(() => {
    // REQ-1: Create EventSource using native browser API (no external libraries)
    const eventSource = new EventSource(`${serverUrl}/events`);
    eventSourceRef.current = eventSource;
    setConnectionStatus('reconnecting');

    // Handle successful SSE connection
    eventSource.onopen = () => {
      setConnectionStatus('connected');
      setSeatState(prev => ({ ...prev, error: null }));
    };

    // Handle incoming seat count updates from server
    eventSource.onmessage = (event) => {
      const newSeatCount = parseInt(event.data, 10);
      
      if (!isNaN(newSeatCount)) {
        // Server Authority: Override local state with server data
        setSeatState(prev => ({
          ...prev,
          availableSeats: newSeatCount,
          error: null,
        }));
      }
    };

    // Handle SSE connection errors
    eventSource.onerror = () => {
      setConnectionStatus('disconnected');
      setSeatState(prev => ({
        ...prev,
        error: 'Real-time connection lost',
      }));
    };

    // REQ-8: Cleanup EventSource connection on component unmount
    return () => {
      eventSource.close();
      eventSourceRef.current = null;
      setConnectionStatus('disconnected');
    };
  }, [serverUrl]);

  /**
   * REQ-6 & REQ-7: Optimistic seat booking with automatic rollback
   * 
   * Implementation strategy:
   * 1. Immediately decrement local state (Optimistic UI)
   * 2. Send booking request to server
   * 3. On success: Keep optimistic state
   * 4. On failure: Rollback to previous state
   */
  const bookSeat = useCallback(async (): Promise<void> => {
    // Prevent multiple concurrent bookings
    if (seatState.isLoading || seatState.availableSeats <= 0) {
      return;
    }

    // Store current state for potential rollback
    const currentSeatCount = seatState.availableSeats;
    
    // REQ-6: Optimistic UI - decrement state BEFORE fetch resolves
    setSeatState(prev => ({
      ...prev,
      availableSeats: Math.max(0, prev.availableSeats - 1),
      isLoading: true,
      error: null,
    }));

    try {
      // REQ-1: Use native fetch API (no external libraries like axios)
      const response = await fetch(`${serverUrl}/book`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // REQ-7: Handle non-200 responses with automatic rollback
      if (!response.ok) {
        // Rollback optimistic state to previous value
        setSeatState(prev => ({
          ...prev,
          availableSeats: currentSeatCount,
          isLoading: false,
          error: response.status === 409 
            ? 'No seats available - booking conflict' 
            : `Booking failed with status ${response.status}`,
        }));
        return;
      }

      // Success: Parse response and maintain optimistic state
      await response.json();
      
      setSeatState(prev => ({
        ...prev,
        isLoading: false,
        error: null,
      }));

    } catch (networkError) {
      // REQ-7: Handle network errors with automatic rollback
      setSeatState(prev => ({
        ...prev,
        availableSeats: currentSeatCount, // Rollback to previous value
        isLoading: false,
        error: 'Network error - please check your connection',
      }));
    }
  }, [serverUrl, seatState.availableSeats, seatState.isLoading]);

  // Return hook interface
  return {
    availableSeats: seatState.availableSeats,
    isLoading: seatState.isLoading,
    error: seatState.error,
    connectionStatus,
    bookSeat,
  };
};