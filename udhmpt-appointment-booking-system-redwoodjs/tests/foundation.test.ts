import fs from 'fs';
import path from 'path';
import { Role, requireRole, User } from '../repository_after/api/src/lib/auth';
import { localToUTC, addHoursLocalDSTSafe, utcToLocal } from '../repository_after/api/src/lib/time';
import { DateTime } from 'luxon';

const ROOT = path.resolve(__dirname, '..');
const REPO_AFTER = path.join(ROOT, 'repository_after');

describe('Foundation: Prisma, Auth, Time utils, and separation', () => {
  test('Prisma schema contains User model with role field', () => {
    const schemaPath = path.join(REPO_AFTER, 'api', 'prisma', 'schema.prisma');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    // SQLite doesn't support enums, so check for String role field
    expect(schema).toMatch(/model\s+User[\s\S]*role\s+String/);
    // Check that role field exists and has default CUSTOMER
    expect(schema).toContain('role      String   @default("CUSTOMER")');
  });

  test('Auth roles exist as enums and requireRole enforces access', () => {
    // Role should be an object (TypeScript enum compiled shape)
    expect(typeof Role).toBe('object');
    const provider: User = { id: 1, email: 'p@example.com', role: Role.PROVIDER };
    expect(requireRole(provider, [Role.PROVIDER])).toBe(true);
    expect(() => requireRole(provider, [Role.CUSTOMER])).toThrow('Forbidden');
    expect(() => requireRole(null, [Role.ADMIN])).toThrow('Not authenticated');
  });

  test('Time utilities convert local -> UTC and back, and handle DST safely', () => {
    // Example: US daylight savings start 2021-03-14 in America/New_York
    const local = '2021-03-14T01:30:00';
    const tz = 'America/New_York';

    const utc = localToUTC(local, tz);
    const back = utcToLocal(utc, tz);
    // Roundtrip: local -> UTC -> back -> UTC again should equal first UTC (env-agnostic)
    const utc2 = localToUTC(back, tz);
    expect(utc2).toBe(utc);

    // Adding 1 hour across the spring-forward DST boundary should land at 3:30 local
    const added = addHoursLocalDSTSafe(local, 1, tz);
    const addedDt = DateTime.fromISO(added, { zone: tz });
    expect(addedDt.isValid).toBe(true);
    expect(addedDt.hour).toBe(3);
    expect(addedDt.minute).toBe(30);
  });

  test('API/Web separation: repository_after contains api and web folders', () => {
    const apiPath = path.join(REPO_AFTER, 'api');
    const webPath = path.join(REPO_AFTER, 'web');
    expect(fs.existsSync(apiPath)).toBe(true);
    expect(fs.existsSync(webPath)).toBe(true);
  });
});
