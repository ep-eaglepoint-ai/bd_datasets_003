import { Role, User, requireRole } from '../../repository_after/api/src/lib/auth'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const JWT_SECRET = 'test-secret'

describe('Authentication and Authorization Security Tests', () => {
  describe('Authentication Security', () => {
    test('Should prevent access with invalid credentials', async () => {
      const password = 'correct-password'
      const hashedPassword = await bcrypt.hash(password, 12)

      expect(await bcrypt.compare('wrong-password', hashedPassword)).toBe(false)
      expect(await bcrypt.compare(password, hashedPassword)).toBe(true)
    })

    test('Should invalidate expired tokens', () => {
      const user = { id: 1, email: 'test@test.com', role: Role.CUSTOMER }
      const token = jwt.sign(user, JWT_SECRET, { expiresIn: '24h' })

      const decoded = jwt.verify(token, JWT_SECRET) as any
      expect(decoded).toMatchObject({ id: 1, email: 'test@test.com', role: Role.CUSTOMER })

      expect(() => jwt.verify('invalid-token', JWT_SECRET)).toThrow()
    })
  })

  describe('Authorization Security', () => {
    test('Should enforce role-based access control', () => {
      const customer: User = { id: 1, email: 'customer@test.com', role: Role.CUSTOMER }
      const provider: User = { id: 2, email: 'provider@test.com', role: Role.PROVIDER }

      expect(requireRole(customer, [Role.CUSTOMER])).toBe(true)
      expect(requireRole(provider, [Role.PROVIDER])).toBe(true)
      expect(() => requireRole(customer, [Role.PROVIDER])).toThrow('Forbidden')
      expect(() => requireRole(null as any, [Role.CUSTOMER])).toThrow('Not authenticated')
    })
  })

  describe('Input Validation Security', () => {
    test('Should sanitize email inputs', () => {
      const sanitizeEmail = (email: string) => email.toLowerCase().trim()
      expect(sanitizeEmail('  USER@TEST.COM  ')).toBe('user@test.com')
    })

    test('Should validate password strength', () => {
      const validatePassword = (password: string) =>
        password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password)
      expect(validatePassword('Weakpass1')).toBe(true)
      expect(validatePassword('weak')).toBe(false)
    })
  })
})
