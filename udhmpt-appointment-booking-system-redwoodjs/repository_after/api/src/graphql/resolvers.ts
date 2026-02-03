import { bookings } from '../services/bookings/bookings.graphql'
import { providers } from '../services/providers/providers.graphql'
import { availability } from '../services/availability/availability.graphql'

export const resolvers = {
  Query: {
    ...availability
  },
  Mutation: {
    ...bookings,
    ...providers
  }
}
