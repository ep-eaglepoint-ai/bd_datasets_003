import { useState, useEffect, useCallback } from 'react';
import { DateTime } from 'luxon';

type TimezoneInfo = {
  timezone: string;
  offset: string;
  isDST: boolean;
  localTime: DateTime;
  utcTime: DateTime;
};

type UseTimezoneOptions = {
  defaultTimezone?: string;
  autoDetect?: boolean;
  storageKey?: string;
};

export const useTimezone = (options: UseTimezoneOptions = {}) => {
  const {
    defaultTimezone = 'UTC',
    autoDetect = true,
    storageKey = 'user_timezone'
  } = options;

  const [timezone, setTimezone] = useState<string>(() => {
    if (typeof window === 'undefined') return defaultTimezone;
    
    // Try to get from localStorage first
    const stored = localStorage.getItem(storageKey);
    if (stored && DateTime.local().setZone(stored).isValid) {
      return stored;
    }
    
    // Auto-detect if enabled
    if (autoDetect) {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected && DateTime.local().setZone(detected).isValid) {
        return detected;
      }
    }
    
    return defaultTimezone;
  });

  const [timezoneInfo, setTimezoneInfo] = useState<TimezoneInfo | null>(null);

  const updateTimezoneInfo = useCallback((tz: string) => {
    const now = DateTime.utc();
    const local = now.setZone(tz);
    
    if (!local.isValid) {
      console.warn(`Invalid timezone: ${tz}`);
      return null;
    }

    return {
      timezone: tz,
      offset: local.toFormat('ZZ'),
      isDST: local.isOffsetFixed ? false : local.offsetNameLong?.includes('DST') || false,
      localTime: local,
      utcTime: now
    };
  }, []);

  useEffect(() => {
    const info = updateTimezoneInfo(timezone);
    setTimezoneInfo(info);
    
    // Store in localStorage
    if (typeof window !== 'undefined' && info) {
      localStorage.setItem(storageKey, timezone);
    }
  }, [timezone, updateTimezoneInfo, storageKey]);

  const changeTimezone = useCallback((newTimezone: string) => {
    if (DateTime.local().setZone(newTimezone).isValid) {
      setTimezone(newTimezone);
    } else {
      console.warn(`Invalid timezone: ${newTimezone}`);
    }
  }, []);

  const convertToLocal = useCallback((utcDateTime: string | DateTime, targetTz?: string) => {
    const tz = targetTz || timezone;
    const dt = typeof utcDateTime === 'string' ? DateTime.fromISO(utcDateTime, { zone: 'utc' }) : utcDateTime;
    return dt.setZone(tz);
  }, [timezone]);

  const convertToUTC = useCallback((localDateTime: string | DateTime, sourceTz?: string) => {
    const tz = sourceTz || timezone;
    const dt = typeof localDateTime === 'string' ? DateTime.fromISO(localDateTime, { zone: tz }) : localDateTime;
    return dt.setZone('utc');
  }, [timezone]);

  const formatLocal = useCallback((dateTime: string | DateTime, format: string, targetTz?: string) => {
    const local = convertToLocal(dateTime, targetTz);
    return local.toFormat(format);
  }, [convertToLocal]);

  const formatUTC = useCallback((dateTime: string | DateTime, format: string) => {
    const dt = typeof dateTime === 'string' ? DateTime.fromISO(dateTime, { zone: 'utc' }) : dateTime;
    return dt.toFormat(format);
  }, []);

  const isDSTSafe = useCallback((dateTime: string | DateTime, tz?: string) => {
    const zone = tz || timezone;
    const dt = typeof dateTime === 'string' ? DateTime.fromISO(dateTime, { zone: 'utc' }) : dateTime;
    const local = dt.setZone(zone);
    
    // Check if the date is during a DST transition
    if (!local.isValid) return false;
    
    // Get the same time the next day to check for DST changes
    const nextDay = dt.plus({ days: 1 }).setZone(zone);
    const currentOffset = local.offset;
    const nextDayOffset = nextDay.offset;
    
    // If offset changes, we're in a DST transition period
    return currentOffset !== nextDayOffset;
  }, [timezone]);

  const getCommonTimezones = useCallback(() => {
    return [
      { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
      { value: 'America/New_York', label: 'Eastern Time (ET)' },
      { value: 'America/Chicago', label: 'Central Time (CT)' },
      { value: 'America/Denver', label: 'Mountain Time (MT)' },
      { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
      { value: 'America/Toronto', label: 'Toronto' },
      { value: 'America/Vancouver', label: 'Vancouver' },
      { value: 'America/Mexico_City', label: 'Mexico City' },
      { value: 'America/Sao_Paulo', label: 'São Paulo' },
      { value: 'Europe/London', label: 'London' },
      { value: 'Europe/Paris', label: 'Paris' },
      { value: 'Europe/Berlin', label: 'Berlin' },
      { value: 'Europe/Rome', label: 'Rome' },
      { value: 'Europe/Madrid', label: 'Madrid' },
      { value: 'Europe/Amsterdam', label: 'Amsterdam' },
      { value: 'Europe/Stockholm', label: 'Stockholm' },
      { value: 'Asia/Dubai', label: 'Dubai' },
      { value: 'Asia/Kolkata', label: 'India (IST)' },
      { value: 'Asia/Shanghai', label: 'Shanghai' },
      { value: 'Asia/Hong_Kong', label: 'Hong Kong' },
      { value: 'Asia/Tokyo', label: 'Tokyo' },
      { value: 'Asia/Seoul', label: 'Seoul' },
      { value: 'Asia/Singapore', label: 'Singapore' },
      { value: 'Australia/Sydney', label: 'Sydney' },
      { value: 'Australia/Melbourne', label: 'Melbourne' },
      { value: 'Pacific/Auckland', label: 'Auckland' }
    ];
  }, []);

  const detectUserTimezone = useCallback(() => {
    if (typeof window === 'undefined') return defaultTimezone;
    
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected && DateTime.local().setZone(detected).isValid) {
      changeTimezone(detected);
      return detected;
    }
    
    return defaultTimezone;
  }, [changeTimezone, defaultTimezone]);

  return {
    timezone,
    timezoneInfo,
    changeTimezone,
    convertToLocal,
    convertToUTC,
    formatLocal,
    formatUTC,
    isDSTSafe,
    getCommonTimezones,
    detectUserTimezone
  };
};

export default useTimezone;
