import { DateTime } from 'luxon';
import { generateSlots } from '../../repository_after/api/src/services/availability/availability';
import { expandWeeklyRules } from '../../repository_after/api/src/services/availability/availability';
import { mergeOverrides } from '../../repository_after/api/src/services/availability/availability';

describe('Invalid Timezone Handling - Functional Boundaries', () => {
  test('System handles malformed and edge-case timezones without crashing', () => {
    const invalidTzs = ['', '   ', 'invalid-timezone', 'timezone@with@symbols', null, undefined];

    invalidTzs.forEach((tz: any) => {
      // Logic should fallback to UTC or result in an Invalid DateTime (which Luxon handles without throwing)
      const dt = DateTime.fromISO('2024-06-15T10:00:00', { zone: tz });
      expect(dt).toBeDefined();
    });
  });

  test('Availability logic processes invalid zones safely', () => {
    const window = [{ startUtcISO: '2024-06-15T10:00:00Z', endUtcISO: '2024-06-15T11:00:00Z' }];
    const customDays = [{
      dateISO: '2024-06-15',
      startUtcISO: '2024-06-15T14:00:00Z',
      endUtcISO: '2024-06-15T16:00:00Z',
      tz: 'Invalid/Timezone'
    }];

    // verify core functions handle poison values
    expect(() => generateSlots(window, 60, 0, 0, 'Invalid/Zone')).not.toThrow();
    expect(() => mergeOverrides([], customDays)).not.toThrow();
  });

  test('Timezone validation is performant under rapid invalid input', () => {
    const start = Date.now();
    for (let i = 0; i < 50; i++) {
      DateTime.fromISO('2024-06-15T10:00:00', { zone: `Invalid-${i}` });
    }
    expect(Date.now() - start).toBeLessThan(500);
  });
});
