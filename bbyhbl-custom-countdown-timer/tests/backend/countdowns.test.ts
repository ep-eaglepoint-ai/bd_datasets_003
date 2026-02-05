import request from 'supertest';
import { describe, it, expect } from '@jest/globals';

const API_URL = process.env.API_URL;
const BASE_URL = API_URL ?? 'http://localhost:3001';
const describeApi = API_URL ? describe : describe.skip;

async function waitForApiReady() {
  const deadline = Date.now() + 45_000;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const resp = await fetch(`${BASE_URL}/`);
      if (resp.ok) return;
      lastError = new Error(`API not ready: HTTP ${resp.status}`);
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  throw lastError ?? new Error('API not ready');
}

type Theme = 'minimal' | 'celebration' | 'elegant' | 'neon';

async function registerAndLogin() {
  const unique = Date.now() + Math.floor(Math.random() * 1000);
  const email = `user${unique}@test.com`;
  const username = `testuser${unique}`;
  const password = 'SecurePass123!';

  const register = await request(BASE_URL).post('/api/auth/register').send({ email, username, password });
  expect([201, 400]).toContain(register.status);

  const login = await request(BASE_URL).post('/api/auth/login').send({ email, password });
  expect(login.status).toBe(200);
  expect(login.body?.data?.token).toBeTruthy();

  return { token: login.body.data.token as string, email, username, password };
}

async function createCountdown(opts: {
  token?: string;
  title: string;
  targetDate: string;
  timezone?: string;
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
  theme?: Theme;
  isPublic?: boolean;
  backgroundImage?: string;
}) {
  const req = request(BASE_URL).post('/api/countdowns');
  const withAuth = opts.token ? req.set('Authorization', `Bearer ${opts.token}`) : req;

  return await withAuth.send({
    title: opts.title,
    targetDate: opts.targetDate,
    timezone: opts.timezone ?? 'UTC',
    backgroundColor: opts.backgroundColor ?? '#000000',
    textColor: opts.textColor ?? '#FFFFFF',
    accentColor: opts.accentColor ?? '#3B82F6',
    theme: opts.theme ?? 'minimal',
    backgroundImage: opts.backgroundImage,
    isPublic: opts.isPublic ?? true,
  });
}

