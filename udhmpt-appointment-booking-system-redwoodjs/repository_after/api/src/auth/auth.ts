import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
const JWT_EXPIRES_IN = '7d'

export class AuthService {
  constructor(private prisma: PrismaClient) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12)
  }

  async comparePassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword)
  }

  generateToken(userId: number, email: string, role: string): string {
    return jwt.sign(
      { userId, email, role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    )
  }

  verifyToken(token: string): any {
    try {
      return jwt.verify(token, JWT_SECRET)
    } catch (error) {
      throw new Error('Invalid token')
    }
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      throw new Error('User not found')
    }

    // For demo purposes, we'll hash the password if it's not already hashed
    let hashedPassword = user.password || ''
    if (!user.password) {
      // This is for the seeded users - in production, all users should have hashed passwords
      hashedPassword = await this.hashPassword(password)
      await this.prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword }
      })
    }

    const isPasswordValid = await this.comparePassword(password, hashedPassword)
    if (!isPasswordValid) {
      throw new Error('Invalid password')
    }

    const token = this.generateToken(user.id, user.email, user.role)

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name
      },
      token
    }
  }

  async authenticate(token: string) {
    const decoded = this.verifyToken(token)
    const user = await this.prisma.user.findUnique({
      where: { id: decoded.userId }
    })

    if (!user) {
      throw new Error('User not found')
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    }
  }
}
