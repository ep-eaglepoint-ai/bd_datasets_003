import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { DateTime } from 'luxon'

jest.setTimeout(20000)

describe('searchAvailability (Integration)', () => {
  let db: any
  let searchAvailability: any
  let tempDbPath: string
  let providerId: number
  let serviceId: number
  let customerUserId: number

  beforeAll(async () => {
    jest.resetModules()
    tempDbPath = path.resolve(
      __dirname,
      `../repository_after/api/db/dev.test-search-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.db`
    )
    fs.writeFileSync(tempDbPath, '')
    process.env.DATABASE_URL = `file:${tempDbPath}`

    execSync('npx prisma migrate deploy --schema repository_after/api/db/schema.prisma', {
      stdio: 'ignore',
      env: {
        ...process.env,
        DATABASE_URL: `file:${tempDbPath}`,
      },
    })

    db = require('../repository_after/api/src/lib/db').db
    searchAvailability =
      require('../repository_after/api/src/services/availability/availability').searchAvailability

    const providerUser = await db.user.create({
      data: { email: `provider-${Date.now()}@test.com`, role: 'PROVIDER' },
    })
    const profile = await db.providerProfile.create({
      data: {
        userId: providerUser.id,
        name: 'Availability Provider',
        timezone: 'UTC',
        bookingLeadTimeHours: 0,
      },
    })
    providerId = profile.id

    const customerUser = await db.user.create({
      data: { email: `customer-${Date.now()}@test.com`, role: 'CUSTOMER' },
    })
    customerUserId = customerUser.id

    const service = await db.service.create({
      data: {
        providerId,
        name: 'Consultation',
        durationMinutes: 60,
        capacity: 1,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
      },
    })
    serviceId = service.id
  })

  beforeEach(async () => {
    await db.booking.deleteMany()
    await db.customDayAvailability.deleteMany()
    await db.availabilityException.deleteMany()
    await db.manualBlock.deleteMany()
  })

  afterAll(async () => {
    try {
      await db?.$disconnect()
    } catch {
      // ignore
    }
    try {
      fs.unlinkSync(tempDbPath)
    } catch {
      // ignore
    }
  })

  test('returns slots', async () => {
    const day = DateTime.utc().plus({ days: 3 }).startOf('day')
    await db.customDayAvailability.create({
      data: {
        providerId,
        date: day.toJSDate(),
        startUtc: day.plus({ hours: 9 }).toJSDate(),
        endUtc: day.plus({ hours: 10 }).toJSDate(),
        tz: 'UTC',
      },
    })

    const slots = await searchAvailability({
      input: {
        providerId,
        serviceId,
        startISO: day.toISO()!,
        endISO: day.endOf('day').toISO()!,
        customerTz: 'UTC',
      },
    })

    expect(slots.length).toBeGreaterThan(0)
  })

  test('filters slots inside lead time cutoff', async () => {
    await db.providerProfile.update({
      where: { id: providerId },
      data: { bookingLeadTimeHours: 4 },
    })

    const now = DateTime.utc()
    const day = now.startOf('day')
    await db.customDayAvailability.create({
      data: {
        providerId,
        date: day.startOf('day').toJSDate(),
        startUtc: day.plus({ hours: 9 }).toJSDate(),
        endUtc: day.plus({ hours: 18 }).toJSDate(),
        tz: 'UTC',
      },
    })

    const slots = await searchAvailability({
      input: {
        providerId,
        serviceId,
        startISO: now.plus({ hours: 1 }).toISO()!,
        endISO: now.plus({ hours: 2 }).toISO()!,
        customerTz: 'UTC',
      },
    })
    expect(slots.length).toBe(0)

    await db.providerProfile.update({
      where: { id: providerId },
      data: { bookingLeadTimeHours: 0 },
    })
  })

  test('excludes slots exactly at the lead-time cutoff boundary', async () => {
    await db.providerProfile.update({
      where: { id: providerId },
      data: { bookingLeadTimeHours: 0 },
    })

    const now = DateTime.utc()
    const day = now.startOf('day')
    await db.customDayAvailability.create({
      data: {
        providerId,
        date: day.toJSDate(),
        startUtc: now.toJSDate(),
        endUtc: now.plus({ hours: 2 }).toJSDate(),
        tz: 'UTC',
      },
    })

    const slots = await searchAvailability({
      input: {
        providerId,
        serviceId,
        startISO: now.toISO()!,
        endISO: now.plus({ hours: 2 }).toISO()!,
        customerTz: 'UTC',
      },
    })

    const slotStarts = (slots as any[]).map((s: any) => s.startUtcISO)
    expect(slotStarts.some((t: any) => t.startsWith(now.toISO()!.slice(0, 16)))).toBe(false)
  })

  test('removes slots that overlap existing bookings (bookable slots only)', async () => {
    const day = DateTime.utc().plus({ days: 5 }).startOf('day')
    await db.customDayAvailability.create({
      data: {
        providerId,
        date: day.toJSDate(),
        startUtc: day.plus({ hours: 9 }).toJSDate(),
        endUtc: day.plus({ hours: 12 }).toJSDate(),
        tz: 'UTC',
      },
    })

    await db.booking.create({
      data: {
        providerId,
        serviceId,
        startUtc: day.plus({ hours: 10 }).toJSDate(),
        endUtc: day.plus({ hours: 11 }).toJSDate(),
        customerEmail: 'test@test.com',
        userId: customerUserId,
        capacitySlot: 0,
        status: 'confirmed',
        reference: `ref-${Date.now()}`,
      },
    })

    const slots = await searchAvailability({
      input: {
        providerId,
        serviceId,
        startISO: day.plus({ hours: 9 }).toISO()!,
        endISO: day.plus({ hours: 12 }).toISO()!,
        customerTz: 'UTC',
      },
    })

    const slotTimes = (slots as any[]).map((s: any) => s.startUtcISO)
    expect(slotTimes.some((t: any) => t.includes('10:00:00'))).toBe(false)
  })

  test('filters slots that only conflict once service buffers are applied', async () => {
    await db.service.update({
      where: { id: serviceId },
      data: { durationMinutes: 30, bufferBeforeMinutes: 30, bufferAfterMinutes: 0 },
    })

    const day = DateTime.utc().plus({ days: 6 }).startOf('day')
    await db.customDayAvailability.create({
      data: {
        providerId,
        date: day.toJSDate(),
        startUtc: day.plus({ hours: 10 }).toJSDate(),
        endUtc: day.plus({ hours: 12 }).toJSDate(),
        tz: 'UTC',
      },
    })

    await db.booking.create({
      data: {
        providerId,
        serviceId,
        startUtc: day.plus({ hours: 11 }).toJSDate(),
        endUtc: day.plus({ hours: 11, minutes: 30 }).toJSDate(),
        customerEmail: 'buffer@test.com',
        userId: customerUserId,
        capacitySlot: 0,
        status: 'confirmed',
        reference: `ref-buf-${Date.now()}`,
      },
    })

    const slots = await searchAvailability({
      input: {
        providerId,
        serviceId,
        startISO: day.plus({ hours: 10 }).toISO()!,
        endISO: day.plus({ hours: 12 }).toISO()!,
        customerTz: 'UTC',
      },
    })

    const slotTimes = (slots as any[]).map((s: any) => s.startUtcISO)
    expect(slotTimes.some((t: any) => t.includes('11:30:00'))).toBe(false)
  })
})
