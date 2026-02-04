import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { prisma } from '../../repository_after/backend/src/lib/db';

const BASE_URL = process.env.API_URL || 'http://localhost:3001';

describe('Countdown API Tests - Requirement Verification', () => {
  beforeAll(async () => {
    await prisma.countdown.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.countdown.deleteMany();
  });

  // Requirement 1: Build a form to create countdowns
  describe('Requirement 1: Countdown Creation Form', () => {
    it('should create countdown with all required fields', async () => {
      const response = await request(BASE_URL)
        .post('/api/countdowns')
        .send({
          title: 'My Birthday',
          targetDate: new Date('2024-12-25T00:00:00Z').toISOString(),
          timezone: 'UTC',
          backgroundColor: '#000000',
          textColor: '#FFFFFF',
          accentColor: '#3B82F6',
          theme: 'minimal',
          isPublic: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.title).toBe('My Birthday');
      expect(response.body.data).toHaveProperty('slug');
    });

    it('should accept optional description and background image', async () => {
      const response = await request(BASE_URL)
        .post('/api/countdowns')
        .send({
          title: 'Vacation Countdown',
          description: 'Counting down to beach vacation',
          targetDate: new Date('2024-06-15T00:00:00Z').toISOString(),
          timezone: 'America/New_York',
          backgroundColor: '#1a535c',
          textColor: '#f7fff7',
          accentColor: '#4ecdc4',
          theme: 'celebration',
          backgroundImage: 'https://example.com/image.jpg',
          isPublic: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.description).toBe('Counting down to beach vacation');
      expect(response.body.data.backgroundImage).toBe('https://example.com/image.jpg');
    });

    it('should validate required fields', async () => {
      const response = await request(BASE_URL)
        .post('/api/countdowns')
        .send({
          description: 'Test without required fields',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  // Requirement 2: Beautiful full-screen countdown
  describe('Requirement 2: Countdown Display', () => {
    it('should return countdown with time remaining calculations', async () => {
      const createResponse = await request(BASE_URL)
        .post('/api/countdowns')
        .send({
          title: 'Test Display',
          targetDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
          timezone: 'UTC',
          backgroundColor: '#000000',
          textColor: '#FFFFFF',
          accentColor: '#FF0000',
          theme: 'minimal',
          isPublic: true,
        });

      const slug = createResponse.body.data.slug;
      const getResponse = await request(BASE_URL)
        .get(`/api/countdowns/${slug}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.data).toHaveProperty('timeRemaining');
      expect(getResponse.body.data.timeRemaining).toHaveProperty('days');
      expect(getResponse.body.data.timeRemaining).toHaveProperty('hours');
      expect(getResponse.body.data.timeRemaining).toHaveProperty('minutes');
      expect(getResponse.body.data.timeRemaining).toHaveProperty('seconds');
      expect(getResponse.body.data.timeRemaining).toHaveProperty('status');
    });
  });

  // Requirement 3: Unique shareable URLs
  describe('Requirement 3: Shareable URLs', () => {
    it('should generate unique slug for each countdown', async () => {
      const response1 = await request(BASE_URL)
        .post('/api/countdowns')
        .send({
          title: 'Countdown 1',
          targetDate: new Date('2024-12-31T23:59:59Z').toISOString(),
          timezone: 'UTC',
          backgroundColor: '#000000',
          textColor: '#FFFFFF',
          accentColor: '#3B82F6',
          theme: 'minimal',
          isPublic: true,
        });

      const response2 = await request(BASE_URL)
        .post('/api/countdowns')
        .send({
          title: 'Countdown 2',
          targetDate: new Date('2024-12-31T23:59:59Z').toISOString(),
          timezone: 'UTC',
          backgroundColor: '#000000',
          textColor: '#FFFFFF',
          accentColor: '#3B82F6',
          theme: 'minimal',
          isPublic: true,
        });

      expect(response1.body.data.slug).not.toBe(response2.body.data.slug);
      expect(response1.body.data).toHaveProperty('shareUrl');
      expect(response2.body.data).toHaveProperty('shareUrl');
    });

    it('should allow public access without authentication', async () => {
      const createResponse = await request(BASE_URL)
        .post('/api/countdowns')
        .send({
          title: 'Public Countdown',
          targetDate: new Date('2024-12-31T23:59:59Z').toISOString(),
          timezone: 'UTC',
          backgroundColor: '#000000',
          textColor: '#FFFFFF',
          accentColor: '#3B82F6',
          theme: 'minimal',
          isPublic: true,
        });

      const slug = createResponse.body.data.slug;
      const getResponse = await request(BASE_URL)
        .get(`/api/countdowns/${slug}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.data.title).toBe('Public Countdown');
    });
  });

  // Requirement 5: Three states handling
  describe('Requirement 5: Three States Handling', () => {
    it('should show upcoming status for future dates', async () => {
      const futureDate = new Date(Date.now() + 86400000); // Tomorrow
      const createResponse = await request(BASE_URL)
        .post('/api/countdowns')
        .send({
          title: 'Upcoming Event',
          targetDate: futureDate.toISOString(),
          timezone: 'UTC',
          backgroundColor: '#000000',
          textColor: '#FFFFFF',
          accentColor: '#00FF00',
          theme: 'minimal',
          isPublic: true,
        });

      const getResponse = await request(BASE_URL)
        .get(`/api/countdowns/${createResponse.body.data.slug}`);

      expect(getResponse.body.data.timeRemaining.status).toBe('upcoming');
    });

    it('should show past status with days ago', async () => {
      const pastDate = new Date(Date.now() - 86400000); // Yesterday
      const createResponse = await request(BASE_URL)
        .post('/api/countdowns')
        .send({
          title: 'Past Event',
          targetDate: pastDate.toISOString(),
          timezone: 'UTC',
          backgroundColor: '#000000',
          textColor: '#FFFFFF',
          accentColor: '#FF0000',
          theme: 'minimal',
          isPublic: true,
        });

      const getResponse = await request(BASE_URL)
        .get(`/api/countdowns/${createResponse.body.data.slug}`);

      expect(getResponse.body.data.timeRemaining.status).toBe('past');
      expect(getResponse.body.data.timeRemaining.days).toBeGreaterThan(0);
    });
  });

  // Requirement 6: Theme customization
  describe('Requirement 6: Theme Customization', () => {
    const themes = ['minimal', 'celebration', 'elegant', 'neon'];

    themes.forEach(theme => {
      it(`should support ${theme} theme`, async () => {
        const response = await request(BASE_URL)
          .post('/api/countdowns')
          .send({
            title: `${theme} Theme Test`,
            targetDate: new Date('2024-12-31T23:59:59Z').toISOString(),
            timezone: 'UTC',
            backgroundColor: '#000000',
            textColor: '#FFFFFF',
            accentColor: '#FF0000',
            theme: theme,
            isPublic: true,
          });

        expect(response.status).toBe(201);
        expect(response.body.data.theme).toBe(theme);
      });
    });
  });
});