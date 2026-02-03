import { schema as usersSchema } from './users.sdl'
import { schema as providersSchema } from './providers.sdl'
import { schema as availabilitySchema } from './availability.sdl'
import { schema as bookingsSchema } from './bookings.sdl'

export const typeDefs = `
  scalar DateTime

  ${usersSchema}
  ${providersSchema}
  ${availabilitySchema}
  ${bookingsSchema}
`
