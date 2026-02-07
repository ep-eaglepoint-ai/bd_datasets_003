import React, { useState, useEffect } from 'react';
import { DateTime } from 'luxon';
import { useQuery, useSubscription } from '@redwoodjs/web';
import gql from 'graphql-tag';
import { LoadingState } from '../UI/LoadingState';
import { ErrorBoundary } from '../UI/ErrorBoundary';

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
  autoRefresh?: boolean;
  refreshInterval?: number;
  initialSlots?: Slot[];
};

const SEARCH_AVAILABILITY = gql`
  query SearchAvailabilityQuery($input: SearchAvailabilityInput!) {
    searchAvailability(input: $input) {
      startUtcISO
      endUtcISO
      startLocalISO
      endLocalISO
    }
  }
`;

const AVAILABILITY_SUBSCRIPTION = gql`
  subscription AvailabilitySubscription($input: SearchAvailabilityInput!) {
    availabilityUpdated(input: $input) {
      startUtcISO
      endUtcISO
      startLocalISO
      endLocalISO
    }
  }
`;

export const RealTimeSlotListing: React.FC<Props> = ({
  providerId,
  service,
  startISO,
  endISO,
  customerTz,
  onSlotSelect,
  autoRefresh = true,
  refreshInterval = 2,
  initialSlots,
}) => {
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<DateTime | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);

  const { loading, error } = useQuery(SEARCH_AVAILABILITY, {
    variables: {
      input: {
        providerId,
        serviceId: service?.id,
        startISO,
        endISO,
        customerTz,
      },
    },
    skip: !service?.id,
    onCompleted: (data) => {
      setLastUpdated(DateTime.utc());
      setSlots((data?.searchAvailability || []).map((s: any) => ({
        id: `slot-${s.startUtcISO}`,
        ...s,
        available: true,
      })));
    },
  });

  useSubscription(AVAILABILITY_SUBSCRIPTION, {
    variables: {
      input: {
        providerId,
        serviceId: service?.id,
        startISO,
        endISO,
        customerTz,
      },
    },
    onData: ({ data }) => {
      if (data?.data?.availabilityUpdated) {
        setLastUpdated(DateTime.utc());
        setSlots(data.data.availabilityUpdated.map((s: any) => ({
          id: `slot-${s.startUtcISO}`,
          ...s,
          available: true,
        })));
      }
    },
    skip: !autoRefresh || !service?.id,
  });

  const handleSlotClick = (slot: Slot) => {
    setSelectedSlotId(slot.id);
    if (onSlotSelect) {
      onSlotSelect(slot);
    }
  };

  const availableSlots = slots; // All returned slots are available
  // backend filters out busy slots, so we don't know about booked ones.

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
            </div>
          </div>
        </div>

        <div className="card-body">
          <LoadingState isLoading={loading && slots.length === 0} error={error} variant="full">
            {!service && (
              <div className="text-center py-6 text-gray-500">
                <p className="mt-2">Select a service to view available slots.</p>
              </div>
            )}

            {service && slots.length === 0 && !loading && (
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
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-green-600">{availableSlots.length}</div>
                      <div className="text-sm text-gray-600">Available Slots</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-600">{slots.length}</div>
                      <div className="text-sm text-gray-600">Total Showing</div>
                    </div>
                  </div>
                </div>

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

                <div className="space-y-2">
                  {slots.map(slot => (
                    <div
                      key={slot.id}
                      className={`
                        p-4 border rounded-lg transition-all duration-200 cursor-pointer
                        ${selectedSlotId === slot.id
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                          : 'border-green-200 bg-green-50 hover:bg-green-100 hover:border-green-300'
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
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Available
                          </span>

                          {selectedSlotId === slot.id && (
                            <div className="w-4 h-4 rounded-full bg-blue-600 border-2 border-blue-600 flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
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

        {autoRefresh && (
          <div className="px-6 pb-4">
            {/* Simple progress bar simulation could be added here if needed, but not essential for core logic */}
            <div className="text-xs text-gray-400 text-center">Auto-refreshing every {refreshInterval}s</div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default RealTimeSlotListing;
