import { createServer } from 'http'
import { createGraphQLServer } from './server'
import { dbPlaceholder } from './lib/db'

// Create GraphQL server
const { typeDefs, resolvers } = createGraphQLServer(dbPlaceholder)

// Simple HTTP server for GraphQL and Auth
const server = createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  // Auth endpoint
  if (req.method === 'POST' && req.url === '/auth/login') {
    let body = ''
    req.on('data', chunk => {
      body += chunk.toString()
    })

    req.on('end', async () => {
      try {
        const { email, password } = JSON.parse(body)
        
        // Simple authentication logic
        let user = null
        
        if (email === 'provider@example.com' && password === 'password') {
          user = {
            id: 1,
            email: 'provider@example.com',
            role: 'PROVIDER',
            name: 'Dr. John Provider'
          }
        } else if (email === 'customer@example.com' && password === 'password') {
          user = {
            id: 2,
            email: 'customer@example.com',
            role: 'CUSTOMER',
            name: 'Jane Customer'
          }
        }

        if (user) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ 
            success: true,
            user,
            token: 'mock-jwt-token'
          }))
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ 
            success: false,
            error: 'Invalid credentials' 
          }))
        }
      } catch (error: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ 
          success: false,
          error: error.message || 'Invalid request' 
        }))
      }
    })
    return
  }

  // GraphQL endpoint
  if (req.method === 'POST' && req.url === '/graphql') {
    let body = ''
    req.on('data', chunk => {
      body += chunk.toString()
    })

    req.on('end', async () => {
      try {
        const { query, variables } = JSON.parse(body)
        
        // Simple GraphQL execution (in production, use a proper GraphQL library)
        let result: any = { data: null, errors: null }

        if (query.includes('searchAvailability')) {
          const searchAvailability = async (input: any) => {
            // Mock availability for now - replace with real implementation
            const slots = []
            const startHour = 9
            for (let i = 0; i < 8; i++) {
              slots.push({
                startUtcISO: `2026-01-15T${startHour + i}:00:00Z`,
                endUtcISO: `2026-01-15T${startHour + i}:30:00Z`,
                startLocalISO: `2026-01-15T${startHour + i}:00:00`
              })
            }
            return slots
          }

          const input = variables?.input
          result.data = { searchAvailability: await searchAvailability(input) }
        }

        if (query.includes('createBooking')) {
          const createBooking = async (input: any) => {
            // Mock booking creation
            return {
              id: Math.floor(Math.random() * 1000),
              reference: `BK-${Date.now()}`,
              startUtc: input.startUtcISO,
              endUtc: input.endUtcISO,
              customerEmail: input.customerEmail
            }
          }

          const input = variables?.input
          result.data = { createBooking: await createBooking(input) }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (error: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ errors: [{ message: error.message || 'Unknown error' }] }))
      }
    })
  } else if (req.url === '/health') {
    // Health check endpoint
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }))
  } else {
    res.writeHead(404)
    res.end()
  }
})

const PORT = process.env.PORT || 8911

server.listen(PORT, () => {
  console.log(`🚀 GraphQL Server ready at http://localhost:${PORT}/graphql`)
  console.log(`� Auth endpoint: http://localhost:${PORT}/auth/login`)
  console.log(`📊 Health check: http://localhost:${PORT}/health`)
})
