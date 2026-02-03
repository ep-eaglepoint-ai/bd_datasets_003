import React, { useState } from 'react';
import { useTimezone } from '../../hooks/useTimezone';

type Props = {
  value?: string;
  onChange?: (timezone: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  showOffset?: boolean;
  className?: string;
  variant?: 'select' | 'dropdown' | 'buttons';
};

export const TimezoneSelector: React.FC<Props> = ({
  value,
  onChange,
  label = 'Timezone',
  placeholder = 'Select timezone',
  disabled = false,
  showOffset = true,
  className = '',
  variant = 'select'
}) => {
  const { timezone, changeTimezone, getCommonTimezones, timezoneInfo } = useTimezone();
  const [isOpen, setIsOpen] = useState(false);

  const selectedTimezone = value || timezone;
  const commonTimezones = getCommonTimezones();

  const handleChange = (newTimezone: string) => {
    if (onChange) {
      onChange(newTimezone);
    } else {
      changeTimezone(newTimezone);
    }
    setIsOpen(false);
  };

  const currentTimezoneInfo = selectedTimezone === timezone ? timezoneInfo : null;

  const renderSelect = () => (
    <div className={`form-group ${className}`}>
      <label className="form-label">{label}</label>
      <select
        className="form-input"
        value={selectedTimezone}
        onChange={(e) => handleChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
        {commonTimezones.map((tz: { value: string; label: string }) => (
          <option key={tz.value} value={tz.value}>
            {tz.label}
            {showOffset && (
              ` (${(() => {
                const now = new Date();
                const offset = new Intl.DateTimeFormat('en-US', {
                  timeZone: tz.value,
                  timeZoneName: 'short'
                }).formatToParts(now).find(part => part.type === 'timeZoneName')?.value || ''
              })})`
            )}
          </option>
        ))}
      </select>
      {currentTimezoneInfo && (
        <div className="text-xs text-gray-500 mt-1">
          Current time: {currentTimezoneInfo.localTime.toLocaleString()}
          {currentTimezoneInfo.isDST && ' (DST)'}
        </div>
      )}
    </div>
  );

  const renderDropdown = () => (
    <div className={`relative ${className}`}>
      <label className="form-label">{label}</label>
      <button
        type="button"
        className="form-input text-left flex items-center justify-between"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span>
          {commonTimezones.find(tz => tz.value === selectedTimezone)?.label || placeholder}
        </span>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
          {commonTimezones.map((tz: { value: string; label: string }) => (
            <button
              key={tz.value}
              type="button"
              className={`w-full text-left px-3 py-2 hover:bg-gray-100 ${
                tz.value === selectedTimezone ? 'bg-blue-50 text-blue-600' : ''
              }`}
              onClick={() => handleChange(tz.value)}
            >
              <div>{tz.label}</div>
              {showOffset && (
                <div className="text-xs text-gray-500">
                  {(() => {
                    const now = new Date();
                    const formatter = new Intl.DateTimeFormat('en-US', {
                      timeZone: tz.value,
                      timeZoneName: 'short'
                    });
                    const parts = formatter.formatToParts(now);
                    const offset = parts.find(part => part.type === 'timeZoneName')?.value || '';
                    return offset;
                  })()}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
      
      {currentTimezoneInfo && (
        <div className="text-xs text-gray-500 mt-1">
          Current time: {currentTimezoneInfo.localTime.toLocaleString()}
          {currentTimezoneInfo.isDST && ' (DST)'}
        </div>
      )}
    </div>
  );

  const renderButtons = () => (
    <div className={`space-y-2 ${className}`}>
      <label className="form-label">{label}</label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {commonTimezones.slice(0, 9).map((tz: { value: string; label: string }) => (
          <button
            key={tz.value}
            type="button"
            className={`p-2 text-xs border rounded-md transition-colors ${
              tz.value === selectedTimezone
                ? 'border-blue-500 bg-blue-50 text-blue-600'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onClick={() => handleChange(tz.value)}
            disabled={disabled}
          >
            <div className="font-medium">{tz.label.split(' ')[0]}</div>
            <div className="text-xs text-gray-500">
              {(() => {
                const now = new Date();
                const formatter = new Intl.DateTimeFormat('en-US', {
                  timeZone: tz.value,
                  timeZoneName: 'short'
                });
                const parts = formatter.formatToParts(now);
                const offset = parts.find(part => part.type === 'timeZoneName')?.value || '';
                return offset;
              })()}
            </div>
          </button>
        ))}
      </div>
      
      {currentTimezoneInfo && (
        <div className="text-xs text-gray-500 p-2 bg-gray-50 rounded">
          Current time in {currentTimezoneInfo.timezone}: {currentTimezoneInfo.localTime.toLocaleString()}
          {currentTimezoneInfo.isDST && ' (DST)'}
        </div>
      )}
    </div>
  );

  switch (variant) {
    case 'dropdown':
      return renderDropdown();
    case 'buttons':
      return renderButtons();
    default:
      return renderSelect();
  }
};

export default TimezoneSelector;
