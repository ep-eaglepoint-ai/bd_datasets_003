import { DateTime } from 'luxon';

// Convert a local time (ISO string) in given timezone to UTC ISO string
export function localToUTC(localISO: string, tz: string): string {
  const dt = DateTime.fromISO(localISO, { zone: tz });
  return dt.toUTC().toISO()!;
}

// Convert a UTC ISO string to local ISO in given timezone
export function utcToLocal(utcISO: string, tz: string): string {
  const dt = DateTime.fromISO(utcISO, { zone: 'utc' });
  return dt.setZone(tz).toISO()!;
}

// Add hours in a DST-safe way operating in the local timezone
export function addHoursLocalDSTSafe(localISO: string, hours: number, tz: string): string {
  const dt = DateTime.fromISO(localISO, { zone: tz });
  const added = dt.plus({ hours });
  return added.toISO()!;
}
