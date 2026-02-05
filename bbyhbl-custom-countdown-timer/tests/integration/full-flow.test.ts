import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';

const API_URL = process.env.API_URL;
const BASE_URL = API_URL ?? 'http://localhost:3001';
const describeApi = API_URL ? describe : describe.skip;

async function waitForApiReady() {
  const deadline = Date.now() + 60_000;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const resp = await request(BASE_URL).get('/');
      if (resp.status >= 200 && resp.status < 500) return;
      lastError = new Error(`API not ready: HTTP ${resp.status}`);
    } catch (e) {
      lastError = e;
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 500);
      (timer as any).unref?.();
    });
  }

  throw lastError ?? new Error('API not ready');
}

describeApi('Integration - Full Flow', () => {
  beforeAll(async () => {
    await waitForApiReady();
  }, 60_000);

  it('registers, logs in (Passport local), creates private countdown, and enforces privacy', async () => {
    const unique = Date.now() + Math.floor(Math.random() * 1000);
    const email = `flow${unique}@test.com`;
    const username = `flowuser${unique}`;
    const password = 'SecurePass123!';

    const register = await request(BASE_URL)
      .post('/api/auth/register')
      .send({ email, username, password });
    expect(register.status).toBe(201);

    const login = await request(BASE_URL)
      .post('/api/auth/login')
      .send({ email, password });
    expect(login.status).toBe(200);
    expect(login.body.data).toHaveProperty('token');
    const token = login.body.data.token;

    const createPrivate = await request(BASE_URL)
      .post('/api/countdowns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Private Milestone',
        description: 'Only me',
        targetDate: new Date(Date.now() + 5 * 86400000).toISOString(),
        timezone: 'UTC',
        backgroundColor: '#000000',
        textColor: '#FFFFFF',
        accentColor: '#00FF00',
        theme: 'neon',
        isPublic: false,
      });
    expect(createPrivate.status).toBe(201);
    const { slug, id } = createPrivate.body.data;

    // Public access should be forbidden
    const publicGet = await request(BASE_URL).get(`/api/countdowns/${slug}`);
    expect(publicGet.status).toBe(403);

    // Owner access should succeed
    const ownerGet = await request(BASE_URL)
      .get(`/api/countdowns/${slug}`)
      .set('Authorization', `Bearer ${token}`);
    expect(ownerGet.status).toBe(200);
    expect(ownerGet.body.data.id).toBe(id);

    // Dashboard listing should include it
    const mine = await request(BASE_URL)
      .get('/api/countdowns/user/mine')
      .set('Authorization', `Bearer ${token}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data.some((c: any) => c.id === id)).toBe(true);
  });

  it('creates a public countdown accessible without auth and visible in /public browse', async () => {
    const createPublic = await request(BASE_URL)
      .post('/api/countdowns')
      .send({
        title: 'Public Holiday',
        description: 'Anyone can view',
        targetDate: new Date(Date.now() + 10 * 86400000).toISOString(),
        timezone: 'UTC',
        backgroundColor: '#003366',
        textColor: '#FFFFFF',
        accentColor: '#CC0000',
        theme: 'celebration',
        isPublic: true,
      });
    expect(createPublic.status).toBe(201);
    const slug = createPublic.body.data.slug;

    const get = await request(BASE_URL).get(`/api/countdowns/${slug}`);
    expect(get.status).toBe(200);
    expect(get.body.data.isPublic).toBe(true);

    const browse = await request(BASE_URL).get('/api/countdowns/public');
    expect(browse.status).toBe(200);
    const found = browse.body.data.some((c: any) => c.slug === slug);
    expect(found).toBe(true);
  });
});
