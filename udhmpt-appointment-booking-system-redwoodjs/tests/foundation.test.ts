import fs from 'fs';
import path from 'path';
import { Role, requireRole, User } from '../repository_after/api/src/lib/auth';
import { localToUTC, addHoursLocalDSTSafe, utcToLocal } from '../repository_after/api/src/lib/time';
import { DateTime } from 'luxon';

const ROOT = path.resolve(__dirname, '..');
const REPO_AFTER = path.join(ROOT, 'repository_after');

describe('Environment Sanity and Security Foundation', () => {
  test('Project structure and security primitives are valid', () => {
    // 1. Prisma schema check
    const schemaPath = path.join(REPO_AFTER, 'api', 'db', 'schema.prisma');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    expect(schema).toMatch(/model\s+User[\s\S]*role\s+String/);
    expect(schema).toContain('role      String   @default("CUSTOMER")');

    // 2. Auth role enforcement
    expect(typeof Role).toBe('object');
    const bUser: User = { id: 1, email: 'p@example.com', role: Role.PROVIDER };
    expect(requireRole(bUser, [Role.PROVIDER])).toBe(true);
    expect(() => requireRole(bUser, [Role.CUSTOMER])).toThrow('Forbidden');

    // 3. Folder structure
    expect(fs.existsSync(path.join(REPO_AFTER, 'api'))).toBe(true);
    expect(fs.existsSync(path.join(REPO_AFTER, 'web'))).toBe(true);
  });

  test('Time utilities handle conversions and DST boundaries', () => {
    const local = '2021-03-14T01:30:00';
    const tz = 'America/New_York';
    const utc = localToUTC(local, tz);
    expect(DateTime.fromISO(utcToLocal(utc, tz), { setZone: true }).toFormat("yyyy-MM-dd'T'HH:mm:ss")).toBe(local);

    const added = addHoursLocalDSTSafe(local, 1, tz);
    expect(DateTime.fromISO(added, { zone: tz }).hour).toBe(3);
  });
});
