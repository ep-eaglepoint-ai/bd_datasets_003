import { generateSlots } from '../repository_after/api/src/services/availability/availability';
import { DateTime } from 'luxon';

describe('Slot generation', () => {
  test('Buffer removes adjacent slots', () => {
    // Window 09:00-11:00 UTC
    const window = [{ startUtcISO: '2021-11-01T09:00:00Z', endUtcISO: '2021-11-01T11:00:00Z' }];
    // duration 30, buffers 15 before and after -> step 60 => expected 2 slots
    const slots = generateSlots(window, 30, 15, 15, 'UTC');
    expect(slots.length).toBe(2);
    // Ensure slots don't overlap
    for (let i = 1; i < slots.length; i++) {
      expect(DateTime.fromISO(slots[i].startUtcISO, { zone: 'utc' }) >= DateTime.fromISO(slots[i - 1].endUtcISO, { zone: 'utc' })).toBe(true);
    }
  });

  test('DST day generates correct slot count', () => {
    // Provider in New York with availability across DST spring-forward day
    const tz = 'America/New_York';
    const startLocal = DateTime.fromISO('2021-03-14T01:00:00', { zone: tz }).toUTC().toISO()!;
    const endLocal = DateTime.fromISO('2021-03-14T05:00:00', { zone: tz }).toUTC().toISO()!;
    const window = [{ startUtcISO: startLocal, endUtcISO: endLocal }];

    const slots = generateSlots(window, 60, 0, 0, tz);
    // Expect 3 one-hour slots across the missing hour (01:00,03:00,04:00 local)
    expect(slots.length).toBe(3);
    const localHours = slots.map(s => DateTime.fromISO(s.startUtcISO, { zone: 'utc' }).setZone(tz).hour).sort((a, b) => a - b);
    expect(localHours).toEqual([1, 3, 4]);
  });

  test('Cross-TZ provider/customer conversion', () => {
    // Provider window in UTC
    const window = [{ startUtcISO: '2021-11-01T10:00:00Z', endUtcISO: '2021-11-01T11:00:00Z' }];
    const slots = generateSlots(window, 30, 0, 0, 'Asia/Tokyo');
    expect(slots.length).toBe(2);
    // 10:00 UTC is 19:00 in Tokyo (UTC+9)
    expect(DateTime.fromISO(slots[0].startUtcISO, { zone: 'utc' }).setZone('Asia/Tokyo').hour).toBe(19);
  });

  test('No overlapping slots', () => {
    const window = [{ startUtcISO: '2021-11-01T08:00:00Z', endUtcISO: '2021-11-01T12:00:00Z' }];
    const slots = generateSlots(window, 45, 5, 5, 'UTC');
    for (let i = 1; i < slots.length; i++) {
      const prevEnd = DateTime.fromISO(slots[i - 1].endUtcISO, { zone: 'utc' });
      const curStart = DateTime.fromISO(slots[i].startUtcISO, { zone: 'utc' });
      expect(curStart >= prevEnd).toBe(true);
    }
  });
});
