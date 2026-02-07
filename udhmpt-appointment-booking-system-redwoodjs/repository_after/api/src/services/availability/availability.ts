import { DateTime } from 'luxon'
import { context } from '@redwoodjs/graphql-server'
import { db } from '../../lib/db'
import { normalizeTimezone } from '../../lib/timezone'
import { getAuthenticatedUser, isAdmin, isProvider } from '../../lib/auth'

type RecurringInput = {
  weekday: number
  startLocal: string
  endLocal: string
}

type CustomDayInput = {
  date: string
  startLocal: string
  endLocal: string
}

type SearchParams = {
  input: {
    providerId: number
    serviceId: number
    startISO: string
    endISO: string
    customerTz: string
  }
}

// Service exports
export const searchAvailability = async ({ input }: SearchParams) => {
  const { providerId, serviceId, startISO, endISO, customerTz } = input

  if (DateTime.fromISO(startISO) > DateTime.fromISO(endISO)) {
    throw new Error('start must be before end')
  }

  const profile = await db.providerProfile.findUnique({ where: { id: providerId } })
  const providerTz = normalizeTimezone(profile?.timezone || 'UTC', {
    label: 'provider timezone',
  })
  const normalizedCustomerTz = normalizeTimezone(customerTz, {
    fallback: 'UTC',
    label: 'customer timezone',
  })
  const leadTimeHours = profile?.bookingLeadTimeHours ?? 0
  const maxBookingsPerDay = profile?.maxBookingsPerDay ?? null

  // Fetch service to determine duration and buffer times
  let duration: number | undefined
  let bufferBefore = 0
  let bufferAfter = 0

  const svc = await db.service.findUnique({ where: { id: serviceId } })
  if (!svc) {
    throw new Error(`Service with ID ${serviceId} not found`)
  }
  duration = svc.durationMinutes
  bufferBefore = svc.bufferBeforeMinutes
  bufferAfter = svc.bufferAfterMinutes

  // Get data from DB
  const recurring = await db.recurringAvailability.findMany({ where: { providerId } })
  const providerRangeStart = DateTime.fromISO(startISO, { zone: 'utc' })
    .setZone(providerTz)
    .startOf('day')
    .toUTC()
    .toJSDate()
  const providerRangeEnd = DateTime.fromISO(endISO, { zone: 'utc' })
    .setZone(providerTz)
    .endOf('day')
    .toUTC()
    .toJSDate()

  const customs = await db.customDayAvailability.findMany({
    where: {
      providerId,
      date: { gte: providerRangeStart, lte: providerRangeEnd },
    },
  })
  const exceptions = await db.availabilityException.findMany({
    where: {
      providerId,
      startUtc: { lte: new Date(endISO) },
      endUtc: { gte: new Date(startISO) },
    },
  })
  const blocks = await db.manualBlock.findMany({
    where: {
      providerId,
      startUtc: { lte: new Date(endISO) },
      endUtc: { gte: new Date(startISO) },
    },
  })

  // Fetch existing bookings to subtract them (provider-level overlap)
  const existingBookings = await db.booking.findMany({
    where: {
      providerId,
      canceledAt: null,
      startUtc: { lte: new Date(endISO) },
      endUtc: { gte: new Date(startISO) },
    },
  })

  // For max-per-day logic, we need all bookings in the provider-local day range,
  // even if the query window is only a partial day.
  const bookingsForDayCounts =
    maxBookingsPerDay && maxBookingsPerDay > 0
      ? await db.booking.findMany({
          where: {
            providerId,
            canceledAt: null,
            startUtc: { gte: providerRangeStart, lte: providerRangeEnd },
          },
        })
      : []

  const existingServiceIds = Array.from(
    new Set(existingBookings.map((b: any) => b.serviceId))
  )
  const existingServices = existingServiceIds.length
    ? await db.service.findMany({ where: { id: { in: existingServiceIds } } })
    : []
  const serviceById = new Map(existingServices.map((s: any) => [s.id, s]))

  // Expand weekly rules with timezone robustness
  // Convert UTC range to Provider Local range to find logical week boundaries
  const localStart = DateTime.fromISO(startISO, { zone: 'utc' }).setZone(providerTz)
  const localEnd = DateTime.fromISO(endISO, { zone: 'utc' }).setZone(providerTz)

  const weekStarts: string[] = []
  let cur = localStart.startOf('week')
  while (cur <= localEnd) {
    weekStarts.push(cur.toISODate()!)
    cur = cur.plus({ weeks: 1 })
  }

  const rules = recurring.map((r: any) => ({
    weekday: r.weekday,
    startLocal: r.startLocal,
    endLocal: r.endLocal,
    tz: providerTz,
  }))

  const expandedWindows: Array<ExtendedWindow> = []
  for (const ws of weekStarts) {
    expandedWindows.push(...expandWeeklyRules(rules, ws))
  }

  // Group customs
  const customDaysFormatted = customs.map((c: any) => ({
    dateISO: DateTime.fromJSDate(c.date, { zone: 'utc' }).setZone(providerTz).toISODate()!,
    startUtcISO: c.startUtc.toISOString(),
    endUtcISO: c.endUtc.toISOString(),
  }))

  const merged = mergeOverrides(expandedWindows, customDaysFormatted)

  const excFormatted = exceptions.map((e: any) => ({
    startUtcISO: e.startUtc.toISOString(),
    endUtcISO: e.endUtc.toISOString(),
  }))
  const blkFormatted = blocks.map((b: any) => ({
    startUtcISO: b.startUtc.toISOString(),
    endUtcISO: b.endUtc.toISOString(),
  }))

  const available = resolveAvailability(merged, excFormatted, blkFormatted)

  // Overlap fix: include windows that partially overlap the range
  const rangeStart = DateTime.fromISO(startISO)
  const rangeEnd = DateTime.fromISO(endISO)
  const filtered = available.filter((w) => {
    const wStart = DateTime.fromISO(w.startUtcISO)
    const wEnd = DateTime.fromISO(w.endUtcISO)
    return wEnd > rangeStart && wStart < rangeEnd
  })

  const slots = generateSlots(
    filtered,
    duration,
    bufferBefore,
    bufferAfter,
    normalizedCustomerTz
  )

  // Filter out slots that are full based on existing bookings
  const capacity = svc?.capacity ?? 1
  const finalSlots = slots.filter((slot) => {
    const slotStart = DateTime.fromISO(slot.startUtcISO, { zone: 'utc' })
    const slotEnd = DateTime.fromISO(slot.endUtcISO, { zone: 'utc' })

    const slotStartWithBuffer = slotStart.minus({ minutes: bufferBefore })
    const slotEndWithBuffer = slotEnd.plus({ minutes: bufferAfter })

    const overlapping = existingBookings.filter((b: any) => {
      const bookingService = serviceById.get(b.serviceId)
      const bookingBufferBefore = bookingService?.bufferBeforeMinutes ?? 0
      const bookingBufferAfter = bookingService?.bufferAfterMinutes ?? 0
      const bStart = DateTime.fromJSDate(b.startUtc).minus({ minutes: bookingBufferBefore })
      const bEnd = DateTime.fromJSDate(b.endUtc).plus({ minutes: bookingBufferAfter })
      return bEnd > slotStartWithBuffer && bStart < slotEndWithBuffer
    })

    if (overlapping.some((b: any) => b.serviceId !== serviceId)) {
      return false
    }

    const overlappingCount = overlapping.filter((b: any) => b.serviceId === serviceId).length
    if (overlappingCount >= capacity) return false

    return true
  })

  // Re-filter slots to ensure they are strictly inside range
  const now = DateTime.utc()
  const cutoff = now.plus({ hours: leadTimeHours })

  const bookingsByDay = new Map<string, number>()
  if (maxBookingsPerDay && maxBookingsPerDay > 0) {
    for (const booking of bookingsForDayCounts) {
      const dayKey = DateTime.fromJSDate(booking.startUtc)
        .setZone(providerTz)
        .toISODate()!
      bookingsByDay.set(dayKey, (bookingsByDay.get(dayKey) || 0) + 1)
    }
  }

  return finalSlots.filter((s) => {
    const sStart = DateTime.fromISO(s.startUtcISO, { zone: 'utc' })
    const sEnd = DateTime.fromISO(s.endUtcISO, { zone: 'utc' })
    if (sStart <= cutoff) return false
    if (!(sStart >= rangeStart && sEnd <= rangeEnd)) return false

    if (maxBookingsPerDay && maxBookingsPerDay > 0) {
      const dayKey = sStart.setZone(providerTz).toISODate()!
      if ((bookingsByDay.get(dayKey) || 0) >= maxBookingsPerDay) {
        return false
      }
    }

    return true
  })
}

