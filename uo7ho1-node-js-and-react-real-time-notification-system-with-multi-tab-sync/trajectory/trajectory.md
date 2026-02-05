# Real-time Notification System - Development Trajectory

## Project Overview

This project implements a comprehensive real-time notification system for a project management application. The system supports WebSocket-based real-time updates, multi-tab synchronization, offline recovery, and accessibility features.

## Technology Stack

- **Backend**: Node.js 20+, Express 4.x, Socket.io 4.x
- **Database**: PostgreSQL 15+ with Prisma ORM
- **Frontend**: React 18+, TypeScript 5.x
- **State Management**: Zustand with persistence middleware
- **Data Fetching**: React Query (TanStack Query)
- **Testing**: Vitest

## Requirements Implementation

### Requirement 1: Socket.io Session Cookie Authentication

**Implementation**: The Socket.io server authenticates connections by parsing session cookies from the handshake headers.

**Key Files**:
- `repository_after/backend/src/socket.ts` - Socket authentication middleware

**Approach**:
1. Parse cookies from `socket.handshake.headers.cookie`
2. Extract `session_id` cookie
3. Validate session against database
4. Reject connections with invalid/expired sessions
5. Explicitly reject URLs containing `token` or `auth` query parameters

```typescript
io.use(async (socket, next) => {
  const cookieHeader = socket.handshake.headers.cookie;
  const cookies = cookie.parse(cookieHeader);
  const sessionId = cookies['session_id'];
  // Validate session...
});
```

### Requirement 2: Exponential Backoff Reconnection

**Implementation**: Socket.io client configured with increasing delays starting at 1s, doubling up to 30s max, with random jitter.

**Key Files**:
- `repository_after/shared/utils.ts` - Pure utility function (testable)
- `repository_after/frontend/src/hooks/useSocket.ts` - Imports and uses the utility

**Approach**:
```typescript
// In shared/utils.ts - imported by both frontend and tests
export const calculateReconnectDelay = (attempt: number): number => {
  const baseDelay = 1000;
  const maxDelay = 30000;
  const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.floor(exponentialDelay + jitter);
};
```

Jitter prevents thundering herd when many clients reconnect simultaneously.

### Requirement 3: Single Tab Toast Display

**Implementation**: Uses BroadcastChannel API to coordinate toast display across tabs.

**Key Files**:
- `repository_after/frontend/src/hooks/useBroadcastChannel.ts`
- `repository_after/frontend/src/components/ToastContainer.tsx`

**Approach**:
1. First tab to receive notification broadcasts `toast-shown` message
2. Other tabs track shown notification IDs
3. `shouldShowToast()` returns false if notification already shown elsewhere

### Requirement 4: Multi-tab Read State Sync

**Implementation**: Read state synced via socket events and BroadcastChannel within 500ms.

**Key Files**:
- `repository_after/frontend/src/stores/notificationStore.ts`
- `repository_after/frontend/src/hooks/useBroadcastChannel.ts`
- `repository_after/frontend/src/components/NotificationList.tsx`
- `repository_after/frontend/src/components/ToastContainer.tsx`

**Approach**:
1. Optimistic UI update before server confirmation (store update)
2. Broadcast to other tabs via BroadcastChannel
3. **Persist to server via REST API** (`markAsRead` from `useNotifications`)
4. Server broadcasts `notification:updated` to all user's connections
5. Server broadcasts authoritative `unread-count:changed`

**Critical Implementation Detail**:
Both `NotificationList` and `ToastContainer` must call the REST API when marking as read:
```typescript
const handleMarkAsRead = useCallback((notificationId: string) => {
  storeMarkAsRead(notificationId);    // Optimistic update
  broadcastRead(notificationId);       // Broadcast to other tabs
  markAsRead(notificationId);          // Persist to server via REST API
}, [storeMarkAsRead, broadcastRead, markAsRead]);
```

### Requirement 5: Offline Notification Recovery

**Implementation**: Last notification ID persisted in localStorage via Zustand persist middleware.

**Key Files**:
- `repository_after/frontend/src/stores/notificationStore.ts`
- `repository_after/backend/src/services/notificationService.ts`

**Approach**:
1. Store `lastNotificationId` in persisted Zustand state
2. On reconnect, emit `get-missed` event with last ID
3. Server fetches notifications created after that ID
4. Client receives via `missed-notifications` event

### Requirement 6: Concurrent Mark-as-Read Accuracy

**Implementation**: Server is authoritative source for unread count.

**Key Files**:
- `repository_after/backend/src/socket.ts`
- `repository_after/backend/src/routes/notifications.ts`

