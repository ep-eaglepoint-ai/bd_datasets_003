import { createGraphQLHandler } from '@redwoodjs/graphql-server'

import directives from 'src/directives/**/*.{js,ts}'
import sdls from 'src/graphql/**/*.sdl.{js,ts}'
import services from 'src/services/**/*.{js,ts}'

import { db, initDb } from 'src/lib/db'
import { logger } from 'src/lib/logger'

import { getCurrentUser } from 'src/lib/auth'

// Initialize DB settings (WAL mode, timeouts)
initDb()

export const handler = createGraphQLHandler({
    loggerConfig: { logger, options: {} },
    directives,
    sdls,
    services,
    getCurrentUser,
    realtime: {
        subscriptions: {
            subscriptions: [], // Will be populated by resolvers automatically in v6+
        },
    },
    onException: () => {
        // Disconnect from database
        db.$disconnect()
    },
})
