import jwt from 'jsonwebtoken'
import { decodeAuthToken, getJwtSecret } from '../../repository_after/api/src/lib/jwt'
import { enforceAuth } from '../../repository_after/api/src/lib/auth'

describe('Auth header + RBAC integration', () => {
  test('rejects @requireAuth without token', () => {
    const user = null
    expect(() => enforceAuth(user, ['PROVIDER'])).toThrow(/Not authenticated/)
  })

  test('rejects invalid token', () => {
    const user = decodeAuthToken('invalid.token.here')
    expect(user).toBeNull()
    expect(() => enforceAuth(user, ['PROVIDER'])).toThrow(/Not authenticated/)
  })

  test('derives role from JWT and enforces @requireAuth roles', () => {
    const customerToken = jwt.sign(
      { userId: 123, email: 'c@test.com', role: 'CUSTOMER' },
      getJwtSecret()
    )
    const user = decodeAuthToken(customerToken)
    expect(user?.role).toBe('CUSTOMER')
    expect(() => enforceAuth(user, ['PROVIDER'])).toThrow(/Forbidden/)
  })

  test('allows provider role through @requireAuth roles', () => {
    const providerToken = jwt.sign(
      { userId: 456, email: 'p@test.com', role: 'PROVIDER' },
      getJwtSecret()
    )
    const user = decodeAuthToken(providerToken)
    expect(user?.role).toBe('PROVIDER')
    expect(() => enforceAuth(user, ['PROVIDER'])).not.toThrow()
  })
})
