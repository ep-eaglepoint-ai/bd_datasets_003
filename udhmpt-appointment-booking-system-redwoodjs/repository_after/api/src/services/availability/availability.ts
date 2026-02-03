import { DateTime } from 'luxon';
import { Role, requireRole, User } from '../../lib/auth';

type RecurringInput = {
  weekday: number; // 1..7
  startLocal: string; // HH:mm
  endLocal: string; // HH:mm
};

type CustomDayInput = {
  date: string; // YYYY-MM-DD
  startLocal: string; // HH:mm in provider tz
  endLocal: string; // HH:mm
};

// Create recurring availability for a provider (no slot generation)
export async function createRecurringAvailability(user: User, input: RecurringInput, prisma: any) {
  requireRole(user, [Role.PROVIDER]);
  if (!prisma) throw new Error('Prisma client required');

  if (!Number.isInteger(input.weekday) || input.weekday < 1 || input.weekday > 7) {
    throw new Error('weekday must be integer 1..7');
  }
  if (!/^\d{2}:\d{2}$/.test(input.startLocal) || !/^\d{2}:\d{2}$/.test(input.endLocal)) {
    throw new Error('startLocal/endLocal must be HH:mm');
  }

  const profile = await prisma.providerProfile.findUnique({ where: { userId: user.id } });
  if (!profile) throw new Error('Provider profile does not exist');

  // Persist recurring rule with explicit tz reference
  return prisma.recurringAvailability.create({ data: { providerId: profile.id, weekday: input.weekday, startLocal: input.startLocal, endLocal: input.endLocal, tz: profile.timezone || 'UTC' } });
}

// Create custom day availability: compute UTC start/end and store them
export async function createCustomDayAvailability(user: User, input: CustomDayInput, prisma: any) {
  requireRole(user, [Role.PROVIDER]);
  if (!prisma) throw new Error('Prisma client required');

  const profile = await prisma.providerProfile.findUnique({ where: { userId: user.id } });
  if (!profile) throw new Error('Provider profile does not exist');

  const tz = profile.timezone || 'UTC';
  const start = DateTime.fromISO(`${input.date}T${input.startLocal}`, { zone: tz }).toUTC();
  const end = DateTime.fromISO(`${input.date}T${input.endLocal}`, { zone: tz }).toUTC();

  if (end <= start) throw new Error('end must be after start');

  return prisma.customDayAvailability.create({ data: { providerId: profile.id, date: DateTime.fromISO(input.date, { zone: tz }).toJSDate(), startUtc: start.toJSDate(), endUtc: end.toJSDate(), tz } });
}

// Expand recurring rules into UTC windows for a given ISO week start (YYYY-MM-DD Monday)
// This is deterministic pure logic (no DB writes) and does NOT generate appointment slots.
export function expandWeeklyRules(rules: Array<{ weekday: number; startLocal: string; endLocal: string; tz: string }>, weekStartISO: string) {
  // weekStartISO should be the ISO date of Monday of that week
  const weekStart = DateTime.fromISO(weekStartISO, { zone: 'utc' }).startOf('day');
  const results: Array<{ startUtc: string; endUtc: string; weekday: number }> = [];

  for (const r of rules) {
    // compute the date for the rule's weekday
    // Luxon: weekday 1 = Monday
    const dayOffset = (r.weekday - 1);
    const localDate = weekStart.plus({ days: dayOffset }).setZone(r.tz);

    const start = DateTime.fromISO(`${localDate.toISODate()}T${r.startLocal}`, { zone: r.tz }).toUTC();
    const end = DateTime.fromISO(`${localDate.toISODate()}T${r.endLocal}`, { zone: r.tz }).toUTC();

    results.push({ startUtc: start.toISO()!, endUtc: end.toISO()!, weekday: r.weekday });
  }

  // deterministic ordering
  results.sort((a, b) => a.weekday - b.weekday || a.startUtc.localeCompare(b.startUtc));
  return results;
}

