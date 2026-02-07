import { APIGatewayEvent, Context } from '@redwoodjs/functions'
import { db } from 'src/lib/db'
import { AuthService } from 'src/auth/auth'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const handler = async (event: APIGatewayEvent, _context: Context) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    }
  }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Method not allowed' }),
    }
  }

  const { email, password, name } = JSON.parse(event.body || '{}')
  if (!email || !password) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Email and password are required' }),
    }
  }

  try {
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return {
        statusCode: 409,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Email already in use' }),
      }
    }

    const auth = new AuthService(db)
    const hashedPassword = await auth.hashPassword(password)
    const user = await db.user.create({
      data: {
        email,
        name,
        role: 'CUSTOMER',
        password: hashedPassword,
      },
    })

    const token = auth.generateToken(user.id, user.email, user.role)
    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        user: { id: user.id, email: user.email, role: user.role, name: user.name || undefined },
        token,
      }),
    }
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: error?.message || 'Registration failed' }),
    }
  }
}
