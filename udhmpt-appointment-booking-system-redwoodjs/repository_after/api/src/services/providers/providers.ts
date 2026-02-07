import { db } from '../../lib/db'
import { context } from '@redwoodjs/graphql-server'
import { getAuthenticatedUser, isProvider } from '../../lib/auth'
import { normalizeTimezone } from '../../lib/timezone'

export const providerProfiles = () => {
  return db.providerProfile.findMany()
}

export const providerProfile = ({ id }: { id: number }) => {
  return db.providerProfile.findUnique({ where: { id } })
}

export const myProviderProfile = async () => {
  const user = getAuthenticatedUser()
  if (!isProvider(user)) throw new Error('User is not a service provider')

  return db.providerProfile.findUnique({ where: { userId: user.id } })
}

export const createProviderProfile = async ({ input }: { input: any }) => {
  if (!context.currentUser) throw new Error('Not authenticated')
  if ((context.currentUser as any)?.role !== 'PROVIDER') {
    throw new Error('User is not a service provider')
  }

  const existing = await db.providerProfile.findUnique({
    where: { userId: (context.currentUser as any)?.id },
  })
  if (existing) return existing

  if (input?.timezone) {
    normalizeTimezone(input.timezone, { label: 'provider timezone' })
  }

  // Attach userId from context
  return db.providerProfile.create({
    data: {
      ...input,
      userId: (context.currentUser as any)?.id
    }
  })
}

export const updateProviderProfile = async ({ input }: { input: any }) => {
  const userId = (context.currentUser as any)?.id
  if (!userId) throw new Error('Not authenticated')

  const existing = await db.providerProfile.findUnique({
    where: { userId },
  })
  if (!existing) throw new Error('Provider profile not found')

  if (input?.timezone) {
    normalizeTimezone(input.timezone, { label: 'provider timezone' })
  }

  return db.providerProfile.update({
    where: { id: existing.id },
    data: {
      ...input,
    },
  })
}