const assertProviderOwnership = async (providerId: number) => {
  const user = getAuthenticatedUser()
  if (isAdmin(user)) return
  if (!isProvider(user)) throw new Error('Forbidden')

  const provider = await db.providerProfile.findUnique({
    where: { userId: user.id },
  })
  if (!provider || provider.id !== providerId) {
    throw new Error('Forbidden')
  }
}

export const recurringAvailabilities = async ({ providerId }: { providerId: number }) => {
  await assertProviderOwnership(providerId)
  return db.recurringAvailability.findMany({ where: { providerId } })
}

export const customDayAvailabilities = async ({ providerId }: { providerId: number }) => {
  await assertProviderOwnership(providerId)
  return db.customDayAvailability.findMany({
    where: { providerId },
    orderBy: { date: 'asc' },
  })
}

export const availabilityExceptions = async ({ providerId }: { providerId: number }) => {
  await assertProviderOwnership(providerId)
  return db.availabilityException.findMany({
    where: { providerId },
    orderBy: { startUtc: 'asc' },
  })
}

export const createManualBlock = async ({
  input,
}: {
  input: { startUtcISO: string; endUtcISO: string; reason?: string }
}) => {
  const userId = (context.currentUser as any)?.id
  if (!userId) throw new Error('Not authenticated')

  const provider = await db.providerProfile.findUnique({ where: { userId } })
  if (!provider) throw new Error('Provider profile not found')

  normalizeTimezone(provider.timezone, { label: 'provider timezone' })
  const start = DateTime.fromISO(input.startUtcISO).toUTC()
  const end = DateTime.fromISO(input.endUtcISO).toUTC()

  if (end <= start) throw new Error('End must be after start')

  return db.manualBlock.create({
    data: {
      providerId: provider.id,
      startUtc: start.toJSDate(),
      endUtc: end.toJSDate(),
      reason: input.reason,
    },
  })
}