// Merge recurring expansion and custom day overrides: custom days replace recurring windows for their dates
export function mergeOverrides(expandedWeekly: Array<{ startUtc: string; endUtc: string; weekday: number }>, customDays: Array<{ dateISO: string; startUtcISO: string; endUtcISO: string; tz: string }>, weekStartISO: string) {
  // Map customDays by weekday
  const weekStart = DateTime.fromISO(weekStartISO, { zone: 'utc' }).startOf('day');
  const customByWeekday = new Map<number, Array<{ startUtcISO: string; endUtcISO: string }>>();
  for (const c of customDays) {
    const d = DateTime.fromISO(c.dateISO, { zone: c.tz }).setZone('utc');
    const weekday = d.setZone(c.tz).weekday; // 1..7
    if (!customByWeekday.has(weekday)) customByWeekday.set(weekday, []);
    customByWeekday.get(weekday)!.push({ startUtcISO: c.startUtcISO, endUtcISO: c.endUtcISO });
  }

  const merged: Array<{ startUtc: string; endUtc: string; weekday: number; source: 'recurring' | 'custom' }> = [];

  for (const e of expandedWeekly) {
    if (customByWeekday.has(e.weekday)) {
      // skip recurring for this weekday
      continue;
    }
    merged.push({ startUtc: e.startUtc, endUtc: e.endUtc, weekday: e.weekday, source: 'recurring' });
  }

  for (const [weekday, arr] of customByWeekday.entries()) {
    for (const a of arr) {
      merged.push({ startUtc: a.startUtcISO, endUtc: a.endUtcISO, weekday, source: 'custom' });
    }
  }

  merged.sort((x, y) => x.weekday - y.weekday || x.startUtc.localeCompare(y.startUtc));
  return merged;
}

// Interval helpers
type Interval = { start: DateTime; end: DateTime };

function mergeIntervals(intervals: Interval[]) {
  if (intervals.length === 0) return [] as Interval[];
  const sorted = intervals.slice().sort((a, b) => a.start.toMillis() - b.start.toMillis());
  const res: Interval[] = [];
  let cur = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const it = sorted[i];
    if (it.start <= cur.end) {
      cur = { start: cur.start, end: DateTime.max(cur.end, it.end) };
    } else {
      res.push(cur);
      cur = it;
    }
  }
  res.push(cur);
  return res;
}

function subtractIntervals(base: Interval[], subs: Interval[]) {
  // For each base interval, subtract all subs intervals, producing zero or more fragments
  const result: Interval[] = [];
  for (const b of base) {
    let fragments: Interval[] = [b];
    for (const s of subs) {
      const newFragments: Interval[] = [];
      for (const f of fragments) {
        // No overlap
        if (s.end <= f.start || s.start >= f.end) {
          newFragments.push(f);
          continue;
        }
        // s covers f entirely
        if (s.start <= f.start && s.end >= f.end) {
          // drop f
          continue;
        }
        // overlap at start
        if (s.start <= f.start && s.end < f.end) {
          newFragments.push({ start: s.end, end: f.end });
          continue;
        }
        // overlap at end
        if (s.start > f.start && s.end >= f.end) {
          newFragments.push({ start: f.start, end: s.start });
          continue;
        }
        // s inside f -> split
        if (s.start > f.start && s.end < f.end) {
          newFragments.push({ start: f.start, end: s.start });
          newFragments.push({ start: s.end, end: f.end });
          continue;
        }
      }
      fragments = newFragments;
      if (fragments.length === 0) break;
    }
    for (const fr of fragments) result.push(fr);
  }
  return result;
}

// Create an availability exception (removal)
export async function createAvailabilityException(user: User, startUtcISO: string, endUtcISO: string, reason: string | null, prisma: any) {
  requireRole(user, [Role.PROVIDER]);
  if (!prisma) throw new Error('Prisma client required');
  const profile = await prisma.providerProfile.findUnique({ where: { userId: user.id } });
  if (!profile) throw new Error('Provider profile does not exist');
  const start = DateTime.fromISO(startUtcISO, { zone: 'utc' }).toJSDate();
  const end = DateTime.fromISO(endUtcISO, { zone: 'utc' }).toJSDate();
  return prisma.availabilityException.create({ data: { providerId: profile.id, startUtc: start, endUtc: end, reason } });
}

