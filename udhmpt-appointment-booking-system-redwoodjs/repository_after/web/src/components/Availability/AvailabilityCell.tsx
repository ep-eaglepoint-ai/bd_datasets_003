import React, { useState, useEffect, useCallback } from 'react';
import { DateTime } from 'luxon';
import { LoadingState } from '../UI/LoadingState';
import { ErrorMessage } from '../UI/ErrorMessage';
import { ErrorBoundary } from '../UI/ErrorBoundary';
import { RealTimeSlotListing } from './RealTimeSlotListing';
import { useTimezone } from '../../hooks/useTimezone';

export type Slot = {
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
  customerTz?: string;
  onSlotSelect?: (slot: { startUtc: string; endUtc: string }) => void;
  showTimezoneSelector?: boolean;
};

// ----- RedwoodJS Cell exports: declarative Loading / Empty / Failure / Success -----

export const Loading = () => (
  <div className="card">
    <div className="card-body">
      <LoadingState message="Loading availability..." variant="full" />
    </div>
  </div>
);

export const Empty = () => (
  <div className="card">
    <div className="card-body text-center py-8 text-gray-500">
      <p>No availability in this range.</p>
      <p className="text-sm mt-1">Try a different date or service.</p>
    </div>
  </div>
);

export const Failure = ({ error }: { error: Error | string }) => (
  <ErrorMessage error={error} title="Could not load availability" variant="card" />
);

type SuccessProps = Props & { slots: Slot[] };

export const Success: React.FC<SuccessProps> = ({
  slots: _initialSlots,
  providerId,
  service,
  startISO,
  endISO,
  customerTz,
  onSlotSelect,
  showTimezoneSelector = true,
}) => {
  const { timezone, changeTimezone, convertToLocal } = useTimezone({
    defaultTimezone: customerTz || 'UTC',
    autoDetect: true,
  });
  const [selectedCustomerTz, setSelectedCustomerTz] = useState(customerTz || timezone);

  useEffect(() => {
    setSelectedCustomerTz(customerTz || timezone);
  }, [customerTz, timezone]);

  const handleSlotSelect = (slot: Slot) => {
    if (onSlotSelect) {
      onSlotSelect({
        startUtc: slot.startUtcISO || (slot as any).startUtc,
        endUtc: slot.endUtcISO || (slot as any).endUtc,
      });
    }
  };

  return (
    <div className="space-y-6">
      {showTimezoneSelector && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Display Settings</h3>
            <p className="card-description">Configure how times are displayed for you</p>
          </div>
          <div className="card-body">
            <label className="form-label">Your Timezone</label>
            <select
              className="form-input"
              value={selectedCustomerTz}
              onChange={(e) => {
                setSelectedCustomerTz(e.target.value);
                changeTimezone(e.target.value);
              }}
            >
              <option value="UTC">UTC</option>
              <option value="America/New_York">Eastern Time</option>
              <option value="America/Chicago">Central Time</option>
              <option value="America/Los_Angeles">Pacific Time</option>
              <option value="Europe/London">London</option>
              <option value="Europe/Paris">Paris</option>
              <option value="Asia/Tokyo">Tokyo</option>
              <option value="Australia/Sydney">Sydney</option>
            </select>
            <div className="text-xs text-gray-500 mt-1">
              From {DateTime.fromISO(startISO).setZone(selectedCustomerTz).toLocaleString(DateTime.DATETIME_SHORT)} to{' '}
              {DateTime.fromISO(endISO).setZone(selectedCustomerTz).toLocaleString(DateTime.DATETIME_SHORT)}
            </div>
          </div>
        </div>
      )}
      <RealTimeSlotListing
        providerId={providerId}
        service={service}
        startISO={startISO}
        endISO={endISO}
        customerTz={selectedCustomerTz}
        onSlotSelect={handleSlotSelect}
        autoRefresh={true}
        refreshInterval={30}
        initialSlots={_initialSlots}
      />
    </div>
  );
};

// ----- Cell query hook: fetches slots and drives Loading/Empty/Failure/Success -----

function useAvailabilityQuery(providerId: number, service: Service | undefined, startISO: string, endISO: string, customerTz: string) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | string | null>(null);

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // In production this would call the GraphQL searchAvailability API
      await new Promise((r) => setTimeout(r, 400));
      const mockSlots: Slot[] = [];
      const start = DateTime.fromISO(startISO, { zone: 'utc' });
      const end = DateTime.fromISO(endISO, { zone: 'utc' });
      const duration = service?.durationMinutes ?? 30;
      let cur = start;
      let id = 0;
      while (cur < end) {
        const slotEnd = cur.plus({ minutes: duration });
        if (slotEnd <= end) {
          mockSlots.push({
            id: `slot-${++id}`,
            startUtcISO: cur.toISO()!,
            endUtcISO: slotEnd.toISO()!,
            startLocalISO: cur.setZone(customerTz).toISO()!,
            endLocalISO: slotEnd.setZone(customerTz).toISO()!,
            available: true,
          });
        }
        cur = cur.plus({ minutes: duration });
      }
      setSlots(mockSlots);
    } catch (e) {
      setError(e instanceof Error ? e : 'Failed to load availability');
    } finally {
      setLoading(false);
    }
  }, [providerId, service?.id, startISO, endISO, customerTz]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  return { slots, loading, error };
}

// ----- Default export: Cell that uses query and renders Loading | Empty | Failure | Success -----

export const AvailabilityCell: React.FC<Props> = ({
  providerId,
  service,
  startISO,
  endISO,
  customerTz,
  onSlotSelect,
  showTimezoneSelector = true,
}) => {
  const { timezone } = useTimezone({ defaultTimezone: customerTz || 'UTC', autoDetect: true });
  const tz = customerTz || timezone;
  const { slots, loading, error } = useAvailabilityQuery(providerId, service, startISO, endISO, tz);

  return (
    <ErrorBoundary>
      {loading && <Loading />}
      {!loading && error && <Failure error={error} />}
      {!loading && !error && slots.length === 0 && <Empty />}
      {!loading && !error && slots.length > 0 && (
        <Success
          slots={slots}
          providerId={providerId}
          service={service}
          startISO={startISO}
          endISO={endISO}
          customerTz={tz}
          onSlotSelect={onSlotSelect}
          showTimezoneSelector={showTimezoneSelector}
        />
      )}
    </ErrorBoundary>
  );
};

export default AvailabilityCell;
