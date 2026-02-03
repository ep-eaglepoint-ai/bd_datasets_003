// Shared utility functions
// Extracted for testability - used by both frontend and backend

/**
 * Calculate reconnection delay with exponential backoff and jitter
 * Requirement 2: Exponential backoff (1s to 30s max) with jitter to prevent thundering herd
 */
export const calculateReconnectDelay = (attempt: number): number => {
  // Base delay starts at 1000ms (1 second)
  const baseDelay = 1000;
  // Max delay is 30000ms (30 seconds)
  const maxDelay = 30000;

  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
  const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

  // Add random jitter (±25%) to prevent thundering herd
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);

  return Math.floor(exponentialDelay + jitter);
};

/**
 * Parse cookie header string into key-value object
 * Requirement 1: Cookie-based authentication
 */
export const parseCookies = (cookieHeader: string): Record<string, string> => {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...valueParts] = cookie.trim().split('=');
    if (name) {
      cookies[name] = valueParts.join('=');
    }
  });
  return cookies;
};

/**
 * Check if URL contains authentication tokens (not allowed for WebSocket)
 * Requirement 1: Tokens must not be in WebSocket URL
 */
export const validateUrlForAuth = (url: string): { allowed: boolean; error?: string } => {
  try {
    const urlObj = new URL(url, 'http://localhost');
    if (urlObj.searchParams.has('token') || urlObj.searchParams.has('auth')) {
      return { allowed: false, error: 'Authentication tokens in URL are not allowed' };
    }
    return { allowed: true };
  } catch {
    return { allowed: false, error: 'Invalid URL' };
  }
};

/**
 * Validate session object
 * Requirement 1: Reject invalid or expired sessions
 */
export const validateSession = (
  session: { userId: string; expiresAt: Date } | null | undefined
): { valid: boolean; userId?: string; error?: string } => {
  if (!session) {
    return { valid: false, error: 'Authentication error: Invalid session' };
  }
  if (session.expiresAt < new Date()) {
    return { valid: false, error: 'Authentication error: Session expired' };
  }
  return { valid: true, userId: session.userId };
};

/**
 * Ensure unread count is never negative
 * Requirement 6: Server authoritative for unread count
 */
export const clampUnreadCount = (count: number): number => {
  return Math.max(0, count);
};

/**
 * Get badge display text for notification count
 * Requirement 11: Show 99+ for counts over 99
 */
export const getBadgeText = (count: number): string => {
  if (count <= 0) return '';
  if (count > 99) return '99+';
  return count.toString();
};

/**
 * Check if badge should be visible
 * Requirement 11: Hide badge when count is zero
 */
export const shouldShowBadge = (count: number): boolean => {
  return count > 0;
};

/**
 * Calculate relative luminance for WCAG contrast
 * Requirement 11: Color contrast ratio of at least 4.5:1
 */
export const getLuminance = (r: number, g: number, b: number): number => {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
};

/**
 * Calculate contrast ratio between two luminance values
 * Requirement 11: WCAG AA requires at least 4.5:1
 */
export const getContrastRatio = (l1: number, l2: number): number => {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
};

/**
 * Connection status configuration
 * Requirement 7: Visual status indicator
 */
export const CONNECTION_STATUS_CONFIG = {
  connected: { color: '#22c55e', label: 'Connected', pulse: false },
  reconnecting: { color: '#eab308', label: 'Reconnecting', pulse: true },
  disconnected: { color: '#ef4444', label: 'Disconnected', pulse: false },
} as const;

export type ConnectionStatusType = keyof typeof CONNECTION_STATUS_CONFIG;

/**
 * Get CSS classes for toast based on reduced motion preference
 * Requirement 9: prefers-reduced-motion support
 */
export const getToastClasses = (prefersReducedMotion: boolean): string[] => {
  const classes = ['toast'];
  if (prefersReducedMotion) {
    classes.push('reduced-motion');
  }
  return classes;
};

/**
 * Cursor-based pagination helper
 * Requirement 8: Cursor-based pagination
 */
export interface PaginationResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const paginateWithCursor = <T extends { createdAt: string }>(
  items: T[],
  cursor: string | null,
  limit: number
): PaginationResult<T> => {
  let filtered = items;

  if (cursor) {
    const cursorDate = new Date(cursor);
    filtered = items.filter((item) => new Date(item.createdAt) < cursorDate);
  }

  const data = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;
  const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].createdAt : null;

  return { data, nextCursor, hasMore };
};
