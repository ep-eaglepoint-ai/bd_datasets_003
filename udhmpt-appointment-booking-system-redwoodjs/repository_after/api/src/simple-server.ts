import { createServer } from 'http'

// Simple working server without complex dependencies
const server = createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

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
        
        // Simple authentication for demo
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
            token: 'simple-jwt-token-for-demo'
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
          error: error.message 
        }))
      }
    })
    return
  }

  // Simple GraphQL endpoint
  if (req.method === 'POST' && req.url === '/graphql') {
    let body = ''
    req.on('data', chunk => {
      body += chunk.toString()
    })

    req.on('end', async () => {
      try {
        const { query, variables } = JSON.parse(body)
        
        // Simple GraphQL response
        let result: any = { data: null, errors: null }

        if (query.includes('searchAvailability')) {
          // Mock availability
          const slots = []
          for (let i = 9; i < 17; i++) {
            slots.push({
              startUtcISO: `2026-01-15T${i}:00:00Z`,
              endUtcISO: `2026-01-15T${i}:30:00Z`,
              startLocalISO: `2026-01-15T${i}:00:00`,
              endLocalISO: `2026-01-15T${i}:30:00`
            })
          }
          result.data = { searchAvailability: slots }
        }

        if (query.includes('createBooking')) {
          // Mock booking creation
          result.data = { 
            createBooking: {
              id: Math.floor(Math.random() * 1000),
              reference: `BK-${Date.now()}`,
              startUtc: variables?.input?.startUtcISO,
              endUtc: variables?.input?.endUtcISO,
              customerEmail: variables?.input?.customerEmail
            }
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (error: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ errors: [{ message: error.message || 'Unknown error' }] }))
      }
    })
  } else if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      message: 'Simple server running'
    }))
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
  }
})

const PORT = process.env.PORT || 8911

server.listen(PORT, () => {
  console.log(`🚀 Simple Server ready at http://localhost:${PORT}/graphql`)
  console.log(`🔐 Auth endpoint: http://localhost:${PORT}/auth/login`)
  console.log(`📊 Health check: http://localhost:${PORT}/health`)
  console.log(`✅ Server is running and testable`)
})
