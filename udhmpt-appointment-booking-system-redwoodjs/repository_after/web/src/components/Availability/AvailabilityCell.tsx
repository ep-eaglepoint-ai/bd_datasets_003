import React, { useState, useEffect } from 'react';
import { DateTime } from 'luxon';
import { LoadingState } from '../UI/LoadingState';
import { ErrorMessage } from '../UI/ErrorMessage';
import { ErrorBoundary } from '../UI/ErrorBoundary';
import { RealTimeSlotListing } from './RealTimeSlotListing';
import { useTimezone } from '../../hooks/useTimezone';

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

export const AvailabilityCell: React.FC<Props> = ({ 
  providerId, 
  service, 
  startISO, 
  endISO, 
  customerTz,
  onSlotSelect,
  showTimezoneSelector = true
}) => {
  const { timezone, changeTimezone, convertToLocal } = useTimezone({
    defaultTimezone: customerTz || 'UTC',
    autoDetect: true
  });

  const [selectedCustomerTz, setSelectedCustomerTz] = useState(customerTz || timezone);

  useEffect(() => {
    setSelectedCustomerTz(customerTz || timezone);
  }, [customerTz, timezone]);

  const handleTimezoneChange = (newTz: string) => {
    setSelectedCustomerTz(newTz);
    changeTimezone(newTz);
  };

  const handleSlotSelect = (slot: any) => {
    if (onSlotSelect) {
      onSlotSelect({
        startUtc: slot.startUtcISO || slot.startUtc,
        endUtc: slot.endUtcISO || slot.endUtc
      });
    }
  };

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        {/* Timezone Selector */}
        {showTimezoneSelector && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Display Settings</h3>
              <p className="card-description">
                Configure how times are displayed for you
              </p>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Your Timezone</label>
                  <select
                    className="form-input"
                    value={selectedCustomerTz}
                    onChange={(e) => handleTimezoneChange(e.target.value)}
                  >
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">Eastern Time</option>
                    <option value="America/Chicago">Central Time</option>
                    <option value="America/Denver">Mountain Time</option>
                    <option value="America/Los_Angeles">Pacific Time</option>
                    <option value="Europe/London">London</option>
                    <option value="Europe/Paris">Paris</option>
                    <option value="Asia/Tokyo">Tokyo</option>
                    <option value="Asia/Shanghai">Shanghai</option>
                    <option value="Australia/Sydney">Sydney</option>
                  </select>
                  <div className="text-xs text-gray-500 mt-1">
                    Local time: {convertToLocal(new Date().toISOString(), selectedCustomerTz).toLocaleString(DateTime.DATETIME_SHORT)}
                  </div>
                </div>
                <div>
                  <label className="form-label">Date Range</label>
                  <div className="mt-1 text-sm text-gray-900">
                    <div>From: {convertToLocal(startISO, selectedCustomerTz).toLocaleString(DateTime.DATETIME_SHORT)}</div>
                    <div>To: {convertToLocal(endISO, selectedCustomerTz).toLocaleString(DateTime.DATETIME_SHORT)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Real-time Slot Listing */}
        <RealTimeSlotListing
          providerId={providerId}
          service={service}
          startISO={startISO}
          endISO={endISO}
          customerTz={selectedCustomerTz}
          onSlotSelect={handleSlotSelect}
          autoRefresh={true}
          refreshInterval={30}
        />
      </div>
    </ErrorBoundary>
  );
};

export default AvailabilityCell;
