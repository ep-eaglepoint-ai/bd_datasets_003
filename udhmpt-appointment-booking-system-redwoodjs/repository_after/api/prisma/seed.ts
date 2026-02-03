import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Create users
  const providerUser = await prisma.user.create({
    data: {
      email: 'provider@example.com',
      role: 'PROVIDER',
      name: 'Dr. John Provider'
    }
  })

  const customerUser = await prisma.user.create({
    data: {
      email: 'customer@example.com',
      role: 'CUSTOMER',
      name: 'Jane Customer'
    }
  })

  // Create provider profile
  const providerProfile = await prisma.providerProfile.create({
    data: {
      userId: providerUser.id,
      name: 'Dr. John Provider',
      timezone: 'America/New_York'
    }
  })

  // Create services
  const consultationService = await prisma.service.create({
    data: {
      providerId: providerProfile.id,
      name: 'Consultation',
      durationMinutes: 30,
      capacity: 1,
      bufferBeforeMinutes: 15,
      bufferAfterMinutes: 15
    }
  })

  const fullSessionService = await prisma.service.create({
    data: {
      providerId: providerProfile.id,
      name: 'Full Session',
      durationMinutes: 60,
      capacity: 1,
      bufferBeforeMinutes: 15,
      bufferAfterMinutes: 15
    }
  })

  // Create recurring availability (Monday-Friday, 9am-5pm in provider TZ)
  for (let weekday = 1; weekday <= 5; weekday++) {
    await prisma.recurringAvailability.create({
      data: {
        providerId: providerProfile.id,
        weekday,
        startLocal: '09:00',
        endLocal: '17:00',
        tz: 'America/New_York'
      }
    })
  }

  console.log('Database seeded successfully!')
  console.log('Provider user:', providerUser)
  console.log('Customer user:', customerUser)
  console.log('Services created:', consultationService.name, fullSessionService.name)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
