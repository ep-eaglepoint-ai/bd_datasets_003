import React, { useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import BookingPanel, { Booking } from './BookingPanel';
import { LoadingState } from '../UI/LoadingState';
import { ErrorMessage } from '../UI/ErrorMessage';
import { ErrorBoundary } from '../UI/ErrorBoundary';

type View = 'day' | 'week' | 'month';

type Props = {
  view: View;
  currentDateISO: string; // anchor date
  fetchBookings: (startISO: string, endISO: string) => Promise<Booking[]>;
  saveBooking: (b: Booking) => Promise<void>;
};

export const ProviderCalendar: React.FC<Props> = ({ view, currentDateISO, fetchBookings, saveBooking }) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | Error | null>(null);

  const computeRange = () => {
    const dt = DateTime.fromISO(currentDateISO, { zone: 'utc' });
    if (view === 'day') {
      return { start: dt.startOf('day').toISO()!, end: dt.endOf('day').toISO()! };
    }
    if (view === 'week') {
      const monday = dt.startOf('week').plus({ days: 1 });
      return { start: monday.startOf('day').toISO()!, end: monday.plus({ days: 6 }).endOf('day').toISO()! };
    }
    // month
    return { start: dt.startOf('month').toISO()!, end: dt.endOf('month').toISO()! };
  };

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { start, end } = computeRange();
      const data = await fetchBookings(start, end);
      setBookings(data);
    } catch (err) {
      setError(err instanceof Error ? err : 'Failed to load bookings');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, [view, currentDateISO]);

  const handleSave = async (updated: Booking) => {
    await saveBooking(updated);
    await load();
  };

  return (
    <ErrorBoundary>
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Calendar - {view.charAt(0).toUpperCase() + view.slice(1)} View</h2>
        </div>
        <div className="card-body">
          <LoadingState isLoading={isLoading} error={error} variant="full">
            <div>
              <div data-testid="calendar-view" className="mb-4">View: {view}</div>
              
              {bookings.length === 0 && !isLoading && (
                <div className="text-center py-8 text-gray-500">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="mt-2">No bookings found for this period</p>
                </div>
              )}

              {bookings.length > 0 && (
                <ul data-testid="booking-list" className="space-y-2">
                  {bookings.map(b => (
                    <li key={b.id} className="p-3 border rounded-md hover:bg-gray-50">
                      <button 
                        data-testid={`open-${b.id}`} 
                        onClick={() => setSelected(b)}
                        className="w-full text-left flex items-center justify-between"
                      >
                        <div>
                          <span className="font-medium">{b.customerName}</span>
                          <span className="text-gray-500 ml-2">
                            {DateTime.fromISO(b.startUtc).toLocaleString(DateTime.DATETIME_SHORT)}
                          </span>
                        </div>
                        <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {selected && (
                <BookingPanel 
                  booking={selected} 
                  onSave={handleSave} 
                  onClose={() => setSelected(null)} 
                />
              )}
            </div>
          </LoadingState>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default ProviderCalendar;
