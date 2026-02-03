# RedwoodJS Environment Templates

## Production Environment Variables

```bash
# Database
DATABASE_URL=postgresql://username:password@host:port/database

# Authentication
JWT_SECRET=your-super-secret-jwt-key
SESSION_SECRET=your-super-secret-session-key

# Application
NODE_ENV=production
PORT=8910
API_PROXY_TARGET=http://localhost:8911

# External Services (if needed)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Timezone Configuration
DEFAULT_TIMEZONE=UTC

# CORS Configuration
CORS_ORIGIN=https://yourdomain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Monitoring (optional)
SENTRY_DSN=your-sentry-dsn
NEW_RELIC_LICENSE_KEY=your-newrelic-key
```

## Development Environment Variables

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/appointment_booking_dev

# Authentication
JWT_SECRET=dev-jwt-secret-key
SESSION_SECRET=dev-session-secret-key

# Application
NODE_ENV=development
PORT=8910
API_PROXY_TARGET=http://localhost:8911

# CORS Configuration
CORS_ORIGIN=http://localhost:8910

# Logging
LOG_LEVEL=debug
LOG_FORMAT=pretty
```

## Test Environment Variables

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/appointment_booking_test

# Authentication
JWT_SECRET=test-jwt-secret-key
SESSION_SECRET=test-session-secret-key

# Application
NODE_ENV=test
PORT=8910
API_PROXY_TARGET=http://localhost:8911

# Logging
LOG_LEVEL=error
LOG_FORMAT=json
```