export const deleteManualBlock = async ({ id }: { id: number }) => {
  const userId = (context.currentUser as any)?.id
  if (!userId) throw new Error('Not authenticated')

  const provider = await db.providerProfile.findUnique({ where: { userId } })
  if (!provider) throw new Error('Provider profile not found')

  const block = await db.manualBlock.findUnique({ where: { id } })
  if (!block || block.providerId !== provider.id) {
    throw new Error('Block not found or unauthorized')
  }

  return db.manualBlock.delete({ where: { id } })
}

export const createRecurringAvailability = async ({
  input,
}: {
  input: RecurringInput
}) => {
  // Authentication check should be handled by @requireAuth in SDL or custom logic
  // For simplicity, we assume context.currentUser is available if needed
  // But here we need providerId from profile
  // Use authenticated currentUser
  const userId = (context.currentUser as any)?.id
  if (!userId) throw new Error('Not authenticated')

  const provider = await db.providerProfile.findUnique({ where: { userId } })
  if (!provider) throw new Error('Provider profile not found')

  if (input.weekday < 1 || input.weekday > 7) throw new Error('Invalid weekday')
  const tz = normalizeTimezone(provider.timezone, { label: 'provider timezone' })

  const sampleDate = DateTime.utc().set({ year: 2026, month: 1, day: 1 })
  const start = DateTime.fromISO(`${sampleDate.toISODate()}T${input.startLocal}`, { zone: tz })
  const end = DateTime.fromISO(`${sampleDate.toISODate()}T${input.endLocal}`, { zone: tz })
  if (!start.isValid || !end.isValid) {
    throw new Error('Invalid time format')
  }
  if (end <= start) {
    throw new Error('end must be after start')
  }

  return db.recurringAvailability.create({
    data: {
      providerId: provider.id,
      weekday: input.weekday,
      startLocal: input.startLocal,
      endLocal: input.endLocal,
      tz,
    },
  })
}

