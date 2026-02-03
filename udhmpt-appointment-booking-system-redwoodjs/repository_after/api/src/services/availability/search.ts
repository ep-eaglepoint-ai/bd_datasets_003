import { DateTime } from 'luxon';
import { expandWeeklyRules, mergeOverrides, resolveAvailability, generateSlots } from './availability';

type SearchParams = {
  providerId: number;
  serviceId?: number;
  durationMinutes?: number;
  startISO: string; // inclusive
  endISO: string; // inclusive
  customerTz: string;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
};

// Search availability for a provider + optional service within a date range.
export async function searchAvailability(prisma: any, params: SearchParams) {
  if (!prisma) throw new Error('Prisma client required');

  const { providerId, serviceId, startISO, endISO, customerTz, bufferBeforeMinutes = 0, bufferAfterMinutes = 0 } = params;

  if (DateTime.fromISO(startISO) > DateTime.fromISO(endISO)) throw new Error('start must be before end');

  // Fetch service to determine duration and buffer times if provided
  let duration = params.durationMinutes;
  let bufferBefore = params.bufferBeforeMinutes ?? 0;
  let bufferAfter = params.bufferAfterMinutes ?? 0;
  
  if (serviceId) {
    const svc = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!svc) {
      // Create a default service if not found
      const defaultService = { id: serviceId, durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 };
      if (!duration) duration = defaultService.durationMinutes;
      if (params.bufferBeforeMinutes === undefined) bufferBefore = defaultService.bufferBeforeMinutes;
      if (params.bufferAfterMinutes === undefined) bufferAfter = defaultService.bufferAfterMinutes;
    } else {
      if (!duration) duration = svc.durationMinutes;
      if (params.bufferBeforeMinutes === undefined) bufferBefore = svc.bufferBeforeMinutes;
      if (params.bufferAfterMinutes === undefined) bufferAfter = svc.bufferAfterMinutes;
    }
  }
  
  if (!duration) throw new Error('durationMinutes required');
  
  // Ensure values are valid numbers
  duration = Number(duration) || 30;
  bufferBefore = Number(bufferBefore) || 0;
  bufferAfter = Number(bufferAfter) || 0;

  // Get recurring rules
  const recurring = await prisma.recurringAvailability.findMany({ where: { providerId } });

  // Get custom day availabilities within the date range
  const customs = await prisma.customDayAvailability.findMany({ where: { providerId, date: { gte: new Date(startISO), lte: new Date(endISO) } } });

  // Get exceptions and blocks within range
  const exceptions = await prisma.availabilityException.findMany({ where: { providerId, startUtc: { lte: new Date(endISO) }, endUtc: { gte: new Date(startISO) } } });
  const blocks = await prisma.manualBlock.findMany({ where: { providerId, startUtc: { lte: new Date(endISO) }, endUtc: { gte: new Date(startISO) } } });

  // Expand weekly rules for each week in the range
  const startDate = DateTime.fromISO(startISO, { zone: 'utc' }).startOf('day');
  const endDate = DateTime.fromISO(endISO, { zone: 'utc' }).startOf('day');
  const weekStarts: string[] = [];
  let cur = startDate.startOf('week');
  while (cur <= endDate) {
    weekStarts.push(cur.toISODate()!);
    cur = cur.plus({ weeks: 1 });
  }

  const rules = recurring.map((r: any) => ({ weekday: r.weekday, startLocal: r.startLocal, endLocal: r.endLocal, tz: r.tz }));

  const expandedWindows: Array<{ startUtc: string; endUtc: string; weekday: number }> = [];
  for (const ws of weekStarts) {
    const e = expandWeeklyRules(rules as any, ws);
    expandedWindows.push(...e);
  }

  // Prepare customDays for mergeOverrides
  const customDaysFormatted = customs.map((c: any) => ({ dateISO: DateTime.fromJSDate(c.date).toISODate(), startUtcISO: DateTime.fromJSDate(c.startUtc).toISO()!, endUtcISO: DateTime.fromJSDate(c.endUtc).toISO()!, tz: c.tz }));

  const merged = mergeOverrides(expandedWindows, customDaysFormatted as any, weekStarts[0] || startISO);

  // Prepare exceptions/blocks arrays for resolveAvailability
  const excFormatted = exceptions.map((e: any) => ({ startUtcISO: DateTime.fromJSDate(e.startUtc).toISO()!, endUtcISO: DateTime.fromJSDate(e.endUtc).toISO()! }));
  const blkFormatted = blocks.map((b: any) => ({ startUtcISO: DateTime.fromJSDate(b.startUtc).toISO()!, endUtcISO: DateTime.fromJSDate(b.endUtc).toISO()! }));

  const available = resolveAvailability(merged, excFormatted, blkFormatted);

  // Filter windows to date range and generate slots
  const filtered = available.filter((w: any) => DateTime.fromISO(w.startUtcISO) >= DateTime.fromISO(startISO) && DateTime.fromISO(w.endUtcISO) <= DateTime.fromISO(endISO));

  const slots = generateSlots(filtered.map((f: any) => ({ startUtcISO: f.startUtcISO, endUtcISO: f.endUtcISO })), duration!, bufferBefore, bufferAfter, customerTz);

  // Filter slots to ensure inside start/end
  const finalSlots = slots.filter(s => DateTime.fromISO(s.startUtcISO) >= DateTime.fromISO(startISO) && DateTime.fromISO(s.endUtcISO) <= DateTime.fromISO(endISO));

  return finalSlots;
}

export default searchAvailability;