**Approach**:
1. After any mark-as-read operation, server calculates actual unread count
2. Server broadcasts `unread-count:changed` with authoritative count
3. Client-side count is always overwritten by server value
4. `setUnreadCount` uses `Math.max(0, count)` to prevent negative values

### Requirement 7: Connection Status Indicator

**Implementation**: Visual indicator with three states and ARIA live region.

**Key Files**:
- `repository_after/frontend/src/components/ConnectionStatus.tsx`

**States**:
- Connected: Green dot (#22c55e)
- Reconnecting: Yellow pulsing dot (#eab308)
- Disconnected: Red dot (#ef4444)

**Accessibility**:
```tsx
<span role="status" aria-live="polite" aria-atomic="true">
  Connection status: {config.label}
</span>
```

### Requirement 8: Cursor-based Pagination

**Implementation**: GET /api/notifications uses cursor-based pagination.

**Key Files**:
- `repository_after/backend/src/routes/notifications.ts`
- `repository_after/backend/src/services/notificationService.ts`

**API Response**:
```typescript
{
  data: Notification[],
  nextCursor: string | null,
  hasMore: boolean
}
```

Cursor is the `createdAt` timestamp of the last notification in the page.

### Requirement 9: Prefers-reduced-motion Support

**Implementation**: Check system preference and disable animations accordingly.

**Key Files**:
- `repository_after/frontend/src/hooks/useReducedMotion.ts`
- `repository_after/frontend/src/components/Toast.tsx`

**Approach**:
```typescript
const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
// Apply .reduced-motion class when true
```

CSS:
```css
.toast.reduced-motion {
  animation: none;
  animation-duration: 0ms;
}
```

### Requirement 10: Event Listener Cleanup

**Implementation**: All useEffect hooks return cleanup functions.

**Key Files**:
- `repository_after/frontend/src/hooks/useSocket.ts`
- `repository_after/frontend/src/hooks/useBroadcastChannel.ts`
- `repository_after/frontend/src/components/NotificationList.tsx`

**Approach**:
```typescript
useEffect(() => {
  socket.on('event', handler);
  return () => {
    socket.off('event', handler);
    socket.disconnect();
  };
}, []);
```

### Requirement 11: Notification Bell Badge

**Implementation**: Badge with specific display rules and accessibility.

**Key Files**:
- `repository_after/frontend/src/components/NotificationBell.tsx`

**Rules**:
- Count 1-99: Show actual number
- Count 100+: Show "99+"
- Count 0: Hide badge completely (not "0")

**Accessibility**: White (#ffffff) on red (#dc2626) = 4.6:1 contrast ratio (meets WCAG AA)

### Requirement 12: Infinite Scroll

**Implementation**: Intersection Observer watching sentinel element.

**Key Files**:
- `repository_after/frontend/src/components/NotificationList.tsx`
- `repository_after/frontend/src/hooks/useNotifications.ts`

**Approach**:
1. Sentinel element at end of list
2. IntersectionObserver triggers `loadMore()` when visible
3. Guards prevent fetch if `!hasMore` or `isFetching`
4. Observer cleanup on unmount

### Requirement 13: Prisma Schema Indexes

**Implementation**: Composite indexes for efficient queries.

**Key Files**:
- `repository_after/backend/prisma/schema.prisma`

```prisma
model Notification {
  // ... fields ...

  @@index([userId, createdAt(sort: Desc)])  // Pagination
  @@index([userId, isRead])                  // Unread count
}
```

### Requirement 14: N+1 Query Prevention

**Implementation**: Batch fetch related resources by type.

**Key Files**:
- `repository_after/backend/src/services/notificationService.ts`

**Approach**:
1. Group notification resource IDs by type (task, project, comment)
2. Batch fetch each type in parallel with `Promise.all`
3. Create lookup maps
4. Attach resources to notifications

```typescript
const [tasks, projects, comments] = await Promise.all([
  prisma.task.findMany({ where: { id: { in: taskIds } } }),
  prisma.project.findMany({ where: { id: { in: projectIds } } }),
  prisma.comment.findMany({ where: { id: { in: commentIds } } }),
]);
```

### Requirement 15: Toast Auto-dismiss and Interaction

**Implementation**: 5-second auto-dismiss with hover pause and keyboard accessibility.

**Key Files**:
- `repository_after/frontend/src/components/Toast.tsx`

**Features**:
- Auto-dismiss after 5 seconds
- Pause timer on hover, resume on mouse leave
- Click body: navigate to resource, mark as read, dismiss
- Close button: keyboard accessible with visible focus indicator
- Supports Enter/Space key events

## Test Coverage

55 tests covering all 15 requirements.

**Tests import actual code from repository_after** via `shared/utils.ts`:
- `calculateReconnectDelay` - Exponential backoff with jitter
- `parseCookies` - Cookie parsing
- `validateUrlForAuth` - URL token validation
- `validateSession` - Session validation
- `clampUnreadCount` - Ensure non-negative counts
- `getBadgeText`, `shouldShowBadge` - Badge display logic
- `getLuminance`, `getContrastRatio` - WCAG contrast calculation
- `CONNECTION_STATUS_CONFIG` - Connection status configuration
- `getToastClasses` - Reduced motion support
- `paginateWithCursor` - Cursor-based pagination

| Requirement | Tests |
|-------------|-------|
| 1. Session Cookie Auth | 4 |
| 2. Exponential Backoff | 3 |
| 3. Single Tab Toast | 3 |
| 4. Multi-tab Sync | 4 |
| 5. Offline Recovery | 3 |
| 6. Concurrent Accuracy | 4 |
| 7. Connection Status | 4 |
| 8. Cursor Pagination | 4 |
| 9. Reduced Motion | 3 |
| 10. Listener Cleanup | 3 |
| 11. Bell Badge | 4 |
| 12. Infinite Scroll | 5 |
| 13. Prisma Indexes | 3 |
| 14. N+1 Prevention | 2 |
| 15. Toast Interaction | 6 |

## Project Structure

```
uo7ho1-node-js-and-react-real-time-notification-system-with-multi-tab-sync/
├── package.json                 # Root package with vitest
├── tsconfig.json                # TypeScript config
├── vitest.config.ts             # Test configuration
├── Dockerfile                   # Node.js container
├── docker-compose.yml           # app-after and evaluation services
├── .gitignore
├── repository_before/           # Empty (no before state)
├── repository_after/
│   ├── shared/
│   │   └── utils.ts             # Shared pure utilities (testable)
│   ├── backend/
│   │   ├── src/
│   │   │   ├── index.ts         # Express server entry
│   │   │   ├── socket.ts        # Socket.io server
│   │   │   ├── routes/
│   │   │   │   └── notifications.ts
│   │   │   ├── services/
│   │   │   │   └── notificationService.ts
│   │   │   ├── middleware/
│   │   │   │   └── auth.ts
│   │   │   └── types/
│   │   │       └── index.ts
│   │   └── prisma/
│   │       └── schema.prisma
│   └── frontend/
│       ├── src/
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   ├── components/
│       │   │   ├── NotificationBell.tsx
│       │   │   ├── NotificationList.tsx
│       │   │   ├── NotificationItem.tsx
│       │   │   ├── Toast.tsx
│       │   │   ├── ToastContainer.tsx
│       │   │   └── ConnectionStatus.tsx
│       │   ├── hooks/
│       │   │   ├── useSocket.ts
│       │   │   ├── useNotifications.ts
│       │   │   ├── useBroadcastChannel.ts
│       │   │   └── useReducedMotion.ts
│       │   ├── stores/
│       │   │   └── notificationStore.ts
│       │   ├── services/
│       │   │   └── api.ts
│       │   └── types/
│       │       └── index.ts
│       └── index.html
├── tests/
│   └── notification.test.ts     # 55 tests for all requirements
├── evaluation/
│   └── evaluation.js            # Generates timestamped reports
├── instances/
│   └── instance.json            # PASS_TO_PASS configuration
└── trajectory/
    └── trajectory.md            # This file
```

## Key Design Decisions

1. **Zustand over Redux**: Simpler API with built-in persist middleware for localStorage
2. **React Query for server state**: Handles caching, pagination, and background refetching
3. **BroadcastChannel over SharedWorker**: Better browser support, simpler API
4. **Cursor-based over offset pagination**: Consistent results when data changes during pagination
5. **Server-authoritative unread count**: Prevents race conditions in concurrent updates
6. **HTTP-only cookies for auth**: Prevents XSS attacks from accessing tokens
7. **Shared utilities module**: Pure functions extracted to `shared/utils.ts` for testability - tests import and verify actual implementation code

## Critical Implementation Notes

**Mark-as-Read Must Persist to Server**: When marking a notification as read from the UI (NotificationList or ToastContainer), the implementation must:
1. Update local store (optimistic)
2. Broadcast to other tabs (BroadcastChannel)
3. **Call REST API** (`markAsRead` from `useNotifications`)

Without step 3, state does not persist on refresh and server is not the source of truth.

## Accessibility Features

- ARIA live region for connection status announcements
- Keyboard navigation for notification list
- Focus indicators on interactive elements
- Color contrast ratio ≥4.5:1 for badge
- Prefers-reduced-motion support for toasts
- Screen reader labels for all interactive elements
