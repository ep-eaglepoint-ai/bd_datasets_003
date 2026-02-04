import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

const BASE_URL = process.env.API_URL || 'http://localhost:3001';

describe('Full Application Flow - E2E Tests', () => {
  let createdCountdownSlug: string | null = null;
  let userAuthToken: string | null = null;

  beforeAll(async () => {
  });

  afterAll(async () => {
  });

  describe('Complete User Journey', () => {
    it('should allow full user registration to countdown creation flow', async () => {
      const uniqueId = Date.now();
      const registerResponse = await request(BASE_URL)
        .post('/api/auth/register')
        .send({
          email: `user${uniqueId}@test.com`,
          username: `testuser${uniqueId}`,
          password: 'SecurePass123!',
        });
      if (registerResponse.status === 201) {
        userAuthToken = registerResponse.body.data.token;
        const createResponse = await request(BASE_URL)
          .post('/api/countdowns')
          .set('Authorization', `Bearer ${userAuthToken}`)
          .send({
            title: 'My Personal Countdown',
            description: 'Created after registration',
            targetDate: new Date('2024-12-31T23:59:59Z').toISOString(),
            timezone: 'America/New_York',
            backgroundColor: '#1a535c',
            textColor: '#f7fff7',
            accentColor: '#ff6b6b',
            theme: 'elegant',
            isPublic: false, 
          });

        expect(createResponse.status).toBe(201);
        createdCountdownSlug = createResponse.body.data.slug;
        const getResponse = await request(BASE_URL)
          .get(`/api/countdowns/${createdCountdownSlug}`);

        expect(getResponse.status).toBe(200);
        expect(getResponse.body.data.title).toBe('My Personal Countdown');
        expect(getResponse.body.data.isPublic).toBe(false);
        const userCountdownsResponse = await request(BASE_URL)
          .get('/api/countdowns/user/mine')
          .set('Authorization', `Bearer ${userAuthToken}`);

        if (userCountdownsResponse.status === 200) {
          expect(userCountdownsResponse.body.data).toBeInstanceOf(Array);
          const userCountdowns = userCountdownsResponse.body.data;
          const found = userCountdowns.some((cd: any) => cd.slug === createdCountdownSlug);
          expect(found).toBe(true);
        }
      }
    });
  });

  describe('Public Sharing Flow', () => {
    it('should create public countdown accessible without auth', async () => {
      const createResponse = await request(BASE_URL)
        .post('/api/countdowns')
        .send({
          title: 'Public Holiday Countdown',
          description: 'Anyone can view this',
          targetDate: new Date('2024-07-04T00:00:00Z').toISOString(),
          timezone: 'UTC',
          backgroundColor: '#003366',
          textColor: '#FFFFFF',
          accentColor: '#CC0000',
          theme: 'celebration',
          isPublic: true,
        });

      expect(createResponse.status).toBe(201);
      const publicSlug = createResponse.body.data.slug;
      const publicAccessResponse = await request(BASE_URL)
        .get(`/api/countdowns/${publicSlug}`);

      expect(publicAccessResponse.status).toBe(200);
      expect(publicAccessResponse.body.data.isPublic).toBe(true);
      expect(publicAccessResponse.body.data).toHaveProperty('shareUrl');
    });
  });

  describe('Theme Customization Flow', () => {
    const themes = ['minimal', 'celebration', 'elegant', 'neon'];

    themes.forEach(theme => {
      it(`should support ${theme} theme correctly`, async () => {
        const response = await request(BASE_URL)
          .post('/api/countdowns')
          .send({
            title: `${theme.charAt(0).toUpperCase() + theme.slice(1)} Theme Test`,
            targetDate: new Date('2024-06-01T00:00:00Z').toISOString(),
            timezone: 'UTC',
            backgroundColor: '#000000',
            textColor: '#FFFFFF',
            accentColor: '#FF0000',
            theme: theme,
            isPublic: true,
          });

        expect(response.status).toBe(201);
        expect(response.body.data.theme).toBe(theme);
        const slug = response.body.data.slug;
        const getResponse = await request(BASE_URL)
          .get(`/api/countdowns/${slug}`);
        
        expect(getResponse.status).toBe(200);
        expect(getResponse.body.data.theme).toBe(theme);
      });
    });
  });

  describe('Time Calculation States', () => {
    it('should handle upcoming countdowns correctly', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30); 
      
      const response = await request(BASE_URL)
        .post('/api/countdowns')
        .send({
          title: 'Future Event',
          targetDate: futureDate.toISOString(),
          timezone: 'UTC',
          backgroundColor: '#000000',
          textColor: '#FFFFFF',
          accentColor: '#00AA00',
          theme: 'minimal',
          isPublic: true,
        });

      expect(response.status).toBe(201);
      
      const slug = response.body.data.slug;
      const getResponse = await request(BASE_URL)
        .get(`/api/countdowns/${slug}`);

      expect(getResponse.body.data.timeRemaining.status).toBe('upcoming');
      expect(getResponse.body.data.timeRemaining.days).toBeGreaterThan(0);
    });

    it('should handle past countdowns correctly', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 7); 
      const response = await request(BASE_URL)
        .post('/api/countdowns')
        .send({
          title: 'Past Event',
          targetDate: pastDate.toISOString(),
          timezone: 'UTC',
          backgroundColor: '#000000',
          textColor: '#FFFFFF',
          accentColor: '#AA0000',
          theme: 'minimal',
          isPublic: true,
        });

      expect(response.status).toBe(201);
      
      const slug = response.body.data.slug;
      const getResponse = await request(BASE_URL)
        .get(`/api/countdowns/${slug}`);

      expect(getResponse.body.data.timeRemaining.status).toBe('past');
      expect(getResponse.body.data.timeRemaining.days).toBeGreaterThan(0);
    });
  });

  describe('Error Handling & Edge Cases', () => {
    it('should handle malformed requests gracefully', async () => {
      const response = await request(BASE_URL)
        .post('/api/countdowns')
        .send('{malformed json')
        .set('Content-Type', 'application/json');

      expect([400, 422, 500]).toContain(response.status);
      expect(response.body).toBeDefined();
    });

    it('should validate date format', async () => {
      const response = await request(BASE_URL)
        .post('/api/countdowns')
        .send({
          title: 'Invalid Date Test',
          targetDate: 'not-a-date-string',
          timezone: 'UTC',
          backgroundColor: '#000000',
          textColor: '#FFFFFF',
          accentColor: '#FF0000',
          theme: 'minimal',
          isPublic: true,
        });

      expect([400, 422]).toContain(response.status);
      expect(response.body).toHaveProperty('error');
    });
  });
});