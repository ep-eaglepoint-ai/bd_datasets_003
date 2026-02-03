import { createProviderProfile, createService } from '../repository_after/api/src/services/providers/providers';
import { Role, User } from '../repository_after/api/src/lib/auth';

describe('Provider onboarding', () => {
  const providerUser: User = { id: 10, email: 'prov@example.com', role: Role.PROVIDER };
  const customerUser: User = { id: 11, email: 'cust@example.com', role: Role.CUSTOMER };
  const adminUser: User = { id: 12, email: 'admin@example.com', role: Role.ADMIN };

  test('Provider cannot create services without profile', async () => {
    const prismaMock = {
      providerProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      service: { create: jest.fn() },
    };

    await expect(createService(providerUser, { name: 'Test', durationMinutes: 30 }, prismaMock as any)).rejects.toThrow('Provider profile does not exist');
  });

  test('Customer/Admin cannot create provider services', async () => {
    const prismaMock = {
      providerProfile: { findUnique: jest.fn(), create: jest.fn() },
      service: { create: jest.fn() },
    };

    await expect(createService(customerUser as any, { name: 'X', durationMinutes: 30 }, prismaMock as any)).rejects.toThrow('Forbidden');
    await expect(createService(adminUser as any, { name: 'X', durationMinutes: 30 }, prismaMock as any)).rejects.toThrow('Forbidden');
  });

  test('Duration validation (positive, realistic bounds)', async () => {
    const profile = { id: 5, userId: providerUser.id };
    const prismaMock = {
      providerProfile: { findUnique: jest.fn().mockResolvedValue(profile), create: jest.fn() },
      service: { create: jest.fn().mockImplementation((args: any) => args.data) },
    };

    await expect(createService(providerUser, { name: 'TooSmall', durationMinutes: 0 }, prismaMock as any)).rejects.toThrow();
    await expect(createService(providerUser, { name: 'TooLarge', durationMinutes: 10000 }, prismaMock as any)).rejects.toThrow();

    const ok = await createService(providerUser, { name: 'Good', durationMinutes: 60 }, prismaMock as any);
    expect(ok.durationMinutes).toBe(60);
  });

  test('Capacity defaults to 1 and must be non-nullable', async () => {
    const profile = { id: 6, userId: providerUser.id };
    const prismaMock = {
      providerProfile: { findUnique: jest.fn().mockResolvedValue(profile), create: jest.fn() },
      service: { create: jest.fn().mockImplementation((args: any) => args.data) },
    };

    const created = await createService(providerUser, { name: 'Group', durationMinutes: 45 }, prismaMock as any);
    expect(created.capacity).toBe(1);

    const createdWithCap = await createService(providerUser, { name: 'Group', durationMinutes: 45, capacity: 5 }, prismaMock as any);
    expect(createdWithCap.capacity).toBe(5);
  });
});
