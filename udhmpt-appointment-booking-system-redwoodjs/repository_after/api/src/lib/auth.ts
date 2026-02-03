export enum Role {
  PROVIDER = 'PROVIDER',
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
}

export type User = {
  id: number;
  email: string;
  role: Role;
};

export function requireRole(user: User | null, allowed: Role[]) {
  if (!user) {
    throw new Error('Not authenticated');
  }
  if (!allowed.includes(user.role)) {
    throw new Error('Forbidden');
  }
  return true;
}
