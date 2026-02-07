import jwt from 'jsonwebtoken'

export const getJwtSecret = () =>
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export const decodeAuthToken = (token: string) => {
  try {
    const decoded: any = jwt.verify(token, getJwtSecret())
    if (!decoded) return null
    return {
      id: decoded.userId ?? decoded.id,
      email: decoded.email,
      role: decoded.role,
    }
  } catch {
    return null
  }
}
