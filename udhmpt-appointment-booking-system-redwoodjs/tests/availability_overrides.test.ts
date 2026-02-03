import { expandWeeklyRules, mergeOverrides, resolveAvailability } from '../repository_after/api/src/services/availability/availability';
import { DateTime } from 'luxon';

describe('One-off overrides and manual blocks', () => {
  test('Override adds availability (custom day present)', () => {
    const rules = [ { weekday: 3, startLocal: '09:00', endLocal: '10:00', tz: 'UTC' } ];
    const expanded = expandWeeklyRules(rules, '2021-11-01');

    const customDays = [ { dateISO: '2021-11-03', startUtcISO: DateTime.fromISO('2021-11-03T13:00', { zone: 'UTC' }).toISO()!, endUtcISO: DateTime.fromISO('2021-11-03T14:00', { zone: 'UTC' }).toISO()!, tz: 'UTC' } ];

    const merged = mergeOverrides(expanded, customDays, '2021-11-01');
    const resolved = resolveAvailability(merged, [], []);
    // Should include the custom availability
    expect(resolved.some(r => r.startUtcISO.includes('13:00'))).toBe(true);
  });

  test('Override removes availability (exception)', () => {
    const rules = [ { weekday: 4, startLocal: '09:00', endLocal: '11:00', tz: 'UTC' } ];
    const expanded = expandWeeklyRules(rules, '2021-11-01');
    const merged = mergeOverrides(expanded, [], '2021-11-01');

    // Exception removes 09:30-10:30
    const excStart = DateTime.fromISO('2021-11-04T09:30', { zone: 'UTC' }).toISO()!;
    const excEnd = DateTime.fromISO('2021-11-04T10:30', { zone: 'UTC' }).toISO()!;

    const resolved = resolveAvailability(merged, [{ startUtcISO: excStart, endUtcISO: excEnd }], []);
    // Final availability should not include 10:00
    expect(resolved.every(r => !(DateTime.fromISO(r.startUtcISO) < DateTime.fromISO('2021-11-04T10:00Z') && DateTime.fromISO(r.endUtcISO) > DateTime.fromISO('2021-11-04T10:00Z')))).toBe(true);
  });

  test('Manual block always hides availability', () => {
    const rules = [ { weekday: 5, startLocal: '08:00', endLocal: '12:00', tz: 'UTC' } ];
    const expanded = expandWeeklyRules(rules, '2021-11-01');
    const merged = mergeOverrides(expanded, [], '2021-11-01');

    // Block 09:00-11:00
    const blockStart = DateTime.fromISO('2021-11-05T09:00', { zone: 'UTC' }).toISO()!;
    const blockEnd = DateTime.fromISO('2021-11-05T11:00', { zone: 'UTC' }).toISO()!;

    const resolved = resolveAvailability(merged, [], [{ startUtcISO: blockStart, endUtcISO: blockEnd }]);
    // Ensure no resulting interval overlaps 10:00
    expect(resolved.every(r => !(DateTime.fromISO(r.startUtcISO) < DateTime.fromISO('2021-11-05T10:00Z') && DateTime.fromISO(r.endUtcISO) > DateTime.fromISO('2021-11-05T10:00Z')))).toBe(true);
  });

  test('Overlapping overrides resolve deterministically (merge)', () => {
    // Two custom-day additions that overlap should be merged into single interval
    const rules: any[] = [];
    const expanded = [] as any[];

    const customDays = [
      { dateISO: '2021-11-06', startUtcISO: DateTime.fromISO('2021-11-06T09:00', { zone: 'UTC' }).toISO()!, endUtcISO: DateTime.fromISO('2021-11-06T11:00', { zone: 'UTC' }).toISO()!, tz: 'UTC' },
      { dateISO: '2021-11-06', startUtcISO: DateTime.fromISO('2021-11-06T10:30', { zone: 'UTC' }).toISO()!, endUtcISO: DateTime.fromISO('2021-11-06T12:00', { zone: 'UTC' }).toISO()!, tz: 'UTC' },
    ];

    const merged = mergeOverrides(expanded, customDays, '2021-11-01');
    const resolved = resolveAvailability(merged, [], []);
    // Expect single merged interval 09:00-12:00
    expect(resolved.length).toBe(1);
    expect(resolved[0].startUtcISO).toContain('09:00');
    expect(resolved[0].endUtcISO).toContain('12:00');
  });
});
