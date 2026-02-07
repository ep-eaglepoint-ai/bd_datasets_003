import { APIGatewayEvent, Context } from '@redwoodjs/functions'
import { db } from 'src/lib/db'
import { AuthService } from 'src/auth/auth'
import { DateTime } from 'luxon'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const handler = async (event: APIGatewayEvent, _context: Context) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    }
  }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Method not allowed' }),
    }
  }

  const { email, password } = JSON.parse(event.body || '{}')
  const normalizedEmail = typeof email === 'string' ? email.trim() : ''
  if (!normalizedEmail || !password) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Email and password are required' }),
    }
  }

  try {
    const auth = new AuthService(db)

    // Ensure demo accounts exist when requested
    await ensureDemoAccounts(auth, normalizedEmail, password)

    const result = await auth.login(normalizedEmail, password)
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, ...result }),
    }
  } catch (error: any) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: error?.message || 'Invalid credentials' }),
    }
  }
}

const DEMO_PROVIDER_EMAIL = 'provider@example.com'
const DEMO_CUSTOMER_EMAIL = 'customer@example.com'

const ensureDemoAccounts = async (auth: AuthService, email: string, password: string) => {
  if (email !== DEMO_PROVIDER_EMAIL && email !== DEMO_CUSTOMER_EMAIL) return

  const hashedPassword = await auth.hashPassword(password)

  if (email === DEMO_PROVIDER_EMAIL) {
    const user = await upsertDemoUser({
      email: DEMO_PROVIDER_EMAIL,
      role: 'PROVIDER',
      name: 'Demo Provider',
      hashedPassword,
    })
    await ensureProviderSetup(user.id)
    return
  }

  await upsertDemoUser({
    email: DEMO_CUSTOMER_EMAIL,
    role: 'CUSTOMER',
    name: 'Demo Customer',
    hashedPassword,
  })

  const providerUser = await upsertDemoUser({
    email: DEMO_PROVIDER_EMAIL,
    role: 'PROVIDER',
    name: 'Demo Provider',
    hashedPassword,
  })
  await ensureProviderSetup(providerUser.id)
}

const upsertDemoUser = async ({
  email,
  role,
  name,
  hashedPassword,
}: {
  email: string
  role: 'PROVIDER' | 'CUSTOMER'
  name: string
  hashedPassword: string
}) => {
  return db.user.upsert({
    where: { email },
    update: {
      role,
      name,
      password: hashedPassword,
    },
    create: {
      email,
      role,
      name,
      password: hashedPassword,
    },
  })
}

const ensureProviderSetup = async (userId: number) => {
  let profile = await db.providerProfile.findUnique({ where: { userId } })
  if (!profile) {
    profile = await db.providerProfile.create({
      data: {
        userId,
        name: 'Demo Provider',
        bio: 'Demo provider account',
        timezone: 'UTC',
      },
    })
  }

  const existingService = await db.service.findFirst({
    where: { providerId: profile.id },
  })
  if (!existingService) {
    await db.service.create({
      data: {
        providerId: profile.id,
        name: 'Consultation',
        durationMinutes: 30,
        capacity: 1,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
      },
    })
  }

  const existingRecurring = await db.recurringAvailability.findFirst({
    where: { providerId: profile.id },
  })
  if (!existingRecurring) {
    const weekdays = [1, 2, 3, 4, 5] // Mon-Fri
    await db.recurringAvailability.createMany({
      data: weekdays.map((weekday) => ({
        providerId: profile!.id,
        weekday,
        startLocal: '09:00',
        endLocal: '17:00',
        tz: 'UTC',
        createdAt: DateTime.utc().toJSDate(),
        updatedAt: DateTime.utc().toJSDate(),
      })),
    })
  }
}
