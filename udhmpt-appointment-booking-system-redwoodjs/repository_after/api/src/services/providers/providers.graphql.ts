import { PrismaLike } from '../../lib/db'
import { Role } from '../../lib/auth'

export const providers = {
  createProviderProfile: {
    args: {
      input: { type: 'CreateProviderProfileInput!', required: true }
    },
    resolve: async (_root: any, { input }: any, context: { db: PrismaLike }) => {
      const { createProviderProfile } = await import('./providers')
      return createProviderProfile({ id: 1, email: 'test@example.com', role: Role.PROVIDER }, input, context.db)
    }
  },

  createService: {
    args: {
      input: { type: 'CreateServiceInput!', required: true }
    },
    resolve: async (_root: any, { input }: any, context: { db: PrismaLike }) => {
      const { createService } = await import('./providers')
      return createService({ id: 1, email: 'test@example.com', role: Role.PROVIDER }, input, context.db)
    }
  }
}
