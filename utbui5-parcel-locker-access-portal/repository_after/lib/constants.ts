export const LOCKER_STATUS = {
  AVAILABLE: 'AVAILABLE',
  OCCUPIED: 'OCCUPIED',
  EXPIRED: 'EXPIRED',
} as const;

export const PARCEL_STATUS = {
  OCCUPIED: 'OCCUPIED',
  COLLECTED: 'COLLECTED',
  EXPIRED: 'EXPIRED',
} as const;

export const PIN_EXPIRATION_MS = 48 * 60 * 60 * 1000;
