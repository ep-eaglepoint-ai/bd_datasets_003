import { createProviderProfile } from '../repository_after/api/src/services/providers/providers'
import { createService } from '../repository_after/api/src/services/services/services'
import { db } from '../repository_after/api/src/lib/db'
import { context } from '@redwoodjs/graphql-server'

jest.mock('../repository_after/api/src/lib/db', () => ({
  db: {
    providerProfile: {
      create: jest.fn((args) => Promise.resolve({ id: 1, ...args.data })),
      findUnique: jest.fn(() => Promise.resolve({ id: 1, userId: 1 })),
    },
    service: {
      create: jest.fn((args) => Promise.resolve({ id: 10, ...args.data })),
    },
  },
}))

describe('Provider Onboarding', () => {
  beforeEach(() => {
    // Mock user context
    context.currentUser = { id: 1, email: 'test@test.com', role: 'PROVIDER' }
  })

  test('Correctly creates profile and validates service constraints', async () => {
    const profile = await createProviderProfile({
      input: {
        name: 'Test',
        bio: 'Bio',
      },
    })
    expect(profile.id).toBe(1)

    const service = await createService({
      input: {
        name: 'Service',
        durationMinutes: 30,
        capacity: 1,
      },
    })
    expect(service.id).toBe(10)
    expect(service.providerId).toBe(1)
  })
})
