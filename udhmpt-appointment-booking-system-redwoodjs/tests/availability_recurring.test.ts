import { DateTime } from 'luxon'
import { expandWeeklyRules, mergeOverrides } from '../repository_after/api/src/services/availability/availability'

describe('Recurring availability rules', () => {
  test('Multiple windows/day persist correctly (simulated)', () => {
    const rules = [
      { weekday: 1, startLocal: '09:00', endLocal: '11:00', tz: 'UTC' },
      { weekday: 1, startLocal: '14:00', endLocal: '16:00', tz: 'UTC' },
    ]

    const expanded = expandWeeklyRules(rules, '2021-11-01') // week start (Monday)
    const monday = expanded.filter((r) => r.weekday === 1)
    expect(monday.length).toBe(2)
    expect(monday[0].startUtc).toContain('T09:00')
    expect(monday[1].startUtc).toContain('T14:00')
  })

  test('Weekly rule expansion is deterministic', () => {
    const rules = [
      { weekday: 3, startLocal: '08:00', endLocal: '09:00', tz: 'Europe/London' },
    ]
    const a = expandWeeklyRules(rules, '2021-11-01')
    const b = expandWeeklyRules(rules, '2021-11-01')
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  test('Custom day overrides weekly', () => {
    const rules = [
      { weekday: 2, startLocal: '10:00', endLocal: '11:00', tz: 'UTC' },
    ]
    const expanded = expandWeeklyRules(rules, '2021-11-01')

    const customDays = [
      {
        dateISO: '2021-11-02',
        startUtcISO: DateTime.fromISO('2021-11-02T15:00', { zone: 'UTC' }).toISO()!,
        endUtcISO: DateTime.fromISO('2021-11-02T16:00', { zone: 'UTC' }).toISO()!,
      },
    ]

    const merged = mergeOverrides(expanded as any, customDays)
    // For 2021-11-02, recurring (10:00-11:00) should be replaced by custom (15:00-16:00)
    expect(merged.length).toBe(1)
    expect(merged[0].startUtc).toContain('T15:00')
  })

  test('DST week does not shift times (local times preserved)', () => {
    // For America/New_York DST start 2021-03-14 (clocks forward)
    const rules = [
      { weekday: 7, startLocal: '01:30', endLocal: '02:30', tz: 'America/New_York' },
    ]

    // Week before DST
    const before = expandWeeklyRules(rules, '2021-03-01')
    // Week of DST
    const dstWeek = expandWeeklyRules(rules, '2021-03-08')

    const beforeLocal = DateTime.fromISO(before[0].startUtc, { zone: 'utc' }).setZone('America/New_York')
    const dstLocal = DateTime.fromISO(dstWeek[0].startUtc, { zone: 'utc' }).setZone('America/New_York')

    expect(beforeLocal.hour).toBe(1)
    expect(beforeLocal.minute).toBe(30)
    expect(dstLocal.hour).toBe(1)
    expect(dstLocal.minute).toBe(30)
  })
})
