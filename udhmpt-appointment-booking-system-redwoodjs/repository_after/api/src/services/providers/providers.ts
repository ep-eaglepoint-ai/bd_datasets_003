import { db } from '../../lib/db'
import { context } from '@redwoodjs/graphql-server'

export const providerProfiles = () => {
  return db.providerProfile.findMany()
}

export const providerProfile = ({ id }: { id: number }) => {
  return db.providerProfile.findUnique({ where: { id } })
}

export const createProviderProfile = async ({ input }: { input: any }) => {
  if (!context.currentUser) throw new Error('Not authenticated')

  // Attach userId from context
  return db.providerProfile.create({
    data: {
      ...input,
      userId: (context.currentUser as any)?.id
    }
  })
}

