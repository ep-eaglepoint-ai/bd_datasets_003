import { DateTime } from 'luxon'
import { context } from '@redwoodjs/graphql-server'
import { db } from '../../lib/db'

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
    serviceId?: number
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
  const providerTz = profile?.timezone || 'UTC'

  // Fetch service to determine duration and buffer times
  let duration: number | undefined
  let bufferBefore = 0
  let bufferAfter = 0

  let svc: any = null
  if (serviceId) {
    svc = await db.service.findUnique({ where: { id: serviceId } })
    if (!svc) {
      throw new Error(`Service with ID ${serviceId} not found`)
    }
    duration = svc.durationMinutes
    bufferBefore = svc.bufferBeforeMinutes
    bufferAfter = svc.bufferAfterMinutes
  }

  if (!duration) {
    throw new Error('serviceId or implicit duration required to search availability')
  }

  // Get data from DB
  const recurring = await db.recurringAvailability.findMany({ where: { providerId } })
  const customs = await db.customDayAvailability.findMany({
    where: {
      providerId,
      date: { gte: new Date(startISO), lte: new Date(endISO) },
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

  // Fetch existing bookings to subtract them
  const existingBookings = await db.booking.findMany({
    where: {
      serviceId,
      canceledAt: null,
      startUtc: { lte: new Date(endISO) },
      endUtc: { gte: new Date(startISO) },
    },
  })

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
    dateISO: DateTime.fromJSDate(c.date).toISODate()!,
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
    customerTz
  )

  // Filter out slots that are full based on existing bookings
  const capacity = svc?.capacity ?? 1
  const finalSlots = slots.filter((slot) => {
    const slotStart = DateTime.fromISO(slot.startUtcISO)
    const slotEnd = DateTime.fromISO(slot.endUtcISO)

    // Count overlapping bookings
    const overlappingCount = existingBookings.filter((b) => {
      const bStart = DateTime.fromJSDate(b.startUtc)
      const bEnd = DateTime.fromJSDate(b.endUtc)
      return bEnd > slotStart && bStart < slotEnd
    }).length

    return overlappingCount < capacity
  })

  // Re-filter slots to ensure they are strictly inside range
  return finalSlots.filter((s) => {
    const sStart = DateTime.fromISO(s.startUtcISO)
    const sEnd = DateTime.fromISO(s.endUtcISO)
    return sStart >= rangeStart && sEnd <= rangeEnd
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

  return db.recurringAvailability.create({
    data: {
      providerId: provider.id,
      weekday: input.weekday,
      startLocal: input.startLocal,
      endLocal: input.endLocal,
      tz: provider.timezone,
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

  const tz = provider.timezone
  const start = DateTime.fromISO(`${input.date}T${input.startLocal}`, { zone: tz }).toUTC()
  const end = DateTime.fromISO(`${input.date}T${input.endLocal}`, { zone: tz }).toUTC()

  if (end <= start) throw new Error('end must be after start')

  return db.customDayAvailability.create({
    data: {
      providerId: provider.id,
      date: new Date(input.date),
      startUtc: start.toJSDate(),
      endUtc: end.toJSDate(),
      tz,
    },
  })
}

export const availabilityUpdated = {
  subscribe: (_: any, { providerId }: { providerId: number }) =>
    (context as any).pubSub?.subscribe('availabilityUpdated', providerId),
  resolve: (payload: any) => payload,
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
  const customByDate = new Map<string, Array<{ startUtcISO: string; endUtcISO: string }>>()
  for (const c of customDays) {
    if (!customByDate.has(c.dateISO)) customByDate.set(c.dateISO, [])
    customByDate.get(c.dateISO)!.push({ startUtcISO: c.startUtcISO, endUtcISO: c.endUtcISO })
  }

  const merged: Array<{ startUtc: string; endUtc: string }> = []

  // Add recurring windows if not overridden by a custom day
  for (const e of expandedWeekly) {
    if (!customByDate.has(e.localDateISO)) {
      merged.push({ startUtc: e.startUtc, endUtc: e.endUtc })
    }
  }

  // Add custom day windows
  for (const [_, arr] of customByDate.entries()) {
    for (const a of arr) {
      merged.push({ startUtc: a.startUtcISO, endUtc: a.endUtcISO })
    }
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