describeApi('Countdown API - Requirements', () => {
  beforeAll(async () => {
    await waitForApiReady();
  });

  // Requirement 1
  it('creates a countdown with required fields + timezone + customization', async () => {
    const resp = await createCountdown({
      title: 'My Birthday',
      targetDate: new Date(Date.now() + 86400000).toISOString(),
      timezone: 'UTC',
      backgroundColor: '#000000',
      textColor: '#FFFFFF',
      accentColor: '#3B82F6',
      theme: 'minimal',
      isPublic: true,
    });

    expect(resp.status).toBe(201);
    expect(resp.body.success).toBe(true);
    expect(resp.body.data.title).toBe('My Birthday');
    expect(resp.body.data).toHaveProperty('slug');
    expect(resp.body.data).toHaveProperty('shareUrl');
  });

  it('validates required fields and color format (edge cases)', async () => {
    const missingTitle = await request(BASE_URL)
      .post('/api/countdowns')
      .send({
        targetDate: new Date().toISOString(),
        timezone: 'UTC',
        backgroundColor: '#000000',
        textColor: '#FFFFFF',
        accentColor: '#3B82F6',
        theme: 'minimal',
        isPublic: true,
      });
    expect([400, 422]).toContain(missingTitle.status);

    const badColor = await request(BASE_URL)
      .post('/api/countdowns')
      .send({
        title: 'Bad Color',
        targetDate: new Date().toISOString(),
        timezone: 'UTC',
        backgroundColor: 'black',
        textColor: '#FFFFFF',
        accentColor: '#3B82F6',
        theme: 'minimal',
        isPublic: true,
      });
    expect([400, 422]).toContain(badColor.status);
  });

  // Requirement 2
  it('returns days/hours/minutes/seconds breakdown with status', async () => {
    const create = await createCountdown({
      title: 'Display Test',
      targetDate: new Date(Date.now() + 2 * 86400000).toISOString(),
      theme: 'elegant',
      isPublic: true,
    });
    expect(create.status).toBe(201);

    const slug = create.body.data.slug;
    const getResp = await request(BASE_URL).get(`/api/countdowns/${slug}`);

    expect(getResp.status).toBe(200);
    expect(getResp.body.data).toHaveProperty('timeRemaining');
    expect(getResp.body.data.timeRemaining).toEqual(
      expect.objectContaining({
        days: expect.any(Number),
        hours: expect.any(Number),
        minutes: expect.any(Number),
        seconds: expect.any(Number),
        totalSeconds: expect.any(Number),
        status: expect.stringMatching(/upcoming|happening|past/),
      })
    );
  });

  // Requirement 3
  it('generates unique slugs and allows public viewing without auth', async () => {
    const resp1 = await createCountdown({
      title: 'Countdown A',
      targetDate: new Date(Date.now() + 100000000).toISOString(),
      isPublic: true,
    });
    const resp2 = await createCountdown({
      title: 'Countdown B',
      targetDate: new Date(Date.now() + 100000000).toISOString(),
      isPublic: true,
    });

    expect(resp1.status).toBe(201);
    expect(resp2.status).toBe(201);
    expect(resp1.body.data.slug).not.toBe(resp2.body.data.slug);

    const viewResp = await request(BASE_URL).get(`/api/countdowns/${resp1.body.data.slug}`);
    expect(viewResp.status).toBe(200);
    expect(viewResp.body.data.title).toBe('Countdown A');
  });

  it('enforces private countdowns are not accessible without auth, but accessible to owner (edge case)', async () => {
    const { token } = await registerAndLogin();
    const create = await createCountdown({
      token,
      title: 'Private Event',
      targetDate: new Date(Date.now() + 86400000).toISOString(),
      timezone: 'America/New_York',
      accentColor: '#00FF00',
      theme: 'neon',
      isPublic: false,
    });
    expect(create.status).toBe(201);

    const slug = create.body.data.slug;
    const noAuthGet = await request(BASE_URL).get(`/api/countdowns/${slug}`);
    expect(noAuthGet.status).toBe(403);

    const ownerGet = await request(BASE_URL)
      .get(`/api/countdowns/${slug}`)
      .set('Authorization', `Bearer ${token}`);
    expect(ownerGet.status).toBe(200);
    expect(ownerGet.body.data.isPublic).toBe(false);
  });

  // Requirement 4
  it('returns logged-in user countdowns sorted by nearest upcoming date, then most recent past', async () => {
    const { token } = await registerAndLogin();

    const soon = new Date(Date.now() + 2 * 3600 * 1000);
    const later = new Date(Date.now() + 2 * 86400000);
    const pastRecent = new Date(Date.now() - 1 * 86400000);
    const pastOld = new Date(Date.now() - 5 * 86400000);

    const createSoon = await createCountdown({ token, title: 'Soon', targetDate: soon.toISOString(), isPublic: false });
    const createLater = await createCountdown({ token, title: 'Later', targetDate: later.toISOString(), isPublic: false });
    const createPastRecent = await createCountdown({ token, title: 'Past Recent', targetDate: pastRecent.toISOString(), isPublic: false });
    const createPastOld = await createCountdown({ token, title: 'Past Old', targetDate: pastOld.toISOString(), isPublic: false });

    expect(createSoon.status).toBe(201);
    expect(createLater.status).toBe(201);
    expect(createPastRecent.status).toBe(201);
    expect(createPastOld.status).toBe(201);

    const mine = await request(BASE_URL)
      .get('/api/countdowns/user/mine')
      .set('Authorization', `Bearer ${token}`);

    expect(mine.status).toBe(200);
    const titles: string[] = mine.body.data.map((c: any) => c.title);

    // Upcoming first sorted asc
    expect(titles.indexOf('Soon')).toBeGreaterThanOrEqual(0);
    expect(titles.indexOf('Later')).toBeGreaterThanOrEqual(0);
    expect(titles.indexOf('Soon')).toBeLessThan(titles.indexOf('Later'));

    // Past comes after upcoming and is sorted by most recent past first
    expect(titles.indexOf('Past Recent')).toBeGreaterThan(titles.indexOf('Later'));
    expect(titles.indexOf('Past Old')).toBeGreaterThan(titles.indexOf('Later'));
    expect(titles.indexOf('Past Recent')).toBeLessThan(titles.indexOf('Past Old'));
  });

  // Requirement 5
  it('supports reset (PATCH targetDate) and archive (PATCH isArchived), and archived countdowns disappear', async () => {
    const { token } = await registerAndLogin();

    const create = await createCountdown({
      token,
      title: 'Manage Me',
      targetDate: new Date(Date.now() + 30 * 1000).toISOString(),
      theme: 'celebration',
      isPublic: false,
    });
    expect(create.status).toBe(201);

    const id = create.body.data.id;
    const slug = create.body.data.slug;

    const get1 = await request(BASE_URL)
      .get(`/api/countdowns/${slug}`)
      .set('Authorization', `Bearer ${token}`);
    expect(get1.status).toBe(200);
    expect(get1.body.data.timeRemaining.status).toMatch(/upcoming|happening/);

    const resetTo = new Date(Date.now() + 10 * 86400000);
    const patchReset = await request(BASE_URL)
      .patch(`/api/countdowns/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ targetDate: resetTo.toISOString() });
    expect(patchReset.status).toBe(200);

    const patchArchive = await request(BASE_URL)
      .patch(`/api/countdowns/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isArchived: true });
    expect(patchArchive.status).toBe(200);
    expect(patchArchive.body.data.isArchived).toBe(true);

    const mine = await request(BASE_URL)
      .get('/api/countdowns/user/mine')
      .set('Authorization', `Bearer ${token}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data.some((c: any) => c.id === id)).toBe(false);

    const getArchived = await request(BASE_URL)
      .get(`/api/countdowns/${slug}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getArchived.status).toBe(404);
  });

  // Requirement 6
  it('supports preset themes and custom colors', async () => {
    const themes: Theme[] = ['minimal', 'celebration', 'elegant', 'neon'];
    for (const theme of themes) {
      const resp = await createCountdown({
        title: `${theme} Theme`,
        targetDate: new Date(Date.now() + 20 * 86400000).toISOString(),
        theme,
        backgroundColor: '#112233',
        textColor: '#FFFFFF',
        accentColor: '#FF00FF',
        isPublic: true,
      });
      expect(resp.status).toBe(201);
      expect(resp.body.data.theme).toBe(theme);
      expect(resp.body.data.backgroundColor).toBe('#112233');
      expect(resp.body.data.accentColor).toBe('#FF00FF');
    }
  });
});