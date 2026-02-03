import React, { useState, useEffect, useCallback } from 'react';
import { DateTime } from 'luxon';
import { LoadingState } from '../UI/LoadingState';
import { ErrorMessage } from '../UI/ErrorMessage';
import { ErrorBoundary } from '../UI/ErrorBoundary';
import { LinearProgress } from '../UI/ProgressIndicator';

type Slot = {
  id: string;
  startUtcISO: string;
  endUtcISO: string;
  startLocalISO: string;
  endLocalISO: string;
  available: boolean;
  bookingCount?: number;
  capacity?: number;
};

type Service = {
  id: number;
  name: string;
  durationMinutes: number;
  capacity: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
};

type Props = {
  providerId: number;
  service?: Service;
  startISO: string;
  endISO: string;
  customerTz: string;
  onSlotSelect?: (slot: Slot) => void;
  autoRefresh?: boolean; // Enable real-time updates
  refreshInterval?: number; // Seconds
  initialSlots?: Slot[]; // Optional initial data from Cell query (avoids double loading)
};

export const RealTimeSlotListing: React.FC<Props> = ({
  providerId,
  service,
  startISO,
  endISO,
  customerTz,
  onSlotSelect,
  autoRefresh = true,
  refreshInterval = 30,
  initialSlots,
}) => {
  const initial = Array.isArray(initialSlots) ? initialSlots : [];
  const [slots, setSlots] = useState<Slot[]>(initial);
  const [isLoading, setIsLoading] = useState(!initial.length);
  const [error, setError] = useState<string | Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<DateTime | null>(initial.length ? DateTime.utc() : null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  const fetchSlots = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // In a real implementation, this would call the GraphQL API
      // For now, we'll simulate the API call with realistic data
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Mock API response that would come from searchAvailability
      const mockSlots: Slot[] = generateMockSlots(providerId, service, startISO, endISO, customerTz);
      
      setSlots(mockSlots);
      setLastUpdated(DateTime.utc());
    } catch (err) {
      setError(err instanceof Error ? err : 'Failed to load available slots');
    } finally {
      setIsLoading(false);
    }
  }, [providerId, service, startISO, endISO, customerTz]);

  // Auto-refresh functionality
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchSlots();
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchSlots]);

  // Sync when parent (Cell) passes initialSlots
  useEffect(() => {
    const next = Array.isArray(initialSlots) ? initialSlots : [];
    if (next.length) {
      setSlots(next);
      setIsLoading(false);
    }
  }, [initialSlots]);

  // Initial load (skip if Cell already provided initialSlots)
  useEffect(() => {
    const next = Array.isArray(initialSlots) ? initialSlots : [];
    if (next.length) return;
    fetchSlots();
  }, [fetchSlots, initialSlots]);

  const handleSlotClick = (slot: Slot) => {
    if (!slot.available) return;
    
    setSelectedSlotId(slot.id);
    if (onSlotSelect) {
      onSlotSelect(slot);
    }
  };

  const availableSlots = slots.filter(slot => slot.available);
  const bookedSlots = slots.filter(slot => !slot.available);

  return (
    <ErrorBoundary>
      <div className="card">
        <div className="card-header">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="card-title">Available Time Slots</h3>
              <p className="card-description">
                {service ? `${service.name} (${service.durationMinutes} min)` : 'All services'}
                {autoRefresh && (
                  <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Live
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              {lastUpdated && (
                <span className="text-xs text-gray-500">
                  Updated: {lastUpdated.toLocal().toLocaleString(DateTime.TIME_SIMPLE)}
                </span>
              )}
              <button
                onClick={fetchSlots}
                disabled={isLoading}
                className="btn btn-secondary btn-sm"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
        
        <div className="card-body">
          <LoadingState isLoading={isLoading} error={error} variant="full">
            {slots.length === 0 && !isLoading && (
              <div className="text-center py-8 text-gray-500">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="mt-2">No available time slots found</p>
                <p className="text-sm">Try selecting a different date range or service</p>
              </div>
            )}

            {slots.length > 0 && (
              <div>
                {/* Summary stats */}
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-green-600">{availableSlots.length}</div>
                      <div className="text-sm text-gray-600">Available</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-red-600">{bookedSlots.length}</div>
                      <div className="text-sm text-gray-600">Booked</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-600">{slots.length}</div>
                      <div className="text-sm text-gray-600">Total Slots</div>
                    </div>
                  </div>
                </div>

                {/* Buffer time info */}
                {service && (service.bufferBeforeMinutes > 0 || service.bufferAfterMinutes > 0) && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <div className="flex items-center">
                      <svg className="h-5 w-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="text-sm text-blue-800">
                        {service.bufferBeforeMinutes > 0 && `${service.bufferBeforeMinutes}min buffer before`}
                        {service.bufferBeforeMinutes > 0 && service.bufferAfterMinutes > 0 && ' • '}
                        {service.bufferAfterMinutes > 0 && `${service.bufferAfterMinutes}min buffer after`}
                      </div>
                    </div>
                  </div>
                )}

                {/* Slots list */}
                <div className="space-y-2">
                  {slots.map(slot => (
                    <div
                      key={slot.id}
                      className={`
                        p-4 border rounded-lg transition-all duration-200 cursor-pointer
                        ${slot.available 
                          ? selectedSlotId === slot.id
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                            : 'border-green-200 bg-green-50 hover:bg-green-100 hover:border-green-300'
                          : 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                        }
                      `}
                      onClick={() => handleSlotClick(slot)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <div>
                              <div className="font-medium text-gray-900">
                                {DateTime.fromISO(slot.startLocalISO).toLocaleString(DateTime.DATETIME_SHORT)}
                              </div>
                              <div className="text-sm text-gray-500">
                                {DateTime.fromISO(slot.endLocalISO).toLocaleString(DateTime.TIME_SIMPLE)}
                                {service && ` • ${service.durationMinutes} min`}
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-3">
                          {/* Capacity indicator */}
                          {slot.capacity && slot.capacity > 1 && (
                            <div className="text-sm text-gray-600">
                              {slot.bookingCount || 0}/{slot.capacity}
                            </div>
                          )}
                          
                          {/* Status badge */}
                          {slot.available ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Available
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              Booked
                            </span>
                          )}
                          
                          {/* Selection indicator */}
                          {slot.available && (
                            <div className={`
                              w-4 h-4 rounded-full border-2 transition-colors
                              ${selectedSlotId === slot.id
                                ? 'bg-blue-600 border-blue-600'
                                : 'border-gray-300'
                              }
                            `}>
                              {selectedSlotId === slot.id && (
                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </LoadingState>
        </div>

        {/* Auto-refresh progress indicator */}
        {autoRefresh && lastUpdated && (
          <div className="px-6 pb-4">
            <LinearProgress 
              value={((DateTime.utc().diff(lastUpdated).seconds) / (refreshInterval)) * 100} 
              max={100}
              showLabel={false}
              color="primary"
            />
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

// Helper function to generate realistic mock slots
function generateMockSlots(providerId: number, service: Service | undefined, startISO: string, endISO: string, customerTz: string): Slot[] {
  const slots: Slot[] = [];
  const start = DateTime.fromISO(startISO, { zone: 'utc' });
  const end = DateTime.fromISO(endISO, { zone: 'utc' });
  const duration = service?.durationMinutes || 60;
  
  // Generate slots from 9 AM to 5 PM
  let current = start.set({ hour: 9, minute: 0, second: 0 });
  
  while (current.plus({ minutes: duration }) <= end && current.hour < 17) {
    const slotEnd = current.plus({ minutes: duration });
    const available = Math.random() > 0.3; // 70% availability
    
    slots.push({
      id: `slot-${providerId}-${current.toISO()}`,
      startUtcISO: current.toISO()!,
      endUtcISO: slotEnd.toISO()!,
      startLocalISO: current.setZone(customerTz).toISO()!,
      endLocalISO: slotEnd.setZone(customerTz).toISO()!,
      available,
      bookingCount: available ? 0 : Math.floor(Math.random() * 3) + 1,
      capacity: service?.capacity || 1
    });
    
    current = current.plus({ minutes: duration });
  }
  
  return slots;
}

export default RealTimeSlotListing;
