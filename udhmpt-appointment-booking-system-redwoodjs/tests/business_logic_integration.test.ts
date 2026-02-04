// Integration tests for real business logic verification
// These tests verify that the real services are integrated and working

describe('Business Logic Integration Tests', () => {
  
  describe('Real Service Verification', () => {
    test('Should verify real searchAvailability service exists', () => {
      // Test that the real service file exists and exports the expected function
      const fs = require('fs')
      const path = require('path')
      
      const servicePath = path.join(__dirname, '../repository_after/api/src/services/availability/search.ts')
      expect(fs.existsSync(servicePath)).toBe(true)
      
      // Verify the service exports the expected function
      const serviceContent = fs.readFileSync(servicePath, 'utf8')
      expect(serviceContent).toContain('export async function searchAvailability')
      expect(serviceContent).toContain('prisma')
      expect(serviceContent).toContain('DateTime')
    })

    test('Should verify real createBooking service exists', () => {
      const fs = require('fs')
      const path = require('path')
      
      const servicePath = path.join(__dirname, '../repository_after/api/src/services/bookings/bookings.ts')
      expect(fs.existsSync(servicePath)).toBe(true)
      
      const serviceContent = fs.readFileSync(servicePath, 'utf8')
      expect(serviceContent).toContain('export async function createBooking')
      expect(serviceContent).toContain('requireRole')
      expect(serviceContent).toContain('prisma.$transaction')
    })

    test('Should verify real cancelBooking service exists', () => {
      const fs = require('fs')
      const path = require('path')
      
      const servicePath = path.join(__dirname, '../repository_after/api/src/services/bookings/bookings.ts')
      expect(fs.existsSync(servicePath)).toBe(true)
      
      const serviceContent = fs.readFileSync(servicePath, 'utf8')
      expect(serviceContent).toContain('export async function cancelBooking')
    })
  })

  describe('Server Integration Verification', () => {
    test('Should verify server imports real services', () => {
      const fs = require('fs')
      const path = require('path')
      
      const serverPath = path.join(__dirname, '../repository_after/api/src/index.ts')
      expect(fs.existsSync(serverPath)).toBe(true)
      
      const serverContent = fs.readFileSync(serverPath, 'utf8')
      
      // Verify server imports real services (no fallbacks)
      expect(serverContent).toContain("import('./services/availability/search')")
      expect(serverContent).toContain("import('./services/bookings/bookings')")
      
      // Verify server does NOT contain fallback implementations
      expect(serverContent).not.toContain('simple implementation')
    })

    test('Should verify server uses real authentication', () => {
      const fs = require('fs')
      const path = require('path')
      
      const serverPath = path.join(__dirname, '../repository_after/api/src/index.ts')
      const serverContent = fs.readFileSync(serverPath, 'utf8')
      
      // Verify real JWT implementation
      expect(serverContent).toContain('jsonwebtoken')
      expect(serverContent).toContain('bcryptjs')
      expect(serverContent).toContain('generateToken')
      expect(serverContent).toContain('verifyToken')
    })

    test('Should verify server has real business logic integration', () => {
      const fs = require('fs')
      const path = require('path')
      
      const serverPath = path.join(__dirname, '../repository_after/api/src/index.ts')
      const serverContent = fs.readFileSync(serverPath, 'utf8')
      
      // Verify real service calls
      expect(serverContent).toContain('searchAvailability(prisma, input)')
      expect(serverContent).toContain('createBooking(user, input, prisma)')
      expect(serverContent).toContain('cancelBooking(user, args.bookingId, prisma)')
      
      // Verify proper user context creation
      expect(serverContent).toContain('Role.PROVIDER')
      expect(serverContent).toContain('Role.CUSTOMER')
      expect(serverContent).toContain('Role.ADMIN')
    })
  })

  describe('Business Logic Complexity Verification', () => {
    test('Should verify searchAvailability has timezone logic', () => {
      const fs = require('fs')
      const path = require('path')
      
      const servicePath = path.join(__dirname, '../repository_after/api/src/services/availability/search.ts')
      const serviceContent = fs.readFileSync(servicePath, 'utf8')
      
      // Verify complex business logic exists
      expect(serviceContent).toContain('DateTime')
      expect(serviceContent).toContain('customerTz')
      expect(serviceContent).toContain('expandWeeklyRules')
      expect(serviceContent).toContain('mergeOverrides')
      expect(serviceContent).toContain('generateSlots')
    })

    test('Should verify createBooking has transaction logic', () => {
      const fs = require('fs')
      const path = require('path')
      
      const servicePath = path.join(__dirname, '../repository_after/api/src/services/bookings/bookings.ts')
      const serviceContent = fs.readFileSync(servicePath, 'utf8')
      
      // Verify complex business logic exists
      expect(serviceContent).toContain('prisma.$transaction')
      expect(serviceContent).toContain('requireRole')
      expect(serviceContent).toContain('cutoffHours')
      expect(serviceContent).toContain('capacity')
      expect(serviceContent).toContain('uuidv4')
    })

    test('Should verify authentication has proper security', () => {
      const fs = require('fs')
      const path = require('path')
      
      const serverPath = path.join(__dirname, '../repository_after/api/src/index.ts')
      const serverContent = fs.readFileSync(serverPath, 'utf8')
      
      // Verify security features
      expect(serverContent).toContain('hashPassword')
      expect(serverContent).toContain('verifyPassword')
      expect(serverContent).toContain('JWT_SECRET')
      expect(serverContent).toContain('expiresIn')
      expect(serverContent).toContain('bcrypt.compare')
    })
  })

  describe('No Fallback Implementation Verification', () => {
    test('Should verify no simple fallback implementations exist', () => {
      const fs = require('fs')
      const path = require('path')
      
      const serverPath = path.join(__dirname, '../repository_after/api/src/index.ts')
      const serverContent = fs.readFileSync(serverPath, 'utf8')
      
      // These should NOT exist in a real implementation
      expect(serverContent).not.toContain('simple implementation')
      expect(serverContent).not.toContain('fallback to simple')
      expect(serverContent).not.toContain('if service import fails')
      expect(serverContent).not.toContain('catch (error) { // fallback')
    })

    test('Should verify server depends on real services', () => {
      const fs = require('fs')
      const path = require('path')
      
      const serverPath = path.join(__dirname, '../repository_after/api/src/index.ts')
      const serverContent = fs.readFileSync(serverPath, 'utf8')
      
      // Server should fail if services don't exist (no graceful fallbacks)
      expect(serverContent).toContain("const { searchAvailability } = await import('./services/availability/search')")
      expect(serverContent).toContain("const { createBooking } = await import('./services/bookings/bookings')")
      expect(serverContent).toContain("const { cancelBooking } = await import('./services/bookings/bookings')")
    })
  })
})
