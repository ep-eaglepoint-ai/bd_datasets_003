/**
 * Seat Booking Demo Component
 * Demonstrates high-concurrency seat reservation with optimistic UI
 */

import React from 'react';
import { useSeatBooking } from './hooks/useSeatBooking';

const getConnectionStatusStyle = (status: 'connected' | 'disconnected' | 'reconnecting') => {
  const baseStyle = {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    display: 'inline-block',
    marginRight: '8px',
  };

  switch (status) {
    case 'connected':
      return { ...baseStyle, backgroundColor: '#28a745' };
    case 'reconnecting':
      return { ...baseStyle, backgroundColor: '#ffc107' };
    case 'disconnected':
      return { ...baseStyle, backgroundColor: '#dc3545' };
    default:
      return { ...baseStyle, backgroundColor: '#6c757d' };
  }
};

export const SeatBookingDemo: React.FC = () => {
  const { 
    availableSeats, 
    isLoading, 
    error, 
    connectionStatus, 
    bookSeat 
  } = useSeatBooking();

  const isBookingDisabled = isLoading || availableSeats === 0 || connectionStatus === 'disconnected';

  return (
    <div style={{ 
      padding: '32px', 
      fontFamily: 'system-ui, -apple-system, sans-serif',
      maxWidth: '600px',
      margin: '0 auto',
      backgroundColor: '#f8f9fa',
      borderRadius: '12px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
    }}>
      <h1 style={{ 
        color: '#2c3e50',
        marginBottom: '24px',
        textAlign: 'center'
      }}>
        🎫 High-Concurrency Seat Reservation
      </h1>
      
      {/* Seat Counter Display */}
      <div style={{ 
        padding: '20px',
        backgroundColor: 'white',
        borderRadius: '8px',
        marginBottom: '20px',
        border: '2px solid #e9ecef'
      }}>
        <h2 style={{ 
          margin: '0 0 16px 0',
          color: '#495057',
          fontSize: '24px'
        }}>
          Available Seats: <span style={{ color: '#007bff' }}>{availableSeats}</span>
        </h2>
        
        {/* Connection Status Indicator */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          marginBottom: '12px',
          fontSize: '14px',
          color: '#6c757d'
        }}>
          <span style={getConnectionStatusStyle(connectionStatus)}></span>
          <span>Real-time Connection: </span>
          <strong style={{ 
            marginLeft: '4px',
            textTransform: 'capitalize',
            color: connectionStatus === 'connected' ? '#28a745' : '#dc3545'
          }}>
            {connectionStatus}
          </strong>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div style={{ 
            color: '#007bff',
            fontSize: '14px',
            fontWeight: '500',
            marginBottom: '8px'
          }}>
            ⏳ Processing optimistic booking...
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div style={{ 
            color: '#dc3545',
            fontSize: '14px',
            padding: '8px 12px',
            backgroundColor: '#f8d7da',
            border: '1px solid #f5c6cb',
            borderRadius: '4px',
            marginBottom: '8px'
          }}>
            ❌ {error}
          </div>
        )}
      </div>
      
      {/* Booking Button */}
      <button 
        onClick={bookSeat}
        disabled={isBookingDisabled}
        style={{
          width: '100%',
          padding: '16px 24px',
          fontSize: '18px',
          fontWeight: '600',
          backgroundColor: !isBookingDisabled ? '#007bff' : '#6c757d',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: !isBookingDisabled ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s ease',
          marginBottom: '24px'
        }}
      >
        {availableSeats > 0 
          ? '🎫 Book Seat (Optimistic UI)' 
          : '❌ No Seats Available'
        }
      </button>
      
      {/* Feature Showcase */}
      <div style={{ 
        padding: '20px',
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '2px solid #e9ecef'
      }}>
        <h3 style={{ 
          margin: '0 0 16px 0',
          color: '#495057',
          fontSize: '18px'
        }}>
          🚀 System Features Demonstrated:
        </h3>
        
        <ul style={{ 
          margin: 0, 
          paddingLeft: '20px',
          lineHeight: '1.6',
          color: '#6c757d'
        }}>
          <li><strong>Optimistic UI:</strong> Immediate seat count decrement for instant feedback</li>
          <li><strong>Automatic Rollback:</strong> State reverts on booking failures or conflicts</li>
          <li><strong>Server Authority:</strong> Real-time updates override local state via SSE</li>
          <li><strong>Concurrency Protection:</strong> Thread-safe operations with mutex locking</li>
          <li><strong>Connection Monitoring:</strong> Live status of real-time data stream</li>
          <li><strong>Error Handling:</strong> Graceful degradation with descriptive messages</li>
        </ul>
      </div>

      {/* Testing Instructions */}
      <div style={{ 
        marginTop: '20px',
        padding: '16px',
        backgroundColor: '#e7f3ff',
        border: '1px solid #b8daff',
        borderRadius: '6px',
        fontSize: '14px',
        color: '#004085'
      }}>
        <strong>🧪 Testing Instructions:</strong>
        <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
          <li>Open multiple browser tabs to test real-time synchronization</li>
          <li>Click "Book Seat" to observe optimistic UI behavior</li>
          <li>Watch automatic rollback when booking conflicts occur</li>
          <li>Monitor connection status during network interruptions</li>
        </ol>
      </div>
    </div>
  );
};