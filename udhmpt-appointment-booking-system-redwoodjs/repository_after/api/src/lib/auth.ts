import { context } from '@redwoodjs/graphql-server'
import { db } from './db'

export interface AuthenticatedUser {
  id: number
  email: string
  role: string
  roles?: string[]
}

export type User = AuthenticatedUser

/**
 * getCurrentUser is called by Redwood each time a GraphQL request is made.
 * It's responsible for finding the user based on the session or token.
 */
export const getCurrentUser = async (session: { id: number }) => {
  if (!session?.id) return null

  const user = await db.user.findUnique({
    where: { id: session.id },
    select: { id: true, email: true, role: true }
  })

  return user
}

export const getAuthenticatedUser = (): AuthenticatedUser => {
  if (!context.currentUser) {
    throw new Error('Not authenticated')
  }
  return context.currentUser as AuthenticatedUser
}

export const isAdmin = (user: AuthenticatedUser) => user.role === 'ADMIN'
export const isProvider = (user: AuthenticatedUser) => user.role === 'PROVIDER'

/**
 * Validates ownership or administrative access to a booking.
 */
export const validateBookingAccess = async (bookingId: number) => {
  const user = getAuthenticatedUser()
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
  })

  if (!booking) throw new Error('Booking not found')
  if (isAdmin(user)) return booking

  if (isProvider(user)) {
    const profile = await db.providerProfile.findUnique({
      where: { userId: user.id },
    })
    if (profile?.id === booking.providerId) return booking
  }

  if ((booking as any).userId === user.id) return booking

  throw new Error('You do not have permission to access this booking')
}

export const Role = {
  ADMIN: 'ADMIN',
  PROVIDER: 'PROVIDER',
  CUSTOMER: 'CUSTOMER',
} as const

export const requireRole = (user: AuthenticatedUser | null, allowedRoles: string | string[]) => {
  if (!user) throw new Error('Not authenticated')
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]
  if (!roles.includes(user.role)) throw new Error('Forbidden')
  return true
}

export const getOwnProviderProfileId = async () => {
  const user = getAuthenticatedUser()
  if (!isProvider(user)) throw new Error('User is not a service provider')

  const profile = await db.providerProfile.findUnique({
    where: { userId: user.id },
  })

  if (!profile) throw new Error('Provider profile not found')
  return profile.id
}