export const createCustomDayAvailability = async ({
  input,
}: {
  input: CustomDayInput
}) => {
  const userId = (context.currentUser as any)?.id
  if (!userId) throw new Error('Not authenticated')

  const provider = await db.providerProfile.findUnique({ where: { userId } })
  if (!provider) throw new Error('Provider profile not found')

  const tz = normalizeTimezone(provider.timezone, { label: 'provider timezone' })
  const startLocal = DateTime.fromISO(`${input.date}T${input.startLocal}`, { zone: tz })
  const endLocal = DateTime.fromISO(`${input.date}T${input.endLocal}`, { zone: tz })

  if (!startLocal.isValid || !endLocal.isValid) {
    throw new Error('Invalid time format')
  }
  const start = startLocal.toUTC()
  const end = endLocal.toUTC()

  if (end <= start) throw new Error('end must be after start')

  return db.customDayAvailability.create({
    data: {
      providerId: provider.id,
      date: DateTime.fromISO(input.date, { zone: tz }).startOf('day').toUTC().toJSDate(),
      startUtc: start.toJSDate(),
      endUtc: end.toJSDate(),
      tz,
    },
  })
}

export const createAvailabilityException = async ({
  input,
}: {
  input: { startUtcISO: string; endUtcISO: string; reason?: string }
}) => {
  const userId = (context.currentUser as any)?.id
  if (!userId) throw new Error('Not authenticated')

  const provider = await db.providerProfile.findUnique({ where: { userId } })
  if (!provider) throw new Error('Provider profile not found')

  normalizeTimezone(provider.timezone, { label: 'provider timezone' })
  const start = DateTime.fromISO(input.startUtcISO).toUTC()
  const end = DateTime.fromISO(input.endUtcISO).toUTC()

  if (end <= start) throw new Error('End must be after start')

  return db.availabilityException.create({
    data: {
      providerId: provider.id,
      startUtc: start.toJSDate(),
      endUtc: end.toJSDate(),
      reason: input.reason,
    },
  })
}

export const deleteAvailabilityException = async ({ id }: { id: number }) => {
  const userId = (context.currentUser as any)?.id
  if (!userId) throw new Error('Not authenticated')

  const provider = await db.providerProfile.findUnique({ where: { userId } })
  if (!provider) throw new Error('Provider profile not found')

  const exception = await db.availabilityException.findUnique({ where: { id } })
  if (!exception || exception.providerId !== provider.id) {
    throw new Error('Exception not found or unauthorized')
  }

  return db.availabilityException.delete({ where: { id } })
}

export const availabilityUpdated = {
  subscribe: (_: any, { input }: { input: SearchParams['input'] }) =>
    (context as any).pubSub?.subscribe('availabilityUpdated', input.providerId),
  resolve: async (_payload: any, { input }: { input: SearchParams['input'] }) => {
    return searchAvailability({ input })
  },
}

// Logic helpers (Deterministic internal functions)

type ExtendedWindow = {
  startUtc: string
  endUtc: string
  weekday: number
  localDateISO: string
}

export function expandWeeklyRules(
  rules: Array<{ weekday: number; startLocal: string; endLocal: string; tz: string }>,
  weekStartISO: string
) {
  const tz = rules.length > 0 ? rules[0].tz : 'UTC'
  const weekStart = DateTime.fromISO(weekStartISO, { zone: tz }).startOf('day')
  const results: Array<ExtendedWindow> = []

  for (const r of rules) {
    const dayOffset = r.weekday - 1
    const localDate = weekStart.plus({ days: dayOffset })
    const localDateISO = localDate.toISODate()!

    const start = DateTime.fromISO(`${localDateISO}T${r.startLocal}`, {
      zone: r.tz,
    })
    const end = DateTime.fromISO(`${localDateISO}T${r.endLocal}`, { zone: r.tz })

    // DST Policy: If the time is invalid (Spring Forward nonexistent gap), skip it.
    // If ambiguous (Fall Back overlap), Luxon defaults to the first occurrence (DST).
    if (!start.isValid || !end.isValid) {
      console.warn(
        `Skipping invalid DST window for provider in ${r.tz}: ${localDateISO}`
      )
      continue
    }

    results.push({
      startUtc: start.toUTC().toISO()!,
      endUtc: end.toUTC().toISO()!,
      weekday: r.weekday,
      localDateISO,
    })
  }
  return results
}

export function mergeOverrides(
  expandedWeekly: ExtendedWindow[],
  customDays: Array<{ dateISO: string; startUtcISO: string; endUtcISO: string }>
) {
  const merged: Array<{ startUtc: string; endUtc: string }> = []

  // Always include recurring windows (base availability)
  for (const e of expandedWeekly) {
    merged.push({ startUtc: e.startUtc, endUtc: e.endUtc })
  }

  // Add custom day windows as additive overrides
  for (const c of customDays) {
    merged.push({ startUtc: c.startUtcISO, endUtc: c.endUtcISO })
  }

  return merged.sort((a, b) => a.startUtc.localeCompare(b.startUtc))
}

