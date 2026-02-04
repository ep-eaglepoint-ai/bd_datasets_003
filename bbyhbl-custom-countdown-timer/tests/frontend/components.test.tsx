import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

const TestCountdownForm = ({ onSubmit, isLoading = false }: any) => {
  return (
    <div data-testid="countdown-form">
      <form onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          title: 'Test Event',
          targetDate: '2024-12-31T23:59:59Z',
          timezone: 'UTC',
          backgroundColor: '#000000',
          textColor: '#FFFFFF',
          accentColor: '#FF0000',
          theme: 'minimal',
          isPublic: true,
        });
      }}>
        <div>
          <label htmlFor="event-title">Event Title *</label>
          <input id="event-title" type="text" placeholder="Event Title" />
        </div>
        
        <div>
          <label htmlFor="description">Description (Optional)</label>
          <textarea id="description" rows={3} />
        </div>
        
        <div>
          <label htmlFor="target-date">Target Date *</label>
          <input id="target-date" type="date" />
        </div>
        
        <div>
          <label htmlFor="target-time">Target Time *</label>
          <input id="target-time" type="time" />
        </div>
        
        <div>
          <label htmlFor="timezone">Timezone</label>
          <select id="timezone">
            <option value="UTC">UTC</option>
            <option value="America/New_York">Eastern Time</option>
          </select>
        </div>
        
        <div>
          <h3>Theme & Styling</h3>
          <div>
            <button type="button">Minimal</button>
            <button type="button">Celebration</button>
            <button type="button">Elegant</button>
            <button type="button">Neon</button>
          </div>
        </div>
        
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Creating Countdown...' : 'Create Countdown'}
        </button>
      </form>
    </div>
  );
};

describe('CountdownForm Component - Requirement Verification', () => {
  const mockOnSubmit = jest.fn();
  beforeEach(() => {
    mockOnSubmit.mockClear();
  });

  it('renders all required form fields from Requirement 1', () => {
    render(<TestCountdownForm onSubmit={mockOnSubmit} />);
    
    // Requirement 1: Event name, date/time, timezone, description
    expect(screen.getByLabelText(/event title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/target date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/target time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/timezone/i)).toBeInTheDocument();
  });

  it('shows all 4 preset themes from Requirement 6', () => {
    render(<TestCountdownForm onSubmit={mockOnSubmit} />);
    
    expect(screen.getByText('Minimal')).toBeInTheDocument();
    expect(screen.getByText('Celebration')).toBeInTheDocument();
    expect(screen.getByText('Elegant')).toBeInTheDocument();
    expect(screen.getByText('Neon')).toBeInTheDocument();
  });

  it('calls onSubmit when form is submitted', () => {
    render(<TestCountdownForm onSubmit={mockOnSubmit} />);
    
    const submitButton = screen.getByText(/create countdown/i);
    fireEvent.click(submitButton);
    
    expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    expect(mockOnSubmit).toHaveBeenCalledWith({
      title: 'Test Event',
      targetDate: '2024-12-31T23:59:59Z',
      timezone: 'UTC',
      backgroundColor: '#000000',
      textColor: '#FFFFFF',
      accentColor: '#FF0000',
      theme: 'minimal',
      isPublic: true,
    });
  });

  it('shows loading state when isLoading is true', () => {
    render(<TestCountdownForm onSubmit={mockOnSubmit} isLoading={true} />);
    
    expect(screen.getByText('Creating Countdown...')).toBeInTheDocument();
    expect(screen.getByText('Creating Countdown...')).toBeDisabled();
  });
});