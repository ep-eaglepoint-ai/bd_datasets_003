import { PrismaLike } from '../../lib/db'

export const availability = {
  searchAvailability: {
    args: {
      input: { type: 'SearchAvailabilityInput!', required: true }
    },
    resolve: async (_root: any, { input }: any, context: { db: PrismaLike }) => {
      // Use the existing searchAvailability function
      const { searchAvailability } = await import('./search')
      return searchAvailability(context.db, input)
    }
  }
}