type Interval = { start: DateTime; end: DateTime }

export function resolveAvailability(
  windows: Array<{ startUtc: string; endUtc: string }>,
  exceptions: Array<{ startUtcISO: string; endUtcISO: string }>,
  blocks: Array<{ startUtcISO: string; endUtcISO: string }>
) {
  const baseIntervals: Interval[] = windows.map((w) => ({
    start: DateTime.fromISO(w.startUtc, { zone: 'utc' }),
    end: DateTime.fromISO(w.endUtc, { zone: 'utc' }),
  }))
  const mergedBase = mergeIntervals(baseIntervals)

  const excIntervals = exceptions.map((e) => ({
    start: DateTime.fromISO(e.startUtcISO, { zone: 'utc' }),
    end: DateTime.fromISO(e.endUtcISO, { zone: 'utc' }),
  }))
  const blockIntervals = blocks.map((b) => ({
    start: DateTime.fromISO(b.startUtcISO, { zone: 'utc' }),
    end: DateTime.fromISO(b.endUtcISO, { zone: 'utc' }),
  }))

  const afterExceptions = subtractIntervals(mergedBase, excIntervals)
  const afterBlocks = subtractIntervals(afterExceptions, blockIntervals)

  return mergeIntervals(afterBlocks).map((f) => ({
    startUtcISO: f.start.toISO()!,
    endUtcISO: f.end.toISO()!,
  }))
}

function mergeIntervals(intervals: Interval[]) {
  if (intervals.length === 0) return []
  const sorted = intervals.slice().sort((a, b) => a.start.toMillis() - b.start.toMillis())
  const res: Interval[] = []
  let cur = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    const it = sorted[i]
    if (it.start <= cur.end) {
      cur = { start: cur.start, end: DateTime.max(cur.end, it.end) }
    } else {
      res.push(cur)
      cur = it
    }
  }
  res.push(cur)
  return res
}

function subtractIntervals(base: Interval[], subs: Interval[]) {
  const result: Interval[] = []
  for (const b of base) {
    let fragments: Interval[] = [b]
    for (const s of subs) {
      const newFragments: Interval[] = []
      for (const f of fragments) {
        if (s.end <= f.start || s.start >= f.end) {
          newFragments.push(f)
          continue
        }
        if (s.start <= f.start && s.end >= f.end) continue
        if (s.start <= f.start && s.end < f.end) {
          newFragments.push({ start: s.end, end: f.end })
          continue
        }
        if (s.start > f.start && s.end >= f.end) {
          newFragments.push({ start: f.start, end: s.start })
          continue
        }
        if (s.start > f.start && s.end < f.end) {
          newFragments.push({ start: f.start, end: s.start })
          newFragments.push({ start: s.end, end: f.end })
          continue
        }
      }
      fragments = newFragments
      if (fragments.length === 0) break
    }
    result.push(...fragments)
  }
  return result
}

export function generateSlots(
  windows: Array<{ startUtcISO: string; endUtcISO: string }>,
  durationMinutes: number,
  bufferBeforeMinutes: number,
  bufferAfterMinutes: number,
  customerTz: string
) {
  const slots: Array<{
    startUtcISO: string
    endUtcISO: string
    startLocalISO: string
    endLocalISO: string
  }> = []
  const stepMinutes = durationMinutes + bufferBeforeMinutes + bufferAfterMinutes

  for (const win of windows) {
    const start = DateTime.fromISO(win.startUtcISO, { zone: 'utc' })
    const end = DateTime.fromISO(win.endUtcISO, { zone: 'utc' })

    const earliestStart = start.plus({ minutes: bufferBeforeMinutes })
    const latestStart = end.minus({ minutes: durationMinutes + bufferAfterMinutes })

    let cur = earliestStart
    while (cur <= latestStart) {
      const slotStart = cur
      const slotEnd = slotStart.plus({ minutes: durationMinutes })
      slots.push({
        startUtcISO: slotStart.toISO()!,
        endUtcISO: slotEnd.toISO()!,
        startLocalISO: slotStart.setZone(customerTz).toISO()!,
        endLocalISO: slotEnd.setZone(customerTz).toISO()!,
      })
      cur = cur.plus({ minutes: stepMinutes })
    }
  }
  return slots.sort((a, b) => a.startUtcISO.localeCompare(b.startUtcISO))
}