// Create a manual block
export async function createManualBlock(user: User, startUtcISO: string, endUtcISO: string, reason: string, prisma: any) {
  requireRole(user, [Role.PROVIDER]);
  if (!prisma) throw new Error('Prisma client required');
  const profile = await prisma.providerProfile.findUnique({ where: { userId: user.id } });
  if (!profile) throw new Error('Provider profile does not exist');
  const start = DateTime.fromISO(startUtcISO, { zone: 'utc' }).toJSDate();
  const end = DateTime.fromISO(endUtcISO, { zone: 'utc' }).toJSDate();
  return prisma.manualBlock.create({ data: { providerId: profile.id, startUtc: start, endUtc: end, reason } });
}

// Resolve availability given base windows (merged recurring/custom), exceptions, and blocks.
export function resolveAvailability(windows: Array<{ startUtc: string; endUtc: string; weekday: number; source?: string }>,
  exceptions: Array<{ startUtcISO: string; endUtcISO: string }>,
  blocks: Array<{ startUtcISO: string; endUtcISO: string }>) {
  // Convert windows to intervals
  const baseIntervals: Interval[] = windows.map(w => ({ start: DateTime.fromISO(w.startUtc, { zone: 'utc' }), end: DateTime.fromISO(w.endUtc, { zone: 'utc' }) }));
  // Merge overlapping base intervals deterministically
  const mergedBase = mergeIntervals(baseIntervals);

  const excIntervals = exceptions.map(e => ({ start: DateTime.fromISO(e.startUtcISO, { zone: 'utc' }), end: DateTime.fromISO(e.endUtcISO, { zone: 'utc' }) }));
  const blockIntervals = blocks.map(b => ({ start: DateTime.fromISO(b.startUtcISO, { zone: 'utc' }), end: DateTime.fromISO(b.endUtcISO, { zone: 'utc' }) }));

  // Exceptions remove availability first
  const afterExceptions = subtractIntervals(mergedBase, excIntervals);

  // Blocks remove availability next (blocks always win)
  const afterBlocks = subtractIntervals(afterExceptions, blockIntervals);

  // Merge again to ensure deterministic ordering
  const final = mergeIntervals(afterBlocks);

  // Return as ISO strings
  return final.map(f => ({ startUtcISO: f.start.toISO()!, endUtcISO: f.end.toISO()! }));
}

// Generate deterministic, non-overlapping slots from availability windows.
export function generateSlots(
  windows: Array<Record<string, string>>,
  durationMinutes: number,
  bufferBeforeMinutes: number,
  bufferAfterMinutes: number,
  customerTz: string
) {
  // Normalize windows to {startUtcISO, endUtcISO}
  const norm = windows.map(w => ({ startUtcISO: w.startUtc || w.startUtcISO, endUtcISO: w.endUtc || w.endUtcISO }));

  // Convert to intervals and merge overlapping windows
  const intervals: Interval[] = norm.map(w => ({ start: DateTime.fromISO(w.startUtcISO, { zone: 'utc' }), end: DateTime.fromISO(w.endUtcISO, { zone: 'utc' }) }));
  const merged = mergeIntervals(intervals);

  const stepMinutes = durationMinutes + bufferBeforeMinutes + bufferAfterMinutes;
  const slots: Array<{ startUtcISO: string; endUtcISO: string; startLocalISO: string; endLocalISO: string }> = [];

  for (const win of merged) {
    const earliestStart = win.start.plus({ minutes: bufferBeforeMinutes });
    const latestStart = win.end.minus({ minutes: durationMinutes + bufferAfterMinutes });
    if (latestStart < earliestStart) continue;

    let cur = earliestStart;
    while (cur <= latestStart) {
      const slotStart = cur;
      const slotEnd = slotStart.plus({ minutes: durationMinutes });
      slots.push({
        startUtcISO: slotStart.toISO()!,
        endUtcISO: slotEnd.toISO()!,
        startLocalISO: slotStart.setZone(customerTz).toISO()!,
        endLocalISO: slotEnd.setZone(customerTz).toISO()!,
      });
      cur = cur.plus({ minutes: stepMinutes });
    }
  }

  // deterministic ordering
  slots.sort((a, b) => a.startUtcISO.localeCompare(b.startUtcISO));
  return slots;
}

