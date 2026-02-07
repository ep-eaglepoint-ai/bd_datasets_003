import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

describe('Provider Onboarding (Integration)', () => {
  let db: any
  let context: any
  let createProviderProfile: any
  let createService: any
  let tempDbPath: string
  let providerUserId: number
  let customerUserId: number

  beforeAll(async () => {
    jest.resetModules()
    tempDbPath = path.resolve(
      __dirname,
      `../repository_after/api/db/dev.test-onboarding-${Date.now()}-${Math.random()
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
    context = require('@redwoodjs/graphql-server').context
    createProviderProfile =
      require('../repository_after/api/src/services/providers/providers').createProviderProfile
    createService =
      require('../repository_after/api/src/services/services/services').createService

    const providerUser = await db.user.create({
      data: {
        email: `provider-${Date.now()}@test.com`,
        role: 'PROVIDER',
      },
    })
    providerUserId = providerUser.id

    const customerUser = await db.user.create({
      data: {
        email: `customer-${Date.now()}@test.com`,
        role: 'CUSTOMER',
      },
    })
    customerUserId = customerUser.id
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

  test('Correctly creates profile and validates service constraints', async () => {
    context.currentUser = { id: providerUserId, email: 'provider@test.com', role: 'PROVIDER' }

    const profile = await createProviderProfile({
      input: {
        name: 'Test Provider',
        bio: 'Bio',
        timezone: 'UTC',
        bookingLeadTimeHours: 2,
        maxBookingsPerDay: 3,
        cancellationWindowHours: 24,
        rescheduleWindowHours: 12,
        cancellationFeeCents: 500,
        rescheduleFeeCents: 200,
        penaltiesApplyForLateCancel: true,
      },
    })

    const storedProfile = await db.providerProfile.findUnique({
      where: { id: profile.id },
    })

    expect(storedProfile?.name).toBe('Test Provider')
    expect(storedProfile?.bookingLeadTimeHours).toBe(2)
    expect(storedProfile?.maxBookingsPerDay).toBe(3)
    expect(storedProfile?.cancellationWindowHours).toBe(24)
    expect(storedProfile?.rescheduleWindowHours).toBe(12)
    expect(storedProfile?.cancellationFeeCents).toBe(500)
    expect(storedProfile?.rescheduleFeeCents).toBe(200)
    expect(storedProfile?.penaltiesApplyForLateCancel).toBe(true)

    const service = await createService({
      input: {
        name: 'Service',
        durationMinutes: 30,
        capacity: 1,
        bufferBeforeMinutes: 10,
        bufferAfterMinutes: 5,
      },
    })

    const storedService = await db.service.findUnique({ where: { id: service.id } })
    expect(storedService?.providerId).toBe(profile.id)
    expect(storedService?.durationMinutes).toBe(30)
    expect(storedService?.bufferBeforeMinutes).toBe(10)
    expect(storedService?.bufferAfterMinutes).toBe(5)
  })

  test('Rejects onboarding for non-provider role', async () => {
    context.currentUser = { id: customerUserId, email: 'customer@test.com', role: 'CUSTOMER' }
    await expect(
      createProviderProfile({ input: { name: 'Nope' } })
    ).rejects.toThrow('User is not a service provider')
  })

  test('Rejects invalid provider timezone on profile create', async () => {
    context.currentUser = { id: providerUserId, email: 'provider@test.com', role: 'PROVIDER' }
    await expect(
      createProviderProfile({
        input: {
          name: 'Bad TZ',
          timezone: 'Invalid/Zone',
        },
      })
    ).rejects.toThrow(/Invalid timezone/)
  })

  test('Rejects invalid availability time strings', async () => {
    const createRecurringAvailability =
      require('../repository_after/api/src/services/availability/availability').createRecurringAvailability

    context.currentUser = { id: providerUserId, email: 'provider@test.com', role: 'PROVIDER' }
    await expect(
      createRecurringAvailability({
        input: {
          weekday: 2,
          startLocal: '25:00',
          endLocal: '26:00',
        },
      })
    ).rejects.toThrow(/Invalid time format/)
  })
})
