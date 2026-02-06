# Trajectory (Weather Dashboard Full-Stack Development)

## 1. Audit Requirements & Define Contracts

I audited the task requirements for the Weather Dashboard application. The system requires:
- **Backend**: Express server proxying weather API requests
- **Frontend**: React application with search, display, favorites, and temperature toggle
- **API Contract**: GET /api/weather and GET /api/forecast endpoints
- **Error Handling**: 404 for invalid cities, 503 for service unavailable
- **Persistence**: localStorage for favorites and temperature unit preference

## 2. Define Technical Contracts

**API Contracts:**
- `GET /api/weather?city={name}` → Returns `{ city, temperature, condition, humidity }` (HTTP 200)
- `GET /api/forecast?city={name}` → Returns `{ city, forecast: [5 days] }` (HTTP 200)
- Invalid city → HTTP 404 with `{ message: "City not found" }`
- Service failure → HTTP 503 with `{ message: "Weather service unavailable" }`

**Data Contracts:**
- Temperature: whole number (rounded)
- Humidity: integer 0-100
- Condition: non-empty string
- Forecast: exactly 5 distinct future days in chronological order

**UX Contracts:**
- Loading indicator during API requests
- Celsius/Fahrenheit toggle without API re-fetch (F = C × 9/5 + 32)
- Favorites persistence in localStorage
- Unit preference persistence in localStorage

## 3. Design Architecture

```
repository_after/
├── backend/
│   ├── server.js          # Express app entry point
│   ├── routes/weather.js  # API route handlers
│   └── services/weatherService.js  # Weather API proxy with mock support
└── frontend/
    ├── src/
    │   ├── App.js         # Main component with state management
    │   └── components/    # UI components (SearchBar, WeatherDisplay, etc.)
    └── public/index.html
```

## 4. Implement Backend

1. Created Express server with CORS support
2. Implemented `/api/weather` endpoint with proper error handling
3. Implemented `/api/forecast` endpoint returning 5-day forecast
4. Created weather service with mock data for testing (OpenWeatherMap proxy for production)
5. Ensured proper HTTP status codes: 200 (success), 404 (city not found), 503 (service unavailable)

## 5. Implement Frontend

1. Created React components following single-responsibility principle
2. Implemented search functionality with loading states
3. Built temperature conversion logic (C ↔ F) without API calls
4. Added favorites management with duplicate prevention
5. Implemented localStorage persistence for preferences and favorites
6. Created responsive CSS styling

## 6. Write Comprehensive Tests

**Backend Tests (Jest + Supertest):**
- Requirement 1: Weather endpoint returns correct JSON structure
- Requirement 2: Data type validation (temperature, humidity, condition)
- Requirement 3-4: Forecast returns exactly 5 unique chronological days
- Requirement 5: 404 response for invalid cities
- Requirement 6-7: 503 response for service failures, distinguishable errors
- Requirement 12: Temperature rounding to whole numbers

**Frontend Tests (Jest):**
- Requirement 8-9: API calls target backend only, no exposed keys
- Requirement 10: Loading indicator behavior
- Requirement 11: Temperature conversion without network calls
- Requirement 13: Unit preference localStorage persistence
- Requirement 14: Favorites localStorage persistence with duplicate prevention
- Requirement 15: Error message differentiation

## 7. Implement Evaluation System

Created `evaluation/evaluation.js` that:
- Generates unique Run ID (UUID)
- Runs Jest tests against repository_after
- Collects pass/fail/error/skip counts
- Outputs formatted terminal results
- Saves structured JSON report with test nodeids and statuses

## 8. Docker Configuration

- **Dockerfile**: Node.js 18 Alpine base, installs all dependencies, runs evaluation
- **docker-compose.yml**: Single `app` service with volume mounts for development

## 9. Verification

Commands to verify:
```bash
docker compose build
docker compose run --rm app npx jest --verbose --forceExit
docker compose run --rm app node evaluation/evaluation.js
```

## Core Principle Applied

**Audit → Contract → Design → Execute → Verify**

This trajectory follows the same structure as refactoring but applied to full-stack development:
- Code audit became requirements & flow audit
- Performance contract became API, UX, and data contracts
- Data model refactor extended to DTOs and frontend state shape
- Query optimization mapped to API payload shaping
- Verification uses tests and evaluation runner

